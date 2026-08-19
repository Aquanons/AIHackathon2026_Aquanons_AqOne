from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.ai.current_field import create_current_field_factory
from app.ai.drift import ObjectClass, predict_drift
from app.ai.search import contours_from_grid, update_posterior
from app.db import get_pool

router = APIRouter(prefix='/api/ai/drift', tags=['drift'])


class DriftPredictRequest(BaseModel):
    last_lat: float = Field(..., ge=-90, le=90)
    last_lon: float = Field(..., ge=-180, le=180)
    observed_at: datetime
    object_class: ObjectClass
    forecast_hours: float = Field(24.0, gt=0, le=72)
    particle_count: int = Field(2000, ge=100, le=10000)
    step_minutes: int = Field(10, ge=1, le=60)


class SearchSectorRequest(BaseModel):
    x_min_m: float
    x_max_m: float
    y_min_m: float
    y_max_m: float
    detection_probability: float = Field(..., gt=0.0, le=1.0)


def _incident_class(abnormal_reason: str) -> ObjectClass:
    if abnormal_reason in {'capsize', 'adverse_weather'}:
        return ObjectClass.swamped_banca
    return ObjectClass.intact_hull_adrift


async def _get_or_compute_prior(
    pool, incident_id: int, row, current_fn, forecast_hours: float,
) -> dict:
    """Return the prior grid dict, loading from DB or computing fresh."""
    prior_grid = row['prior_grid']
    if prior_grid is not None:
        return json.loads(prior_grid) if isinstance(prior_grid, str) else prior_grid

    result = predict_drift(
        last_lat=float(row['last_contact_lat']),
        last_lon=float(row['last_contact_lon']),
        observed_at=row['last_contact_at'],
        object_class=_incident_class(str(row['abnormal_reason'])),
        forecast_hours=forecast_hours,
        current_vector_fn=current_fn,
    )
    async with pool.acquire() as conn:
        await conn.execute(
            'UPDATE incidents SET prior_grid = $1, posterior_grid = $1 WHERE id = $2',
            json.dumps(result.grid),
            incident_id,
        )
    return result.grid


@router.post('/predict')
async def predict(body: DriftPredictRequest) -> dict[str, object]:
    pool = get_pool()
    current_fn = await create_current_field_factory(pool)
    result = predict_drift(
        last_lat=body.last_lat,
        last_lon=body.last_lon,
        observed_at=body.observed_at,
        object_class=body.object_class,
        forecast_hours=body.forecast_hours,
        particle_count=body.particle_count,
        step_minutes=body.step_minutes,
        current_vector_fn=current_fn,
    )
    response = result.to_dict()
    obs_frac = getattr(current_fn, 'observation_fraction', None)
    if obs_frac is not None:
        response['observation_fraction'] = round(obs_frac, 4)
    return response


@router.get('/incidents')
async def incidents() -> list[dict[str, object]]:
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            '''
            SELECT id, vessel_id, last_contact_at, last_contact_lat, last_contact_lon,
                   abnormal_reason, is_synthetic
            FROM incidents
            ORDER BY last_contact_at DESC, id DESC
            '''
        )
    return [
        {
            'id': row['id'],
            'vessel_id': row['vessel_id'],
            'last_contact_at': row['last_contact_at'].isoformat(),
            'last_contact_lat': float(row['last_contact_lat']),
            'last_contact_lon': float(row['last_contact_lon']),
            'abnormal_reason': row['abnormal_reason'],
            'is_synthetic': row['is_synthetic'],
        }
        for row in rows
    ]


@router.get('/incident/{incident_id}')
async def incident_prediction(incident_id: int, forecast_hours: float = 24.0) -> dict[str, object]:
    pool = get_pool()
    current_fn = await create_current_field_factory(pool)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            '''
            SELECT id, vessel_id, last_contact_at, last_contact_lat, last_contact_lon,
                   abnormal_reason, true_track, is_synthetic,
                   prior_grid, posterior_grid
            FROM incidents
            WHERE id = $1
            ''',
            incident_id,
        )
    if row is None:
        raise HTTPException(status_code=404, detail='incident not found')

    true_track = row['true_track']
    if isinstance(true_track, str):
        true_track = json.loads(true_track)

    result = predict_drift(
        last_lat=float(row['last_contact_lat']),
        last_lon=float(row['last_contact_lon']),
        observed_at=row['last_contact_at'],
        object_class=_incident_class(str(row['abnormal_reason'])),
        forecast_hours=forecast_hours,
        current_vector_fn=current_fn,
    )

    posterior_grid = row['posterior_grid']
    if posterior_grid is not None:
        posterior_grid = json.loads(posterior_grid) if isinstance(posterior_grid, str) else posterior_grid
    else:
        posterior_grid = result.grid

    sectors = []
    async with pool.acquire() as conn:
        sector_rows = await conn.fetch(
            'SELECT x_min_m, x_max_m, y_min_m, y_max_m, detection_probability, searched_at '
            'FROM search_sectors WHERE incident_id = $1 ORDER BY searched_at',
            incident_id,
        )
    for sr in sector_rows:
        sectors.append({
            'x_min_m': float(sr['x_min_m']),
            'x_max_m': float(sr['x_max_m']),
            'y_min_m': float(sr['y_min_m']),
            'y_max_m': float(sr['y_max_m']),
            'detection_probability': float(sr['detection_probability']),
            'searched_at': sr['searched_at'].isoformat(),
        })

    response = {
        'incident': {
            'id': row['id'],
            'vessel_id': row['vessel_id'],
            'last_contact_at': row['last_contact_at'].isoformat(),
            'last_contact_lat': float(row['last_contact_lat']),
            'last_contact_lon': float(row['last_contact_lon']),
            'abnormal_reason': row['abnormal_reason'],
            'is_synthetic': row['is_synthetic'],
        },
        'prediction': result.to_dict(),
        'ground_truth_track': true_track,
        'posterior_grid': posterior_grid,
        'contours': contours_from_grid(posterior_grid),
        'search_sectors': sectors,
    }
    obs_frac = getattr(current_fn, 'observation_fraction', None)
    if obs_frac is not None:
        response['observation_fraction'] = round(obs_frac, 4)
    return response


@router.post('/incident/{incident_id}/searched')
async def record_searched_sector(
    incident_id: int, body: SearchSectorRequest,
) -> dict[str, object]:
    pool = get_pool()
    current_fn = await create_current_field_factory(pool)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            '''
            SELECT id, last_contact_at, last_contact_lat, last_contact_lon,
                   abnormal_reason, prior_grid, posterior_grid
            FROM incidents
            WHERE id = $1
            ''',
            incident_id,
        )
    if row is None:
        raise HTTPException(status_code=404, detail='incident not found')

    prior_grid = row['prior_grid']
    if prior_grid is not None:
        prior_grid = json.loads(prior_grid) if isinstance(prior_grid, str) else prior_grid
    else:
        prior_grid = await _get_or_compute_prior(
            pool, incident_id, row, current_fn, 24.0,
        )

    posterior_grid = row['posterior_grid']
    if posterior_grid is not None:
        posterior_grid = json.loads(posterior_grid) if isinstance(posterior_grid, str) else posterior_grid
    else:
        posterior_grid = prior_grid

    sector = {
        'x_min_m': body.x_min_m,
        'x_max_m': body.x_max_m,
        'y_min_m': body.y_min_m,
        'y_max_m': body.y_max_m,
        'detection_probability': body.detection_probability,
    }
    updated_grid = update_posterior(posterior_grid, [sector])

    async with pool.acquire() as conn:
        await conn.execute(
            'UPDATE incidents SET posterior_grid = $1 WHERE id = $2',
            json.dumps(updated_grid),
            incident_id,
        )
        await conn.execute(
            '''
            INSERT INTO search_sectors
                (incident_id, x_min_m, x_max_m, y_min_m, y_max_m, detection_probability)
            VALUES ($1, $2, $3, $4, $5, $6)
            ''',
            incident_id,
            body.x_min_m,
            body.x_max_m,
            body.y_min_m,
            body.y_max_m,
            body.detection_probability,
        )

    updated_contours = contours_from_grid(updated_grid)

    all_sectors = []
    async with pool.acquire() as conn:
        sector_rows = await conn.fetch(
            'SELECT x_min_m, x_max_m, y_min_m, y_max_m, detection_probability, searched_at '
            'FROM search_sectors WHERE incident_id = $1 ORDER BY searched_at',
            incident_id,
        )
    for sr in sector_rows:
        all_sectors.append({
            'x_min_m': float(sr['x_min_m']),
            'x_max_m': float(sr['x_max_m']),
            'y_min_m': float(sr['y_min_m']),
            'y_max_m': float(sr['y_max_m']),
            'detection_probability': float(sr['detection_probability']),
            'searched_at': sr['searched_at'].isoformat(),
        })

    return {
        'posterior_grid': updated_grid,
        'contours': updated_contours,
        'search_sectors': all_sectors,
    }
