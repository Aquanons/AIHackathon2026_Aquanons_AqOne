from __future__ import annotations

import base64
import csv
import io
import json
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from app.audit import record_audit_event
from app.auth import require_admin_role, require_responder_roles
from app.db import get_pool

router = APIRouter(prefix='/api/ops', tags=['operations-audit'])

# The exact resource_type values every app.audit.record_audit_event call
# uses (backend/app/api/{sos,anomaly_cases,drift,sea_condition,advisories,
# vessel_auth,auth}.py) - a case timeline only ever makes sense for one of
# the three "case" resources a responder acts on.
CASE_RESOURCE_TYPES = {'sos_event', 'anomaly_case', 'drift_incident'}

TIMELINE_ROW_LIMIT = 200
CASE_VIEW_DEDUP_WINDOW = timedelta(minutes=15)

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 100
DEFAULT_LOOKBACK_DAYS = 7
MAX_LOOKBACK_DAYS = 90
EXPORT_ROW_CAP = 5000

_AUDIT_COLUMNS = (
    'id, occurred_at, actor_user_id, actor_email, actor_role, action, '
    'resource_type, resource_id, outcome, correlation_key, is_demo, metadata'
)


def _serialise_event(row: Any, *, include_actor_id: bool) -> dict[str, Any]:
    event = {
        'id': row['id'],
        'occurred_at': row['occurred_at'].isoformat(),
        'actor_email': row['actor_email'],
        'actor_role': row['actor_role'],
        'action': row['action'],
        'outcome': row['outcome'],
        'correlation_key': row['correlation_key'],
        'is_demo': row['is_demo'],
        'metadata': json.loads(row['metadata']) if isinstance(row['metadata'], str) else row['metadata'],
    }
    if include_actor_id:
        event['actor_user_id'] = row['actor_user_id']
        event['resource_type'] = row['resource_type']
        event['resource_id'] = row['resource_id']
    return event


@router.get('/cases/{resource_type}/{resource_id}/timeline')
async def case_timeline(
    resource_type: str,
    resource_id: str,
    user: dict = require_responder_roles,
) -> dict[str, Any]:
    """The authorized timeline for one case - never a bulk cross-case
    history (docs/41 Phase 3). Any authenticated responder role may view
    any case: the same three roles already share full write access to
    every responder incident action (docs/05_PUBLIC_API.md action matrix),
    so there is no narrower per-case ownership to enforce here.
    """
    if resource_type not in CASE_RESOURCE_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f'resource_type must be one of: {sorted(CASE_RESOURCE_TYPES)}',
        )

    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f'''
            SELECT {_AUDIT_COLUMNS}
            FROM operations_audit_events
            WHERE resource_type = $1 AND resource_id = $2
            ORDER BY occurred_at DESC, id DESC
            LIMIT $3
            ''',
            resource_type, resource_id, TIMELINE_ROW_LIMIT,
        )
        await _record_case_view_if_not_recent(conn, user, resource_type, resource_id)

    return {
        'resource_type': resource_type,
        'resource_id': resource_id,
        'events': [_serialise_event(row, include_actor_id=False) for row in rows],
    }


async def _record_case_view_if_not_recent(
    conn: Any, user: dict, resource_type: str, resource_id: str,
) -> None:
    """One 'case viewed' access event per actor/resource per dedup window -
    a case detail open is meaningful and worth a bounded record, but a
    dashboard tab left open and re-polling the same case must not turn
    into an event storm (docs/41 Phase 3 item 3).
    """
    recent = await conn.fetchval(
        '''
        SELECT 1 FROM operations_audit_events
         WHERE action = 'ops.case_view'
           AND actor_user_id = $1
           AND resource_type = $2
           AND resource_id = $3
           AND occurred_at > $4
         LIMIT 1
        ''',
        str(user.get('id')) if user.get('id') is not None else None,
        resource_type,
        resource_id,
        datetime.now(UTC) - CASE_VIEW_DEDUP_WINDOW,
    )
    if recent:
        return
    await record_audit_event(
        conn,
        actor=user,
        action='ops.case_view',
        resource_type=resource_type,
        resource_id=resource_id,
        outcome='viewed',
    )


class _AuditCursor:
    __slots__ = ('occurred_at', 'id')

    def __init__(self, occurred_at: datetime, id_: int) -> None:
        self.occurred_at = occurred_at
        self.id = id_

    def encode(self) -> str:
        payload = json.dumps({'occurred_at': self.occurred_at.isoformat(), 'id': self.id})
        return base64.urlsafe_b64encode(payload.encode('utf-8')).decode('ascii')

    @classmethod
    def decode(cls, raw: str) -> _AuditCursor:
        try:
            payload = json.loads(base64.urlsafe_b64decode(raw.encode('ascii')))
            return cls(datetime.fromisoformat(payload['occurred_at']), int(payload['id']))
        except Exception as exc:
            raise HTTPException(status_code=400, detail='invalid cursor') from exc


def _bounded_date_range(
    date_from: datetime | None, date_to: datetime | None,
) -> tuple[datetime, datetime]:
    now = datetime.now(UTC)
    resolved_to = date_to or now
    resolved_from = date_from or (resolved_to - timedelta(days=DEFAULT_LOOKBACK_DAYS))
    if resolved_from > resolved_to:
        raise HTTPException(status_code=422, detail='date_from must not be after date_to')
    if resolved_to - resolved_from > timedelta(days=MAX_LOOKBACK_DAYS):
        raise HTTPException(
            status_code=422,
            detail=f'date range must not exceed {MAX_LOOKBACK_DAYS} days',
        )
    return resolved_from, resolved_to


def _build_filtered_query(
    *,
    actor_email: str | None,
    action: str | None,
    resource_type: str | None,
    resource_id: str | None,
    date_from: datetime,
    date_to: datetime,
    cursor: _AuditCursor | None,
) -> tuple[str, list[Any]]:
    conditions = ['occurred_at >= $1', 'occurred_at <= $2']
    args: list[Any] = [date_from, date_to]

    def _add(condition_sql: str, value: Any) -> None:
        args.append(value)
        conditions.append(condition_sql.format(n=len(args)))

    if actor_email:
        _add('actor_email = ${n}', actor_email)
    if action:
        _add('action = ${n}', action)
    if resource_type:
        _add('resource_type = ${n}', resource_type)
    if resource_id:
        _add('resource_id = ${n}', resource_id)
    if cursor is not None:
        args.append(cursor.occurred_at)
        args.append(cursor.id)
        conditions.append(f'(occurred_at, id) < (${len(args) - 1}, ${len(args)})')

    where_clause = ' AND '.join(conditions)
    query = (
        f'SELECT {_AUDIT_COLUMNS} FROM operations_audit_events '
        f'WHERE {where_clause} ORDER BY occurred_at DESC, id DESC'
    )
    return query, args


def _applied_filters(
    actor_email, action, resource_type, resource_id, date_from, date_to,
) -> dict[str, Any]:
    return {
        'actor_email': actor_email,
        'action': action,
        'resource_type': resource_type,
        'resource_id': resource_id,
        'date_from': date_from.isoformat(),
        'date_to': date_to.isoformat(),
    }


@router.get('/audit')
async def search_audit(
    actor_email: str | None = Query(default=None),
    action: str | None = Query(default=None),
    resource_type: str | None = Query(default=None),
    resource_id: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    cursor: str | None = Query(default=None),
    user: dict = require_admin_role,
) -> dict[str, Any]:
    """Administrator-only global search, cursor-paginated, newest first
    (docs/41 Phase 3). Never exposed to lgu/mdrrmo - a narrower privilege
    than the operational actions those roles already share with admin.
    """
    resolved_from, resolved_to = _bounded_date_range(date_from, date_to)
    decoded_cursor = _AuditCursor.decode(cursor) if cursor else None

    query, args = _build_filtered_query(
        actor_email=actor_email, action=action, resource_type=resource_type,
        resource_id=resource_id, date_from=resolved_from, date_to=resolved_to,
        cursor=decoded_cursor,
    )
    query += f' LIMIT {limit + 1}'

    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *args)
        applied = _applied_filters(
            actor_email, action, resource_type, resource_id, resolved_from, resolved_to,
        )
        await record_audit_event(
            conn,
            actor=user,
            action='ops.audit_search',
            resource_type='operations_audit_events',
            resource_id=None,
            outcome='searched',
            metadata={'limit': limit, **{k: v for k, v in applied.items() if k not in ('date_from', 'date_to')}},
        )

    has_more = len(rows) > limit
    page_rows = rows[:limit]
    next_cursor = None
    if has_more and page_rows:
        last = page_rows[-1]
        next_cursor = _AuditCursor(last['occurred_at'], last['id']).encode()

    return {
        'events': [_serialise_event(row, include_actor_id=True) for row in page_rows],
        'next_cursor': next_cursor,
        'applied_filters': applied,
    }


def _csv_body(rows: list[Any], *, generated_at: datetime, applied: dict[str, Any], truncated: bool) -> str:
    buffer = io.StringIO()
    buffer.write(f'# generated_at={generated_at.isoformat()}\n')
    buffer.write(f'# applied_filters={json.dumps(applied)}\n')
    if truncated:
        buffer.write(f'# truncated=true (capped at {EXPORT_ROW_CAP} rows)\n')
    writer = csv.writer(buffer)
    writer.writerow([
        'id', 'occurred_at', 'actor_user_id', 'actor_email', 'actor_role',
        'action', 'resource_type', 'resource_id', 'outcome', 'correlation_key',
        'is_demo', 'metadata',
    ])
    for row in rows:
        event = _serialise_event(row, include_actor_id=True)
        writer.writerow([
            event['id'], event['occurred_at'], event['actor_user_id'],
            event['actor_email'], event['actor_role'], event['action'],
            event['resource_type'], event['resource_id'], event['outcome'],
            event['correlation_key'], event['is_demo'], json.dumps(event['metadata']),
        ])
    return buffer.getvalue()


@router.get('/audit/export')
async def export_audit(
    actor_email: str | None = Query(default=None),
    action: str | None = Query(default=None),
    resource_type: str | None = Query(default=None),
    resource_id: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    format: Literal['csv', 'json'] = Query(default='csv'),
    user: dict = require_admin_role,
) -> Response:
    """A server-generated, bounded export - never the live browser map
    summary some dashboard code elsewhere confusingly used to call an
    "export" (docs/41 Phase 1 finding). Capped at EXPORT_ROW_CAP rows;
    narrower filters are the way to get a complete export past that cap.
    """
    resolved_from, resolved_to = _bounded_date_range(date_from, date_to)
    query, args = _build_filtered_query(
        actor_email=actor_email, action=action, resource_type=resource_type,
        resource_id=resource_id, date_from=resolved_from, date_to=resolved_to,
        cursor=None,
    )
    query += f' LIMIT {EXPORT_ROW_CAP + 1}'

    pool = get_pool()
    generated_at = datetime.now(UTC)
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *args)
        applied = _applied_filters(
            actor_email, action, resource_type, resource_id, resolved_from, resolved_to,
        )
        await record_audit_event(
            conn,
            actor=user,
            action='ops.audit_export',
            resource_type='operations_audit_events',
            resource_id=None,
            outcome='exported',
            metadata={'format': format, **{k: v for k, v in applied.items() if k not in ('date_from', 'date_to')}},
        )

    truncated = len(rows) > EXPORT_ROW_CAP
    page_rows = rows[:EXPORT_ROW_CAP]
    filename = f'operations-audit-{generated_at.strftime("%Y%m%dT%H%M%SZ")}.{format}'

    if format == 'json':
        body = json.dumps({
            'generated_at': generated_at.isoformat(),
            'applied_filters': applied,
            'truncated': truncated,
            'events': [_serialise_event(row, include_actor_id=True) for row in page_rows],
        })
        media_type = 'application/json'
    else:
        body = _csv_body(page_rows, generated_at=generated_at, applied=applied, truncated=truncated)
        media_type = 'text/csv'

    return Response(
        content=body,
        media_type=media_type,
        headers={'Content-Disposition': f'attachment; filename="{filename}"'},
    )
