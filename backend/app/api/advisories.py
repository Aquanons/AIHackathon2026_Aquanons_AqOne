from __future__ import annotations

import logging
from datetime import UTC, date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.auth import require_user
from app.db import get_pool

logger = logging.getLogger(__name__)

router = APIRouter(prefix='/api/advisories', tags=['Advisories'])
public_router = APIRouter(prefix='/api/public/advisories', tags=['Advisories'])

VALID_PRIORITIES = {'Emergency', 'Warning', 'Information', 'Community'}
VALID_STATUSES = {'Draft', 'Published'}


class AdvisoryIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    category: str = Field(default='Weather Advisory', max_length=80)
    description: str = Field(min_length=1, max_length=2000)
    municipality: str = Field(default='All', max_length=80)
    priority: str = Field(default='Information')
    publish_date: date | None = None
    expiration_date: date | None = None
    cover_image: str | None = None
    status: str = Field(default='Published')


class DangerAlertPayload(BaseModel):
    id: str
    name: str
    score: int
    level: str
    trigger: str
    reasons: list[str]
    source: str
    observedAt: str


def _today() -> date:
    return datetime.now(UTC).date()


def _normalise_payload(payload: AdvisoryIn) -> dict[str, Any]:
    priority = payload.priority.strip()
    status = payload.status.strip()
    if priority not in VALID_PRIORITIES:
        raise HTTPException(status_code=422, detail='invalid advisory priority')
    if status not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail='invalid advisory status')
    if (
        payload.publish_date is not None
        and payload.expiration_date is not None
        and payload.expiration_date < payload.publish_date
    ):
        raise HTTPException(
            status_code=422,
            detail='expiration date cannot be before publish date',
        )

    return {
        'title': payload.title.strip(),
        'category': payload.category.strip() or 'Weather Advisory',
        'description': payload.description.strip(),
        'municipality': payload.municipality.strip() or 'All',
        'priority': priority,
        'publish_date': payload.publish_date or _today(),
        'expiration_date': payload.expiration_date,
        'cover_image': payload.cover_image,
        'status': status,
    }


def _serialise(row: Any) -> dict[str, Any]:
    return {
        'id': row['id'],
        'title': row['title'],
        'category': row['category'],
        'description': row['description'],
        'municipality': row['municipality'],
        'priority': row['priority'],
        'publish_date': row['publish_date'].isoformat(),
        'expiration_date': row['expiration_date'].isoformat()
        if row['expiration_date']
        else '',
        'cover_image': row['cover_image'],
        'status': row['status'],
        'source': row['source'],
        'score': row['score'],
        'created_by': row['created_by'],
        'created_at': row['created_at'].isoformat(),
        'updated_at': row['updated_at'].isoformat(),
    }


async def _fetch_advisories(
    status: str | None = None,
    municipality: str | None = None,
) -> list[dict[str, Any]]:
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            '''
            SELECT *
            FROM advisories
            WHERE ($1::TEXT IS NULL OR status = $1)
              AND (
                $2::TEXT IS NULL
                OR $2 = 'All'
                OR municipality = 'All'
                OR municipality = $2
              )
            ORDER BY publish_date DESC, created_at DESC, id DESC
            LIMIT 100
            ''',
            status,
            municipality,
        )
    return [_serialise(row) for row in rows]


@router.get('')
async def get_advisories(
    status: str | None = Query(default=None),
    municipality: str | None = Query(default=None),
    _: Any = Depends(require_user),
) -> dict[str, list[dict[str, Any]]]:
    return {'advisories': await _fetch_advisories(status, municipality)}


@public_router.get('')
async def get_public_advisories(
    municipality: str | None = Query(default=None),
) -> dict[str, list[dict[str, Any]]]:
    return {'advisories': await _fetch_advisories('Published', municipality)}


@router.get('/{advisory_id}')
async def get_advisory(
    advisory_id: int,
    _: Any = Depends(require_user),
) -> dict[str, dict[str, Any]]:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow('SELECT * FROM advisories WHERE id = $1', advisory_id)
    if row is None:
        raise HTTPException(status_code=404, detail='advisory not found')
    return {'advisory': _serialise(row)}


@router.post('', status_code=201)
async def create_advisory(
    payload: AdvisoryIn,
    user: Any = Depends(require_user),
) -> dict[str, dict[str, Any]]:
    values = _normalise_payload(payload)
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            '''
            INSERT INTO advisories (
              title, category, description, municipality, priority,
              publish_date, expiration_date, cover_image, status,
              source, created_by
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'LGU',$10)
            RETURNING *
            ''',
            values['title'],
            values['category'],
            values['description'],
            values['municipality'],
            values['priority'],
            values['publish_date'],
            values['expiration_date'],
            values['cover_image'],
            values['status'],
            user.get('email') or user.get('id') or 'LGU',
        )
    return {'advisory': _serialise(row)}


@router.put('/{advisory_id}')
async def update_advisory(
    advisory_id: int,
    payload: AdvisoryIn,
    _: Any = Depends(require_user),
) -> dict[str, dict[str, Any]]:
    values = _normalise_payload(payload)
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            '''
            UPDATE advisories
               SET title = $2,
                   category = $3,
                   description = $4,
                   municipality = $5,
                   priority = $6,
                   publish_date = $7,
                   expiration_date = $8,
                   cover_image = $9,
                   status = $10,
                   updated_at = NOW()
             WHERE id = $1
            RETURNING *
            ''',
            advisory_id,
            values['title'],
            values['category'],
            values['description'],
            values['municipality'],
            values['priority'],
            values['publish_date'],
            values['expiration_date'],
            values['cover_image'],
            values['status'],
        )
    if row is None:
        raise HTTPException(status_code=404, detail='advisory not found')
    return {'advisory': _serialise(row)}


@router.delete('/{advisory_id}', status_code=204)
async def delete_advisory(
    advisory_id: int,
    _: Any = Depends(require_user),
) -> None:
    pool = get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute('DELETE FROM advisories WHERE id = $1', advisory_id)
    if result == 'DELETE 0':
        raise HTTPException(status_code=404, detail='advisory not found')
    return None


@router.post('/alert')
async def trigger_danger_alert(payload: DangerAlertPayload) -> dict[str, Any]:
    try:
        observed_date = date.fromisoformat(payload.observedAt[:10])
    except ValueError:
        observed_date = _today()

    advisory_item = {
        'title': f'Alert: {payload.name}',
        'category': 'Weather Advisory',
        'description': f"{payload.trigger}. Reasons: {', '.join(payload.reasons)}",
        'municipality': 'All',
        'priority': 'Warning' if payload.level == 'watch' else 'Emergency',
        'publish_date': observed_date,
        'expiration_date': None,
        'cover_image': None,
        'status': 'Published',
        'source': payload.source,
        'score': payload.score,
        'source_key': f'danger-zone:{payload.id}',
    }

    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            '''
            INSERT INTO advisories (
              source_key, title, category, description, municipality, priority,
              publish_date, expiration_date, cover_image, status, source, score
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            ON CONFLICT (source_key) DO UPDATE SET
              title = EXCLUDED.title,
              description = EXCLUDED.description,
              priority = EXCLUDED.priority,
              publish_date = EXCLUDED.publish_date,
              status = EXCLUDED.status,
              source = EXCLUDED.source,
              score = EXCLUDED.score,
              updated_at = NOW()
            RETURNING *
            ''',
            advisory_item['source_key'],
            advisory_item['title'],
            advisory_item['category'],
            advisory_item['description'],
            advisory_item['municipality'],
            advisory_item['priority'],
            advisory_item['publish_date'],
            advisory_item['expiration_date'],
            advisory_item['cover_image'],
            advisory_item['status'],
            advisory_item['source'],
            advisory_item['score'],
        )

    logger.warning(
        '[DANGER ALERT] %s scored %s/100 (%s)',
        payload.name,
        payload.score,
        payload.level,
    )

    return {'status': 'success', 'advisory': _serialise(row)}
