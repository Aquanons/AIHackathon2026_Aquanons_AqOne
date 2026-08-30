from __future__ import annotations

import json
from datetime import datetime
from typing import Literal

import asyncpg
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator

from app.ai import environment
from app.ai.current_field import count_nearby_fresh_buoys, create_current_field_factory
from app.ai.drift import MODEL_VERSION, ObjectClass, _to_xy, predict_drift
from app.ai.search import contours_from_grid, recommend_next_area, update_posterior
from app.auth import require_responder_roles
from app.db import get_pool

router = APIRouter(prefix='/api/ai/drift', tags=['drift'])

# Reasons stored on `incidents.abnormal_reason` for a real, responder-opened
# case. Unlike the simulator's abnormal_reason values (capsize,
# adverse_weather, ...), these never drive object-class selection - a real
# case always carries its own `object_class`, chosen explicitly by the
# responder at open time (docs/40 Phase 1 item 4).
SOS_OPEN_REASON = 'manual_sos_confirmed'
ANOMALY_OPEN_REASON = 'anomaly_escalated'

_RUN_COLUMNS = '''
    id, run_number, object_class, forecast_hours, model_version, computed_at, computed_by,
    environmental_status, insufficiency_reason, observed_coverage,
    current_max_age_seconds, nearby_buoy_count, wind_source, wind_degraded,
    max_wind_age_seconds, prior_grid, posterior_grid
'''

# Responder-approved detection-probability presets (docs/40 Phase 3 item 2).
# Approved by the project owner (Lenard) on 2026-08-30 alongside the Phase 2
# environmental policy - see docs/05_PUBLIC_API.md "Drift prediction and
# search re-tasking". The UI submits one of these named presets, never a
# free-form probability, and none reaches 1.0 - a search is never perfect.
DETECTION_PRESETS: dict[str, float] = {
    'poor': 0.3,
    'moderate': 0.6,
    'good': 0.9,
}
DETECTION_METHOD_LABELS: dict[str, str] = {
    'poor': 'Poor visibility / air search only',
    'moderate': 'Daylight surface vessel search',
    'good': 'Good conditions, multi-asset close pattern',
}


class SectorReportRequest(BaseModel):
    """The protected search-sector report contract (docs/40 Phase 3 item 1).

    A responder draws a rectangle on the map - the backend converts it to
    the grid's local metre space, not the other way around. `run_number` is
    whatever the client last saw from GET /incident/{id}: the server rejects
    a report against a run that has since been superseded by a rerun.
    """

    run_number: int = Field(..., ge=1)
    south: float = Field(..., ge=-90, le=90)
    west: float = Field(..., ge=-180, le=180)
    north: float = Field(..., ge=-90, le=90)
    east: float = Field(..., ge=-180, le=180)
    method: Literal['poor', 'moderate', 'good']
    idempotency_key: str = Field(..., min_length=1, max_length=64)
    notes: str | None = Field(default=None, max_length=280)

    @model_validator(mode='after')
    def _validate_rectangle(self) -> SectorReportRequest:
        if self.north <= self.south:
            raise ValueError('north must be greater than south')
        if self.east <= self.west:
            raise ValueError('east must be greater than west')
        return self


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


def _grid(value) -> dict | None:
    if value is None:
        return None
    return json.loads(value) if isinstance(value, str) else value


async def _fetch_sectors(pool, incident_id: int) -> list[dict[str, object]]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            'SELECT x_min_m, x_max_m, y_min_m, y_max_m, detection_probability, searched_at, '
            'method, reported_by, notes '
            'FROM search_sectors WHERE incident_id = $1 ORDER BY searched_at',
            incident_id,
        )
    return [
        {
            'x_min_m': float(row['x_min_m']),
            'x_max_m': float(row['x_max_m']),
            'y_min_m': float(row['y_min_m']),
            'y_max_m': float(row['y_max_m']),
            'detection_probability': float(row['detection_probability']),
            'searched_at': row['searched_at'].isoformat(),
            # Only present on a Phase 3 protected report; a legacy/demo
            # sector (app/demo/scenarios.py) leaves these NULL.
            'method': row['method'],
            'method_label': DETECTION_METHOD_LABELS.get(row['method']),
            'reported_by': row['reported_by'],
            'notes': row['notes'],
        }
        for row in rows
    ]


async def _latest_run(pool, incident_id: int):
    async with pool.acquire() as conn:
        return await conn.fetchrow(
            f'SELECT {_RUN_COLUMNS} FROM drift_runs WHERE incident_id = $1 '
            'ORDER BY run_number DESC LIMIT 1',
            incident_id,
        )


async def _get_or_compute_prior(
    pool, incident_id: int, row, current_fn, forecast_hours: float,
) -> dict:
    """Legacy/demo-fixture path only (docs/40 Phase 1 item 4): loads the
    incidents.prior_grid cache, or computes and caches it. Never used for a
    real case - those always have a drift_runs row by the time this could be
    reached (see record_searched_sector).
    """
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


async def _compute_and_persist_run(
    pool, incident_id: int, run_number: int, *,
    last_lat: float, last_lon: float, last_at: datetime,
    object_class: ObjectClass, forecast_hours: float, actor: str,
) -> environment.EnvironmentAssessment:
    """The production quality-gated prediction (docs/40 Phase 2 items 2-3).

    Computes at most one particle simulation, assesses it against the
    owner-approved policy in app.ai.environment, and persists exactly one
    immutable drift_runs row - a contour only when the inputs are
    sufficient, `insufficient_environmental_data` (with its diagnostic
    snapshot) otherwise. Never falls back to the synthetic current field.
    """
    nearby = await count_nearby_fresh_buoys(pool, last_lat, last_lon, last_at)
    assessment = environment.assess_geometry(nearby)
    prior_grid = posterior_grid = None

    if assessment is None:
        current_fn = await create_current_field_factory(pool)
        result = predict_drift(
            last_lat=last_lat,
            last_lon=last_lon,
            observed_at=last_at,
            object_class=object_class,
            forecast_hours=forecast_hours,
            current_vector_fn=current_fn,
        )
        coverage = getattr(current_fn, 'observation_fraction', 0.0)
        assessment = environment.assess_result(nearby, coverage, result)
        if assessment.sufficient:
            prior_grid = result.grid
            posterior_grid = result.grid

    async with pool.acquire() as conn:
        await conn.execute(
            '''
            INSERT INTO drift_runs (
              incident_id, run_number, object_class, forecast_hours, model_version,
              computed_by, environmental_status, insufficiency_reason,
              observed_coverage, current_max_age_seconds, nearby_buoy_count,
              wind_source, wind_degraded, max_wind_age_seconds,
              prior_grid, posterior_grid
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
            ''',
            incident_id, run_number, object_class.value, forecast_hours, MODEL_VERSION,
            actor, 'ok' if assessment.sufficient else 'insufficient_environmental_data',
            assessment.reason, assessment.observed_coverage, assessment.current_max_age_seconds,
            assessment.nearby_buoy_count, assessment.wind_source, assessment.wind_degraded,
            assessment.max_wind_age_seconds,
            json.dumps(prior_grid) if prior_grid is not None else None,
            json.dumps(posterior_grid) if posterior_grid is not None else None,
        )
    return assessment


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
    forecast_hours: float = Field(24.0, gt=0, le=72)


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
async def open_case(body: OpenCaseRequest, user: dict = require_responder_roles) -> dict[str, object]:
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

    incident_id = row['id']
    actor = user.get('email') or 'unknown'
    assessment = await _compute_and_persist_run(
        pool, incident_id, 1,
        last_lat=lat, last_lon=lon, last_at=at,
        object_class=body.object_class, forecast_hours=body.forecast_hours,
        actor=actor,
    )

    return {
        'id': incident_id,
        'vessel_id': vessel_id,
        'object_class': body.object_class.value,
        'case_state': 'confirmed',
        'source_type': body.source_type,
        'run_number': 1,
        'environmental_status': 'ok' if assessment.sufficient else 'insufficient_environmental_data',
        'insufficiency_reason': assessment.reason,
    }


@router.post('/cases/{incident_id}/rerun')
async def rerun_case(incident_id: int, user: dict = require_responder_roles) -> dict[str, object]:
    """An explicit, responder-only new drift run (docs/40 Phase 2 item 4).

    Appends a new numbered run rather than overwriting the current one, so a
    crew already acting on an earlier run's contours and search sectors is
    never silently redirected mid-search.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        incident = await conn.fetchrow(
            '''
            SELECT id, last_contact_at, last_contact_lat, last_contact_lon,
                   abnormal_reason, object_class, resolved_at, cancelled_at
            FROM incidents WHERE id = $1
            ''',
            incident_id,
        )
    if incident is None:
        raise HTTPException(status_code=404, detail='no such case')
    if incident['resolved_at'] is not None or incident['cancelled_at'] is not None:
        raise HTTPException(
            status_code=409, detail=f'case is {_case_state(incident)}; cannot start a new run',
        )

    latest = await _latest_run(pool, incident_id)
    if latest is None:
        raise HTTPException(
            status_code=409, detail='this case has no prior run to supersede',
        )

    next_run_number = latest['run_number'] + 1
    assessment = await _compute_and_persist_run(
        pool, incident_id, next_run_number,
        last_lat=float(incident['last_contact_lat']),
        last_lon=float(incident['last_contact_lon']),
        last_at=incident['last_contact_at'],
        object_class=_resolved_object_class(incident),
        forecast_hours=float(latest['forecast_hours']),
        actor=user.get('email') or 'unknown',
    )
    return {
        'id': incident_id,
        'run_number': next_run_number,
        'environmental_status': 'ok' if assessment.sufficient else 'insufficient_environmental_data',
        'insufficiency_reason': assessment.reason,
    }


@router.post('/cases/{incident_id}/resolve')
async def resolve_case(incident_id: int, user: dict = require_responder_roles) -> dict[str, object]:
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
    incident_id: int, payload: CancelCaseRequest, user: dict = require_responder_roles,
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

    incident_summary = {
        'id': row['id'],
        'vessel_id': row['vessel_id'],
        'last_contact_at': row['last_contact_at'].isoformat(),
        'last_contact_lat': float(row['last_contact_lat']),
        'last_contact_lon': float(row['last_contact_lon']),
        'abnormal_reason': row['abnormal_reason'],
        'is_synthetic': row['is_synthetic'],
        'source_type': _source_type(row),
        'case_state': _case_state(row),
    }

    run = await _latest_run(pool, incident_id)

    if run is not None:
        # A real case: read the stored, immutable run. Never recompute on a
        # GET (docs/40 Phase 2 item 3) - a displayed prediction must always
        # belong to the same environmental inputs as its posterior.
        is_ok = run['environmental_status'] == 'ok'
        response: dict[str, object] = {
            'incident': incident_summary,
            'run_number': run['run_number'],
            'model_version': run['model_version'],
            'computed_at': run['computed_at'].isoformat(),
            'environmental_status': run['environmental_status'],
            'insufficiency_reason': run['insufficiency_reason'],
            'nearby_buoy_count': run['nearby_buoy_count'],
            'current_max_age_seconds': run['current_max_age_seconds'],
            'max_wind_age_seconds': run['max_wind_age_seconds'],
            'observation_fraction': (
                round(run['observed_coverage'], 4) if run['observed_coverage'] is not None else None
            ),
            'prediction': {
                'object_class': run['object_class'],
                'wind_source': run['wind_source'],
                'degraded': run['wind_degraded'],
            } if is_ok else None,
            'posterior_grid': _grid(run['posterior_grid']) if is_ok else None,
            'contours': contours_from_grid(_grid(run['posterior_grid'])) if is_ok else [],
            'next_area': recommend_next_area(_grid(run['posterior_grid'])) if is_ok else None,
            'search_sectors': await _fetch_sectors(pool, incident_id),
        }
        return response

    # Legacy/demo-fixture path (docs/40 Phase 1 item 4): the simulator and
    # the demo scenario engine still write incidents.prior_grid/
    # posterior_grid directly and never create a drift_runs row, so this
    # keeps their exact pre-Phase-2 behaviour unchanged.
    current_fn = await create_current_field_factory(pool)
    result = predict_drift(
        last_lat=float(row['last_contact_lat']),
        last_lon=float(row['last_contact_lon']),
        observed_at=row['last_contact_at'],
        object_class=_resolved_object_class(row),
        forecast_hours=forecast_hours,
        current_vector_fn=current_fn,
    )
    posterior_grid = _grid(row['posterior_grid']) or result.grid

    response = {
        'incident': incident_summary,
        'prediction': result.to_dict(),
        'posterior_grid': posterior_grid,
        'contours': contours_from_grid(posterior_grid),
        'search_sectors': await _fetch_sectors(pool, incident_id),
    }
    if row['is_synthetic']:
        response['ground_truth_track'] = _grid(row['true_track'])
    obs_frac = getattr(current_fn, 'observation_fraction', None)
    if obs_frac is not None:
        response['observation_fraction'] = round(obs_frac, 4)
    return response


def _rect_to_metres(
    south: float, west: float, north: float, east: float, origin_lat: float, origin_lon: float,
) -> tuple[float, float, float, float]:
    """Converts a map-space rectangle to the grid's local metre space
    (docs/40 Phase 3 item 1) - the backend does this conversion, not the
    responder. `_to_xy` computes x from the lon array and y from the lat
    array independently, so pairing south/north with west/east here is just
    a convenient way to get both edges from one call.
    """
    x, y = _to_xy(np.array([south, north]), np.array([west, east]), origin_lat, origin_lon)
    return float(x[0]), float(x[1]), float(y[0]), float(y[1])


def _grid_bounds_m(grid_dict: dict) -> tuple[float, float, float, float]:
    x_edges = grid_dict['x_edges_m']
    y_edges = grid_dict['y_edges_m']
    return float(x_edges[0]), float(x_edges[-1]), float(y_edges[0]), float(y_edges[-1])


async def record_legacy_search_sector(
    incident_id: int, *,
    x_min_m: float, x_max_m: float, y_min_m: float, y_max_m: float, detection_probability: float,
) -> dict[str, object]:
    """The pre-Phase-3 raw metre-offset primitive, kept only for the
    synthetic/demo scenario engine (app/demo/scenarios.py), which calls this
    directly in-process rather than through the protected HTTP contract
    below - "preserve existing synthetic sectors and replay ability" (docs/40
    Phase 3 item 3). A real case never reaches this function.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            '''
            SELECT id, last_contact_at, last_contact_lat, last_contact_lon,
                   abnormal_reason, object_class, prior_grid, posterior_grid
            FROM incidents WHERE id = $1
            ''',
            incident_id,
        )
    if row is None:
        raise HTTPException(status_code=404, detail='incident not found')

    current_fn = await create_current_field_factory(pool)
    prior_grid = row['prior_grid']
    prior_grid = _grid(prior_grid) if prior_grid is not None else await _get_or_compute_prior(
        pool, incident_id, row, current_fn, 24.0,
    )
    posterior_grid = _grid(row['posterior_grid']) or prior_grid
    sector = {
        'x_min_m': x_min_m, 'x_max_m': x_max_m, 'y_min_m': y_min_m, 'y_max_m': y_max_m,
        'detection_probability': detection_probability,
    }
    updated_grid = update_posterior(posterior_grid, [sector])

    async with pool.acquire() as conn:
        await conn.execute(
            'UPDATE incidents SET posterior_grid = $1 WHERE id = $2',
            json.dumps(updated_grid), incident_id,
        )
        await conn.execute(
            '''
            INSERT INTO search_sectors
                (incident_id, x_min_m, x_max_m, y_min_m, y_max_m, detection_probability)
            VALUES ($1, $2, $3, $4, $5, $6)
            ''',
            incident_id, x_min_m, x_max_m, y_min_m, y_max_m, detection_probability,
        )

    return {
        'posterior_grid': updated_grid,
        'contours': contours_from_grid(updated_grid),
        'search_sectors': await _fetch_sectors(pool, incident_id),
    }


@router.post('/incident/{incident_id}/searched')
async def record_searched_sector(
    incident_id: int, body: SectorReportRequest, user: dict = require_responder_roles,
) -> dict[str, object]:
    """The protected search-sector report contract (docs/40 Phase 3).

    Real cases only - a case with no drift run yet (demo/synthetic, or one
    that predates Phase 2) cannot report through this route at all. Atomic:
    locks the case and its current run, rejects a stale/superseded run,
    deduplicates the idempotency key, applies the negative-evidence update
    exactly once, and appends the audit record - all in one transaction.
    """
    pool = get_pool()
    async with pool.acquire() as conn, conn.transaction():
        incident = await conn.fetchrow(
            'SELECT id, resolved_at, cancelled_at FROM incidents WHERE id = $1 FOR UPDATE',
            incident_id,
        )
        if incident is None:
            raise HTTPException(status_code=404, detail='incident not found')
        if incident['resolved_at'] is not None or incident['cancelled_at'] is not None:
            raise HTTPException(
                status_code=409,
                detail=f'case is {_case_state(incident)}; cannot record a new search',
            )

        run = await conn.fetchrow(
            f'SELECT {_RUN_COLUMNS} FROM drift_runs WHERE incident_id = $1 '
            'ORDER BY run_number DESC LIMIT 1 FOR UPDATE',
            incident_id,
        )
        if run is None:
            raise HTTPException(
                status_code=409, detail='this case has no run yet; open or rerun it first',
            )
        if run['run_number'] != body.run_number:
            raise HTTPException(
                status_code=409,
                detail=f'stale run: case is now on run {run["run_number"]}; reload before reporting',
            )
        if run['environmental_status'] != 'ok':
            raise HTTPException(
                status_code=409,
                detail='insufficient environmental data; no search field to update',
            )

        posterior_grid = _grid(run['posterior_grid'])

        existing = await conn.fetchrow(
            'SELECT id FROM search_sectors WHERE incident_id = $1 AND idempotency_key = $2',
            incident_id, body.idempotency_key,
        )
        if existing is not None:
            # A retry of the same report: return the current state rather
            # than applying the negative evidence a second time.
            return {
                'posterior_grid': posterior_grid,
                'contours': contours_from_grid(posterior_grid),
                'next_area': recommend_next_area(posterior_grid),
                'search_sectors': await _fetch_sectors(pool, incident_id),
                'duplicate': True,
            }

        origin = posterior_grid['origin']
        x_min, x_max, y_min, y_max = _rect_to_metres(
            body.south, body.west, body.north, body.east, origin['lat'], origin['lon'],
        )
        grid_x_min, grid_x_max, grid_y_min, grid_y_max = _grid_bounds_m(posterior_grid)
        if x_max <= grid_x_min or x_min >= grid_x_max or y_max <= grid_y_min or y_min >= grid_y_max:
            raise HTTPException(
                status_code=422, detail='searched rectangle does not overlap the search grid',
            )

        detection_probability = DETECTION_PRESETS[body.method]
        sector = {
            'x_min_m': x_min, 'x_max_m': x_max, 'y_min_m': y_min, 'y_max_m': y_max,
            'detection_probability': detection_probability,
        }
        updated_grid = update_posterior(posterior_grid, [sector])

        await conn.execute(
            'UPDATE drift_runs SET posterior_grid = $1 WHERE id = $2',
            json.dumps(updated_grid), run['id'],
        )
        await conn.execute(
            '''
            INSERT INTO search_sectors
                (incident_id, x_min_m, x_max_m, y_min_m, y_max_m, detection_probability,
                 run_id, reported_by, method, notes, idempotency_key)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            ''',
            incident_id, x_min, x_max, y_min, y_max, detection_probability,
            run['id'], user.get('email') or 'unknown', body.method, body.notes, body.idempotency_key,
        )

    return {
        'posterior_grid': updated_grid,
        'contours': contours_from_grid(updated_grid),
        'next_area': recommend_next_area(updated_grid),
        'search_sectors': await _fetch_sectors(pool, incident_id),
        'duplicate': False,
    }
