from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.db import get_pool

router = APIRouter(prefix='/api/sea-condition', tags=['sea-condition'])

VALID_STATUSES = {
    'Safe to Go Out',
    'Caution — Check Advisories',
    'Not Advised',
}


class SeaConditionIn(BaseModel):
    status: str
    reason: str = ''
    set_by_user_id: str | None = None
    set_by_name: str = Field(default='')


def _serialise(row) -> dict[str, object]:
    return {
        'id': row['id'],
        'status': row['status'],
        'reason': row['reason'],
        'set_by_user_id': row['set_by_user_id'],
        'set_by_name': row['set_by_name'],
        'created_at': row['created_at'].isoformat(),
    }


async def _buoy_telemetry(conn) -> dict[str, object] | None:
    rows = await conn.fetch(
        '''
        SELECT DISTINCT ON (co.buoy_id)
               co.observed_at, co.observed_u_mps, co.observed_v_mps
        FROM current_observations co
        WHERE co.is_synthetic = FALSE
        ORDER BY co.buoy_id, co.observed_at DESC
        '''
    )
    if not rows:
        return None
    import math

    speed = sum(
        math.hypot(float(row['observed_u_mps']), float(row['observed_v_mps']))
        for row in rows
    ) / len(rows)
    direction = math.degrees(
        math.atan2(
            sum(float(row['observed_u_mps']) for row in rows),
            sum(float(row['observed_v_mps']) for row in rows),
        )
    ) % 360
    observed_at = max(row['observed_at'] for row in rows)
    return {
        'source': 'buoy',
        'buoy_count': len(rows),
        'current_speed_mps': round(speed, 2),
        'current_direction_deg': round(direction, 1),
        'observed_at': observed_at.isoformat(),
    }


@router.get('')
async def read_current() -> dict[str, object]:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            'SELECT * FROM sea_conditions ORDER BY created_at DESC, id DESC LIMIT 1'
        )
        telemetry = await _buoy_telemetry(conn)
    current = _serialise(row) if row else {'status': 'unknown'}
    if telemetry:
        current['buoy_telemetry'] = telemetry
    return {'current': current}


@router.post('', status_code=201)
async def set_current(payload: SeaConditionIn) -> dict[str, object]:
    if payload.status not in VALID_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f'status must be one of: {sorted(VALID_STATUSES)}',
        )

    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            '''
            INSERT INTO sea_conditions (status, reason, set_by_user_id, set_by_name)
            VALUES ($1, $2, $3, $4)
            RETURNING *
            ''',
            payload.status,
            payload.reason,
            payload.set_by_user_id,
            payload.set_by_name,
        )
    return {'current': _serialise(row)}


@router.get('/history')
async def history(limit: int = 20) -> dict[str, object]:
    limit = max(1, min(limit, 100))
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            'SELECT * FROM sea_conditions ORDER BY created_at DESC, id DESC LIMIT $1',
            limit,
        )
    return {'entries': [_serialise(row) for row in rows]}
