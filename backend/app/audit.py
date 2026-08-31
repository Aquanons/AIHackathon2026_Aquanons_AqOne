from __future__ import annotations

import json
from typing import Any

# Defense-in-depth ceiling, not a redaction mechanism - the actual contract
# is that every caller builds a small, explicit whitelist of non-sensitive
# fields (state enums, ids, counts). Never pass a raw request body, DB row,
# free-text field, exact coordinate, or credential here.
_MAX_METADATA_KEYS = 12
_MAX_METADATA_JSON_BYTES = 2000


async def record_audit_event(
    conn: Any,
    *,
    actor: dict[str, Any] | None,
    action: str,
    resource_type: str,
    resource_id: str | int | None,
    outcome: str,
    correlation_key: str | None = None,
    is_demo: bool = False,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Insert one append-only audit row in the caller's existing transaction.

    docs/41 Phase 2. `conn` must already be inside
    `async with pool.acquire() as conn, conn.transaction():` alongside the
    domain mutation this event describes, so a failed insert rolls back the
    mutation rather than leaving an unaudited write. `actor` is the
    `require_user`/`require_roles` token dict (or `None` for a pre-auth
    event such as a failed login or the setup-key-gated admin-signup flow).
    """
    metadata = metadata or {}
    if len(metadata) > _MAX_METADATA_KEYS:
        raise ValueError(
            f'audit metadata has too many keys ({len(metadata)} > {_MAX_METADATA_KEYS})'
        )
    payload = json.dumps(metadata, default=str)
    if len(payload) > _MAX_METADATA_JSON_BYTES:
        raise ValueError('audit metadata payload too large')

    actor_id = None
    actor_email = None
    actor_role = None
    if actor is not None:
        raw_id = actor.get('id')
        actor_id = str(raw_id) if raw_id is not None else None
        actor_email = actor.get('email')
        actor_role = actor.get('role')

    await conn.execute(
        '''
        INSERT INTO operations_audit_events (
          actor_user_id, actor_email, actor_role, action, resource_type,
          resource_id, outcome, correlation_key, is_demo, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
        ''',
        actor_id,
        actor_email,
        actor_role,
        action,
        resource_type,
        str(resource_id) if resource_id is not None else None,
        outcome,
        correlation_key,
        is_demo,
        payload,
    )
