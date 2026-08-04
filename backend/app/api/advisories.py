from __future__ import annotations

import logging
from datetime import UTC, date, datetime
from itertools import count
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.auth import require_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix='/api/advisories', tags=['Advisories'])
public_router = APIRouter(prefix='/api/public/advisories', tags=['Advisories'])

_active_advisories: list[dict[str, Any]] = []
_advisory_ids = count(1)

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
        'publish_date': (payload.publish_date or _today()).isoformat(),
        'expiration_date': payload.expiration_date.isoformat()
        if payload.expiration_date
        else '',
        'cover_image': payload.cover_image,
        'status': status,
    }


def _visible_advisories(
    status: str | None = None,
    municipality: str | None = None,
) -> list[dict[str, Any]]:
    rows = list(_active_advisories)
    if status:
        rows = [row for row in rows if row.get('status') == status]
    if municipality and municipality != 'All':
        rows = [
            row
            for row in rows
            if row.get('municipality') in {'All', municipality}
        ]
    return rows


@router.get('')
async def get_advisories(
    status: str | None = Query(default=None),
    municipality: str | None = Query(default=None),
    _: Any = Depends(require_user),
) -> dict[str, list[dict[str, Any]]]:
    return {'advisories': _visible_advisories(status, municipality)}


@public_router.get('')
async def get_public_advisories(
    municipality: str | None = Query(default=None),
) -> dict[str, list[dict[str, Any]]]:
    return {'advisories': _visible_advisories('Published', municipality)}


@router.get('/{advisory_id}')
async def get_advisory(
    advisory_id: int,
    _: Any = Depends(require_user),
) -> dict[str, dict[str, Any]]:
    for advisory in _active_advisories:
        if advisory.get('id') == advisory_id:
            return {'advisory': advisory}
    raise HTTPException(status_code=404, detail='advisory not found')


@router.post('', status_code=201)
async def create_advisory(
    payload: AdvisoryIn,
    user: Any = Depends(require_user),
) -> dict[str, dict[str, Any]]:
    advisory = {
        'id': next(_advisory_ids),
        **_normalise_payload(payload),
        'source': 'LGU',
        'created_by': user.get('email') or user.get('id') or 'LGU',
        'created_at': datetime.now(UTC).isoformat(),
        'updated_at': datetime.now(UTC).isoformat(),
    }
    _active_advisories.insert(0, advisory)
    return {'advisory': advisory}


@router.put('/{advisory_id}')
async def update_advisory(
    advisory_id: int,
    payload: AdvisoryIn,
    _: Any = Depends(require_user),
) -> dict[str, dict[str, Any]]:
    for index, advisory in enumerate(_active_advisories):
        if advisory.get('id') == advisory_id:
            updated = {
                **advisory,
                **_normalise_payload(payload),
                'updated_at': datetime.now(UTC).isoformat(),
            }
            _active_advisories[index] = updated
            return {'advisory': updated}
    raise HTTPException(status_code=404, detail='advisory not found')


@router.delete('/{advisory_id}', status_code=204)
async def delete_advisory(
    advisory_id: int,
    _: Any = Depends(require_user),
) -> None:
    for index, advisory in enumerate(_active_advisories):
        if advisory.get('id') == advisory_id:
            del _active_advisories[index]
            return None
    raise HTTPException(status_code=404, detail='advisory not found')


@router.post('/alert')
async def trigger_danger_alert(payload: DangerAlertPayload) -> dict[str, Any]:
    advisory_item = {
        'id': payload.id,
        'title': f'Alert: {payload.name}',
        'category': 'Weather Advisory',
        'description': f"{payload.trigger}. Reasons: {', '.join(payload.reasons)}",
        'municipality': 'All',
        'priority': 'Warning' if payload.level == 'watch' else 'Emergency',
        'publish_date': payload.observedAt[:10],
        'expiration_date': '',
        'cover_image': None,
        'status': 'Published',
        'source': payload.source,
        'score': payload.score,
        'created_at': payload.observedAt,
        'updated_at': datetime.now(UTC).isoformat(),
    }

    global _active_advisories
    _active_advisories = [
        a for a in _active_advisories if str(a.get('id')) != payload.id
    ]

    if payload.level in ['danger', 'watch']:
        _active_advisories.insert(0, advisory_item)

    logger.warning(
        '[DANGER ALERT] %s scored %s/100 (%s)',
        payload.name,
        payload.score,
        payload.level,
    )

    return {'status': 'success', 'advisory': advisory_item}
