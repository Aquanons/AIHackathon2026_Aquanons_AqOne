from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.auth import require_responder_roles
from app.db import get_pool

router = APIRouter(prefix='/api/ai/anomaly/cases', tags=['anomaly-cases'])

_CASE_COLUMNS = '''
    id, vessel_id, trip_id, case_type, score, status, reasons, source,
    score_evaluated_at, last_contact_at, is_synthetic, created_at, updated_at,
    acknowledged_at, acknowledged_by, dismissed_at, dismissed_by, dismissed_reason,
    escalated_at, escalated_by, escalated_reason, resolved_at, resolved_by
'''


def _case_response(row: Any, *, now: datetime) -> dict[str, object]:
    data = dict(row)
    data['data_age_seconds'] = max(0.0, (now - data['last_contact_at']).total_seconds())
    return data


@router.get('/open')
async def open_cases() -> list[dict[str, object]]:
    """Read-only, same as GET /api/ai/anomaly/active - never evaluates or
    writes. Case creation/refresh happens only in app/ai/anomaly_service.py.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f'''
            SELECT {_CASE_COLUMNS}
            FROM anomaly_cases
            WHERE resolved_at IS NULL
            ORDER BY updated_at DESC
            '''
        )
    now = datetime.now(UTC)
    return [_case_response(row, now=now) for row in rows]


class DismissIn(BaseModel):
    """A short reason is required - docs/38 Phase 3 item 3: "Require a short
    reason for dismissal/escalation where the current UI can provide one."
    """

    reason: str = Field(min_length=1, max_length=280)


class EscalateIn(BaseModel):
    reason: str = Field(min_length=1, max_length=280)


@router.post('/{case_id}/acknowledge')
async def acknowledge_case(case_id: int, user: dict = require_responder_roles) -> dict[str, object]:
    """Idempotent: re-acknowledging keeps the first actor/time (COALESCE),
    same pattern as app/api/sos.py's acknowledge.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            '''
            UPDATE anomaly_cases
               SET acknowledged_at = COALESCE(acknowledged_at, NOW()),
                   acknowledged_by = COALESCE(acknowledged_by, $2)
             WHERE id = $1
            RETURNING id, acknowledged_at, acknowledged_by
            ''',
            case_id,
            user.get('email') or 'unknown',
        )
    if row is None:
        raise HTTPException(status_code=404, detail='no such anomaly case')
    return {
        'ok': True,
        'id': row['id'],
        'acknowledged_at': row['acknowledged_at'].isoformat(),
        'acknowledged_by': row['acknowledged_by'],
    }


@router.post('/{case_id}/dismiss')
async def dismiss_case(
    case_id: int, payload: DismissIn, user: dict = require_responder_roles
) -> dict[str, object]:
    """Marks the case a false/expected positive. Idempotent - a retry keeps
    the original reason rather than overwriting it.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            '''
            UPDATE anomaly_cases
               SET dismissed_at = COALESCE(dismissed_at, NOW()),
                   dismissed_by = COALESCE(dismissed_by, $2),
                   dismissed_reason = COALESCE(dismissed_reason, $3)
             WHERE id = $1
            RETURNING id, dismissed_at, dismissed_by, dismissed_reason
            ''',
            case_id,
            user.get('email') or 'unknown',
            payload.reason,
        )
    if row is None:
        raise HTTPException(status_code=404, detail='no such anomaly case')
    return {
        'ok': True,
        'id': row['id'],
        'dismissed_at': row['dismissed_at'].isoformat(),
        'dismissed_by': row['dismissed_by'],
        'dismissed_reason': row['dismissed_reason'],
    }


@router.post('/{case_id}/escalate')
async def escalate_case(
    case_id: int, payload: EscalateIn, user: dict = require_responder_roles
) -> dict[str, object]:
    """Hands the case to real-world handling (a human decision, per docs/23
    §3.3 - this never dispatches anything itself). Idempotent.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            '''
            UPDATE anomaly_cases
               SET escalated_at = COALESCE(escalated_at, NOW()),
                   escalated_by = COALESCE(escalated_by, $2),
                   escalated_reason = COALESCE(escalated_reason, $3)
             WHERE id = $1
            RETURNING id, escalated_at, escalated_by, escalated_reason
            ''',
            case_id,
            user.get('email') or 'unknown',
            payload.reason,
        )
    if row is None:
        raise HTTPException(status_code=404, detail='no such anomaly case')
    return {
        'ok': True,
        'id': row['id'],
        'escalated_at': row['escalated_at'].isoformat(),
        'escalated_by': row['escalated_by'],
        'escalated_reason': row['escalated_reason'],
    }


@router.post('/{case_id}/resolve')
async def resolve_case(case_id: int, user: dict = require_responder_roles) -> dict[str, object]:
    """Closes the case. Idempotent, and - because evaluation only ever
    upserts the snapshot columns, never resolved_at - a later score refresh
    can never reopen it.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            '''
            UPDATE anomaly_cases
               SET resolved_at = COALESCE(resolved_at, NOW()),
                   resolved_by = COALESCE(resolved_by, $2)
             WHERE id = $1
            RETURNING id, resolved_at, resolved_by
            ''',
            case_id,
            user.get('email') or 'unknown',
        )
    if row is None:
        raise HTTPException(status_code=404, detail='no such anomaly case')
    return {
        'ok': True,
        'id': row['id'],
        'resolved_at': row['resolved_at'].isoformat(),
        'resolved_by': row['resolved_by'],
    }
