from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException

from app.ai.squall import (
    build_buoys,
    buoy_detail,
    current_detection,
    event_detection_summary,
    load_bundle,
    save_bundle,
    train_from_rows,
)
from app.db import get_pool

router = APIRouter(prefix='/api/ai/squall', tags=['squall'])


async def _load_rows(conn) -> tuple[list[dict[str, object]], list[dict[str, object]], list[dict[str, object]]]:
    readings = await conn.fetch(
        '''
        SELECT buoy_id, observed_at, pressure_hpa
        FROM barometric_readings
        WHERE is_synthetic = TRUE
        ORDER BY observed_at, buoy_id
        '''
    )
    squalls = await conn.fetch(
        '''
        SELECT id, started_at, peak_at, ended_at, center_lat, center_lon,
               front_origin_lat, front_origin_lon, bearing_deg, speed_kph,
               pressure_drop_hpa, rise_minutes, hold_minutes, observed_buoy_ids
        FROM squall_events
        WHERE is_synthetic = TRUE
        ORDER BY started_at
        '''
    )
    buoys = await conn.fetch(
        '''
        SELECT id, lat, lon, contact_radius_m
        FROM buoys
        WHERE is_synthetic = TRUE
        ORDER BY id
        '''
    )
    return [dict(row) for row in readings], [dict(row) for row in squalls], [dict(row) for row in buoys]


@router.get('/current')
async def current() -> dict[str, object]:
    pool = get_pool()
    async with pool.acquire() as conn:
        readings, _, buoy_rows = await _load_rows(conn)
    if not readings:
        return {'calibration': 'synthetic', 'as_of': None, 'detections': [], 'top_features': [], 'evaluation': {}}

    try:
        model = load_bundle()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail='squall model not available') from exc
    buoys = build_buoys(buoy_rows)
    detections = current_detection(readings, buoys, model)
    as_of = max(row['observed_at'] for row in readings).isoformat()
    return event_detection_summary(model, detections) | {'as_of': as_of}


@router.get('/buoy/{buoy_id}')
async def buoy(buoy_id: str) -> dict[str, object]:
    pool = get_pool()
    async with pool.acquire() as conn:
        readings, _, buoy_rows = await _load_rows(conn)
    if not readings:
        raise HTTPException(status_code=404, detail='no pressure readings available')

    buoys = build_buoys(buoy_rows)
    if buoy_id not in buoys:
        raise HTTPException(status_code=404, detail='buoy not found')
    return buoy_detail(readings, buoy_id, buoys)


@router.post('/train')
async def train() -> dict[str, object]:
    if os.environ.get('ALLOW_TRAINING') not in {'1', 'true', 'TRUE', 'yes', 'YES'}:
        raise HTTPException(status_code=403, detail='training disabled')

    pool = get_pool()
    async with pool.acquire() as conn:
        readings, squalls, buoy_rows = await _load_rows(conn)
    if not readings or not squalls:
        raise HTTPException(status_code=400, detail='insufficient synthetic data')

    model, evaluation = train_from_rows(readings, squalls, build_buoys(buoy_rows))
    save_bundle(model)
    return {'calibration': model.calibration, 'evaluation': evaluation, 'top_features': model.top_features}
