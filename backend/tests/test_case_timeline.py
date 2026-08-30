"""`GET /api/ops/cases/{resource_type}/{resource_id}/timeline` (docs/41 Phase 3).

A responder-visible history for exactly one case - never a bulk cross-case
listing, and never a raw domain row (only the redacted audit summary).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app import db as app_db
from app.api import ops_audit as ops_audit_api
from app.auth import create_token
from app.main import app


class _FakePool:
    def __init__(self) -> None:
        self.events: list[dict[str, object]] = []
        self._next_id = 1

    def seed_event(self, **overrides: object) -> dict[str, object]:
        row: dict[str, object] = {
            'id': self._next_id,
            'occurred_at': datetime.now(UTC),
            'actor_user_id': '1',
            'actor_email': 'ops@example.com',
            'actor_role': 'mdrrmo',
            'action': 'sos.acknowledge',
            'resource_type': 'sos_event',
            'resource_id': '42',
            'outcome': 'applied',
            'correlation_key': None,
            'is_demo': False,
            'metadata': '{}',
        }
        row.update(overrides)
        self._next_id += 1
        self.events.append(row)
        return row

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
            self.seed_event(
                occurred_at=datetime.now(UTC), actor_user_id=actor_user_id,
                actor_email=actor_email, actor_role=actor_role, action=action,
                resource_type=resource_type, resource_id=resource_id,
                outcome=outcome, correlation_key=correlation_key,
                is_demo=is_demo, metadata=metadata,
            )
        return 'OK'

    async def fetch(self, query: str, *args):
        if 'FROM operations_audit_events' in query and 'resource_type = $1' in query:
            resource_type, resource_id, _limit = args
            rows = [
                e for e in self.events
                if e['resource_type'] == resource_type and e['resource_id'] == resource_id
            ]
            return sorted(rows, key=lambda e: (e['occurred_at'], e['id']), reverse=True)
        return []

    async def fetchval(self, query: str, *args):
        if 'operations_audit_events' in query and "'ops.case_view'" in query:
            actor_user_id, resource_type, resource_id, since = args
            for e in self.events:
                if (
                    e['action'] == 'ops.case_view'
                    and e['actor_user_id'] == actor_user_id
                    and e['resource_type'] == resource_type
                    and e['resource_id'] == resource_id
                    and e['occurred_at'] > since
                ):
                    return 1
            return None
        return None


def _patch(monkeypatch, pool: _FakePool) -> None:
    monkeypatch.setattr(app_db, 'get_pool', lambda: pool)
    monkeypatch.setattr(ops_audit_api, 'get_pool', lambda: pool)


def _headers(role: str = 'mdrrmo') -> dict[str, str]:
    return {'Authorization': f'Bearer {create_token(1, "ops@example.com", role)}'}


def test_timeline_only_returns_events_for_that_one_resource(monkeypatch):
    pool = _FakePool()
    pool.seed_event(resource_type='sos_event', resource_id='42', action='sos.acknowledge')
    pool.seed_event(resource_type='sos_event', resource_id='42', action='sos.resolve')
    pool.seed_event(resource_type='sos_event', resource_id='99', action='sos.acknowledge')
    pool.seed_event(resource_type='anomaly_case', resource_id='42', action='anomaly.acknowledge')
    _patch(monkeypatch, pool)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get('/api/ops/cases/sos_event/42/timeline', headers=_headers())

    assert response.status_code == 200
    body = response.json()
    actions = {e['action'] for e in body['events']}
    assert actions == {'sos.acknowledge', 'sos.resolve'}
    assert len(body['events']) == 2


def test_unknown_resource_type_is_422(monkeypatch):
    pool = _FakePool()
    _patch(monkeypatch, pool)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get('/api/ops/cases/not_a_real_type/42/timeline', headers=_headers())

    assert response.status_code == 422


def test_any_responder_role_can_view_a_case(monkeypatch):
    pool = _FakePool()
    pool.seed_event(resource_type='drift_incident', resource_id='7')
    _patch(monkeypatch, pool)

    with TestClient(app, raise_server_exceptions=False) as client:
        for role in ('mdrrmo', 'lgu', 'admin'):
            response = client.get(
                '/api/ops/cases/drift_incident/7/timeline', headers=_headers(role),
            )
            assert response.status_code == 200


def test_response_never_includes_raw_domain_fields(monkeypatch):
    pool = _FakePool()
    pool.seed_event(resource_type='sos_event', resource_id='42')
    _patch(monkeypatch, pool)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get('/api/ops/cases/sos_event/42/timeline', headers=_headers())

    event = response.json()['events'][0]
    assert set(event.keys()) == {
        'id', 'occurred_at', 'actor_email', 'actor_role', 'action',
        'outcome', 'correlation_key', 'is_demo', 'metadata',
    }


def test_second_view_within_dedup_window_records_no_second_event(monkeypatch):
    pool = _FakePool()
    _patch(monkeypatch, pool)

    with TestClient(app, raise_server_exceptions=False) as client:
        client.get('/api/ops/cases/sos_event/42/timeline', headers=_headers())
        client.get('/api/ops/cases/sos_event/42/timeline', headers=_headers())

    view_events = [e for e in pool.events if e['action'] == 'ops.case_view']
    assert len(view_events) == 1


def test_view_after_the_dedup_window_records_a_second_event(monkeypatch):
    pool = _FakePool()
    _patch(monkeypatch, pool)

    with TestClient(app, raise_server_exceptions=False) as client:
        client.get('/api/ops/cases/sos_event/42/timeline', headers=_headers())

    # Simulate the first view having happened outside the 15-minute window.
    for e in pool.events:
        if e['action'] == 'ops.case_view':
            e['occurred_at'] = datetime.now(UTC) - timedelta(minutes=20)

    with TestClient(app, raise_server_exceptions=False) as client:
        client.get('/api/ops/cases/sos_event/42/timeline', headers=_headers())

    view_events = [e for e in pool.events if e['action'] == 'ops.case_view']
    assert len(view_events) == 2
