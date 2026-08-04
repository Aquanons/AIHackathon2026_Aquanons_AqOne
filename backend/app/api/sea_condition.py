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


@router.get('')
async def read_current() -> dict[str, object]:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            'SELECT * FROM sea_conditions ORDER BY created_at DESC, id DESC LIMIT 1'
        )
    return {'current': _serialise(row) if row else None}


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
