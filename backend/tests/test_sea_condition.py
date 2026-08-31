"""`POST /api/sea-condition` (docs/41 Phase 1 actor fix, Phase 2 audit event).

No test file existed for this route before Phase 1/2 - it was only
referenced in test_auth.py's PROTECTED_PATHS (missing-token 401 only).
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app import db as app_db
from app.api import sea_condition as sea_condition_api
from app.auth import create_token
from app.main import app


class _FakePool:
    def __init__(self) -> None:
        self._next_id = 1
        self.audit_events: list[dict[str, object]] = []

    def acquire(self):
        return self

    def transaction(self):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def execute(self, query: str, *args):
        if 'INSERT INTO operations_audit_events' in query:
            (
                actor_user_id, actor_email, actor_role, action, resource_type,
                resource_id, outcome, correlation_key, is_demo, metadata,
            ) = args
            self.audit_events.append({
                'actor_user_id': actor_user_id,
                'actor_email': actor_email,
                'actor_role': actor_role,
                'action': action,
                'resource_type': resource_type,
                'resource_id': resource_id,
                'outcome': outcome,
                'correlation_key': correlation_key,
                'is_demo': is_demo,
                'metadata': metadata,
            })
        return 'OK'

    async def fetchrow(self, query: str, *args):
        if 'INSERT INTO sea_conditions' in query:
            status, reason, set_by_user_id, set_by_name = args
            row = {
                'id': self._next_id,
                'status': status,
                'reason': reason,
                'set_by_user_id': set_by_user_id,
                'set_by_name': set_by_name,
                'created_at': datetime.now(UTC),
            }
            self._next_id += 1
            return row
        return None


def _patch(monkeypatch, pool: _FakePool) -> None:
    monkeypatch.setattr(app_db, 'get_pool', lambda: pool)
    monkeypatch.setattr(sea_condition_api, 'get_pool', lambda: pool)


def _headers(role: str = 'mdrrmo') -> dict[str, str]:
    token = create_token(3, 'ops@example.com', role)
    return {'Authorization': f'Bearer {token}'}


def test_declare_persists_actor_from_token_not_body(monkeypatch):
    pool = _FakePool()
    _patch(monkeypatch, pool)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            '/api/sea-condition',
            headers=_headers(),
            json={
                'status': 'Safe to Go Out',
                'reason': 'calm seas',
                # A forged identity - the route must ignore both fields
                # entirely (docs/41 Phase 1).
                'set_by_user_id': '999',
                'set_by_name': 'Forged Name',
            },
        )

    assert response.status_code == 201
    current = response.json()['current']
    assert current['set_by_user_id'] == '3'
    assert current['set_by_name'] == 'ops@example.com'


def test_declare_records_one_redacted_audit_event(monkeypatch):
    pool = _FakePool()
    _patch(monkeypatch, pool)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            '/api/sea-condition',
            headers=_headers(),
            json={'status': 'Not Advised', 'reason': 'squall warning issued for the strait'},
        )

    assert response.status_code == 201
    assert len(pool.audit_events) == 1
    event = pool.audit_events[0]
    assert event['action'] == 'sea_condition.declare'
    assert event['resource_type'] == 'sea_condition'
    assert event['outcome'] == 'created'
    # reason is free text and must never appear in the redacted summary.
    assert 'squall warning' not in event['metadata']
    assert '"status": "Not Advised"' in event['metadata']


def test_declare_rejects_unknown_status(monkeypatch):
    pool = _FakePool()
    _patch(monkeypatch, pool)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            '/api/sea-condition',
            headers=_headers(),
            json={'status': 'Not A Real Status'},
        )

    assert response.status_code == 422
    assert pool.audit_events == []


def test_declare_requires_a_responder_role(monkeypatch):
    pool = _FakePool()
    _patch(monkeypatch, pool)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            '/api/sea-condition',
            headers=_headers(role='rogue'),
            json={'status': 'Safe to Go Out'},
        )

    assert response.status_code == 403
    assert pool.audit_events == []
