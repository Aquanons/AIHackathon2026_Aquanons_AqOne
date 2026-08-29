from __future__ import annotations

import json
from datetime import datetime
from typing import Literal

import asyncpg
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.ai.current_field import create_current_field_factory
from app.ai.drift import ObjectClass, predict_drift
from app.ai.search import contours_from_grid, update_posterior
from app.auth import require_user
from app.db import get_pool

router = APIRouter(prefix='/api/ai/drift', tags=['drift'])

# Reasons stored on `incidents.abnormal_reason` for a real, responder-opened
# case. Unlike the simulator's abnormal_reason values (capsize,
# adverse_weather, ...), these never drive object-class selection - a real
# case always carries its own `object_class`, chosen explicitly by the
# responder at open time (docs/40 Phase 1 item 4).
SOS_OPEN_REASON = 'manual_sos_confirmed'
ANOMALY_OPEN_REASON = 'anomaly_escalated'


class SearchSectorRequest(BaseModel):
    x_min_m: float
    x_max_m: float
    y_min_m: float
    y_max_m: float
    detection_probability: float = Field(..., gt=0.0, le=1.0)


def _resolved_object_class(row) -> ObjectClass:
    stored = row['object_class']
    if stored:
        return ObjectClass(stored)
    # Legacy synthetic rows predating this column fall back to the old
    # heuristic derived from abnormal_reason.
    if str(row['abnormal_reason']) in {'capsize', 'adverse_weather'}:
        return ObjectClass.swamped_banca
    return ObjectClass.intact_hull_adrift


def _case_state(row) -> str:
    if row['cancelled_at'] is not None:
        return 'cancelled'
    if row['resolved_at'] is not None:
        return 'resolved'
    return 'confirmed'


def _source_type(row) -> str:
    if row['source_sos_event_id'] is not None:
        return 'sos'
    if row['source_anomaly_case_id'] is not None:
        return 'anomaly'
    return 'synthetic'


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
        object_class=_resolved_object_class(row),
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


@router.get('/incidents')
async def incidents() -> list[dict[str, object]]:
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            '''
            SELECT id, vessel_id, last_contact_at, last_contact_lat, last_contact_lon,
                   abnormal_reason, object_class, is_synthetic,
                   source_sos_event_id, source_anomaly_case_id,
                   resolved_at, cancelled_at
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
            'object_class': _resolved_object_class(row).value,
            'is_synthetic': row['is_synthetic'],
            'source_type': _source_type(row),
            'case_state': _case_state(row),
        }
        for row in rows
    ]


class OpenCaseRequest(BaseModel):
    """Opens a protected drift/search case from a confirmed source.

    `source_type`/`source_id` name the exact confirmed event this case is
    derived from - a case can never be opened from a bare reason string.
    `object_class` is a required, explicit responder choice; it is never
    inferred from the source's own text (docs/40 Phase 1 item 4).
    """

    source_type: Literal['sos', 'anomaly']
    source_id: int
    object_class: ObjectClass


async def _sos_case_inputs(conn: asyncpg.Connection, source_id: int) -> tuple[str, float, float, datetime]:
    row = await conn.fetchrow(
        '''
        SELECT vessel_id, latitude, longitude, created_at, acknowledged_at, resolved_at
        FROM sos_events WHERE id = $1
        ''',
        source_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail='no such SOS event')
    if row['acknowledged_at'] is None:
        raise HTTPException(status_code=409, detail='SOS has not been confirmed by a responder')
    if row['resolved_at'] is not None:
        raise HTTPException(status_code=409, detail='SOS is already resolved')
    if row['latitude'] is None or row['longitude'] is None:
        raise HTTPException(status_code=422, detail='SOS has no last-known position')
    return row['vessel_id'], float(row['latitude']), float(row['longitude']), row['created_at']


async def _anomaly_case_inputs(conn: asyncpg.Connection, source_id: int) -> tuple[str, float, float, datetime]:
    row = await conn.fetchrow(
        '''
        SELECT vessel_id, trip_id, escalated_at, resolved_at
        FROM anomaly_cases WHERE id = $1
        ''',
        source_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail='no such anomaly case')
    if row['escalated_at'] is None:
        raise HTTPException(status_code=409, detail='anomaly case has not been escalated by a responder')
    if row['resolved_at'] is not None:
        raise HTTPException(status_code=409, detail='anomaly case is already resolved')

    position = await conn.fetchrow(
        '''
        SELECT latitude, longitude, observed_at FROM buoy_contacts
        WHERE vessel_id = $1 AND trip_id = $2
          AND latitude IS NOT NULL AND longitude IS NOT NULL
        ORDER BY observed_at DESC LIMIT 1
        ''',
        row['vessel_id'], row['trip_id'],
    )
    if position is None:
        raise HTTPException(status_code=422, detail='no last-known position for this vessel/trip')
    return row['vessel_id'], float(position['latitude']), float(position['longitude']), position['observed_at']


@router.post('/cases')
async def open_case(body: OpenCaseRequest, user: dict = Depends(require_user)) -> dict[str, object]:
    pool = get_pool()
    async with pool.acquire() as conn:
        if body.source_type == 'sos':
            vessel_id, lat, lon, at = await _sos_case_inputs(conn, body.source_id)
            reason, sos_id, anomaly_id = SOS_OPEN_REASON, body.source_id, None
        else:
            vessel_id, lat, lon, at = await _anomaly_case_inputs(conn, body.source_id)
            reason, sos_id, anomaly_id = ANOMALY_OPEN_REASON, None, body.source_id

        try:
            row = await conn.fetchrow(
                '''
                INSERT INTO incidents (
                  vessel_id, last_contact_at, last_contact_lat, last_contact_lon,
                  reported_missing_at, abnormal_reason, object_class,
                  source_sos_event_id, source_anomaly_case_id, opened_by,
                  is_synthetic
                ) VALUES ($1, $2, $3, $4, $2, $5, $6, $7, $8, $9, FALSE)
                RETURNING id
                ''',
                vessel_id, at, lat, lon, reason, body.object_class.value,
                sos_id, anomaly_id, user.get('email') or 'unknown',
            )
        except asyncpg.UniqueViolationError as exc:
            raise HTTPException(
                status_code=409, detail='a case already exists for this source',
            ) from exc

    return {
        'id': row['id'],
        'vessel_id': vessel_id,
        'object_class': body.object_class.value,
        'case_state': 'confirmed',
        'source_type': body.source_type,
    }


@router.post('/cases/{incident_id}/resolve')
async def resolve_case(incident_id: int, user: dict = Depends(require_user)) -> dict[str, object]:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            '''
            UPDATE incidents
               SET resolved_at = COALESCE(resolved_at, NOW()),
                   resolved_by = COALESCE(resolved_by, $2)
             WHERE id = $1
            RETURNING id, resolved_at, resolved_by
            ''',
            incident_id, user.get('email') or 'unknown',
        )
    if row is None:
        raise HTTPException(status_code=404, detail='no such case')
    return {
        'ok': True,
        'id': row['id'],
        'resolved_at': row['resolved_at'].isoformat(),
        'resolved_by': row['resolved_by'],
    }


class CancelCaseRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=280)


@router.post('/cases/{incident_id}/cancel')
async def cancel_case(
    incident_id: int, payload: CancelCaseRequest, user: dict = Depends(require_user),
) -> dict[str, object]:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            '''
            UPDATE incidents
               SET cancelled_at = COALESCE(cancelled_at, NOW()),
                   cancelled_by = COALESCE(cancelled_by, $2),
                   cancelled_reason = COALESCE(cancelled_reason, $3)
             WHERE id = $1
            RETURNING id, cancelled_at, cancelled_by, cancelled_reason
            ''',
            incident_id, user.get('email') or 'unknown', payload.reason,
        )
    if row is None:
        raise HTTPException(status_code=404, detail='no such case')
    return {
        'ok': True,
        'id': row['id'],
        'cancelled_at': row['cancelled_at'].isoformat(),
        'cancelled_by': row['cancelled_by'],
        'cancelled_reason': row['cancelled_reason'],
    }


@router.get('/incident/{incident_id}')
async def incident_prediction(incident_id: int, forecast_hours: float = 24.0) -> dict[str, object]:
    pool = get_pool()
    current_fn = await create_current_field_factory(pool)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            '''
            SELECT id, vessel_id, last_contact_at, last_contact_lat, last_contact_lon,
                   abnormal_reason, object_class, true_track, is_synthetic,
                   prior_grid, posterior_grid,
                   source_sos_event_id, source_anomaly_case_id,
                   resolved_at, cancelled_at
            FROM incidents
            WHERE id = $1
            ''',
            incident_id,
        )
    if row is None:
        raise HTTPException(status_code=404, detail='incident not found')

    result = predict_drift(
        last_lat=float(row['last_contact_lat']),
        last_lon=float(row['last_contact_lon']),
        observed_at=row['last_contact_at'],
        object_class=_resolved_object_class(row),
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
            'source_type': _source_type(row),
            'case_state': _case_state(row),
        },
        'prediction': result.to_dict(),
        'posterior_grid': posterior_grid,
        'contours': contours_from_grid(posterior_grid),
        'search_sectors': sectors,
    }
    # Ground truth must never appear for a real incident (docs/40 "Current
    # findings"). It is real-track data and only ever legitimate for a
    # synthetic replay used in evaluation.
    if row['is_synthetic']:
        true_track = row['true_track']
        if isinstance(true_track, str):
            true_track = json.loads(true_track)
        response['ground_truth_track'] = true_track
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
                   abnormal_reason, object_class, prior_grid, posterior_grid,
                   resolved_at, cancelled_at
            FROM incidents
            WHERE id = $1
            ''',
            incident_id,
        )
    if row is None:
        raise HTTPException(status_code=404, detail='incident not found')
    if row['resolved_at'] is not None or row['cancelled_at'] is not None:
        raise HTTPException(
            status_code=409,
            detail=f'case is {_case_state(row)}; cannot record a new search',
        )

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
