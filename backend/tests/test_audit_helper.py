"""`app.audit.record_audit_event` (docs/41 Phase 2).

Callers own redaction - the helper only enforces a size/key-count ceiling
as a defense-in-depth guard - so these tests cover the ceiling and the
exact row shape it inserts, not per-route redaction (covered alongside
each wired route's own tests).
"""

from __future__ import annotations

import asyncio
import json

import pytest

from app.audit import record_audit_event


class _FakeConn:
    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple]] = []

    async def execute(self, query: str, *args):
        self.calls.append((query, args))
        return 'INSERT 0 1'


def test_inserts_expected_row_shape():
    conn = _FakeConn()
    asyncio.run(record_audit_event(
        conn,
        actor={'id': 7, 'email': 'ops@example.com', 'role': 'mdrrmo'},
        action='sos.acknowledge',
        resource_type='sos_event',
        resource_id=42,
        outcome='updated',
        correlation_key='corr-1',
        is_demo=True,
        metadata={'responder_status': 2},
    ))

    assert len(conn.calls) == 1
    query, args = conn.calls[0]
    assert 'INSERT INTO operations_audit_events' in query
    (
        actor_user_id, actor_email, actor_role, action, resource_type,
        resource_id, outcome, correlation_key, is_demo, metadata_json,
    ) = args
    assert actor_user_id == '7'
    assert actor_email == 'ops@example.com'
    assert actor_role == 'mdrrmo'
    assert action == 'sos.acknowledge'
    assert resource_type == 'sos_event'
    assert resource_id == '42'
    assert outcome == 'updated'
    assert correlation_key == 'corr-1'
    assert is_demo is True
    assert json.loads(metadata_json) == {'responder_status': 2}


def test_none_actor_and_resource_id_become_null():
    conn = _FakeConn()
    asyncio.run(record_audit_event(
        conn,
        actor=None,
        action='auth.login_failure',
        resource_type='user',
        resource_id=None,
        outcome='failure',
    ))

    _, args = conn.calls[0]
    actor_user_id, actor_email, actor_role, _, _, resource_id, *_ = args
    assert actor_user_id is None
    assert actor_email is None
    assert actor_role is None
    assert resource_id is None


def test_rejects_too_many_metadata_keys():
    conn = _FakeConn()
    metadata = {f'k{i}': i for i in range(20)}
    with pytest.raises(ValueError):
        asyncio.run(record_audit_event(
            conn,
            actor=None,
            action='x',
            resource_type='x',
            resource_id=None,
            outcome='x',
            metadata=metadata,
        ))
    assert conn.calls == []


def test_rejects_oversized_metadata_payload():
    conn = _FakeConn()
    metadata = {'note': 'x' * 3000}
    with pytest.raises(ValueError):
        asyncio.run(record_audit_event(
            conn,
            actor=None,
            action='x',
            resource_type='x',
            resource_id=None,
            outcome='x',
            metadata=metadata,
        ))
    assert conn.calls == []
