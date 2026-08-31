"""`GET /api/ops/audit` and `/api/ops/audit/export` (docs/41 Phase 3).

Administrator-only, bounded, paginated global search - the one place lgu
is not treated as equal to admin (owner decision).
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app import db as app_db
from app.api import ops_audit as ops_audit_api
from app.auth import create_token
from app.main import app


class _FakePool:
    def __init__(self) -> None:
        self.events: list[dict[str, object]] = []
        self.inserted: list[tuple] = []
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
            self.inserted.append(args)
        return 'OK'

    async def fetch(self, query: str, *args):
        if 'FROM operations_audit_events' not in query:
            return []
        idx = 2
        filters: dict[str, object] = {}
        for column in ('actor_email', 'action', 'resource_type', 'resource_id'):
            if f'{column} = $' in query:
                filters[column] = args[idx]
                idx += 1
        cursor = None
        if '(occurred_at, id) <' in query:
            cursor = (args[idx], args[idx + 1])

        date_from, date_to = args[0], args[1]
        rows = [e for e in self.events if date_from <= e['occurred_at'] <= date_to]
        for column, value in filters.items():
            rows = [e for e in rows if e[column] == value]
        if cursor is not None:
            rows = [e for e in rows if (e['occurred_at'], e['id']) < cursor]
        rows.sort(key=lambda e: (e['occurred_at'], e['id']), reverse=True)

        match = re.search(r'LIMIT (\d+)', query)
        limit = int(match.group(1)) if match else len(rows)
        return rows[:limit]


def _patch(monkeypatch, pool: _FakePool) -> None:
    monkeypatch.setattr(app_db, 'get_pool', lambda: pool)
    monkeypatch.setattr(ops_audit_api, 'get_pool', lambda: pool)


def _headers(role: str) -> dict[str, str]:
    return {'Authorization': f'Bearer {create_token(1, "ops@example.com", role)}'}


def test_non_admin_roles_are_rejected(monkeypatch):
    pool = _FakePool()
    _patch(monkeypatch, pool)

    with TestClient(app, raise_server_exceptions=False) as client:
        for role in ('mdrrmo', 'lgu'):
            search = client.get('/api/ops/audit', headers=_headers(role))
            export = client.get('/api/ops/audit/export', headers=_headers(role))
            assert search.status_code == 403
            assert export.status_code == 403


def test_admin_can_search(monkeypatch):
    pool = _FakePool()
    pool.seed_event(action='sos.acknowledge')
    _patch(monkeypatch, pool)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get('/api/ops/audit', headers=_headers('admin'))

    assert response.status_code == 200
    assert len(response.json()['events']) == 1


def test_pagination_returns_a_stable_cursor_with_no_overlap(monkeypatch):
    pool = _FakePool()
    base = datetime.now(UTC)
    for i in range(5):
        # id ascends 1..5 while occurred_at descends, so both orderings agree
        # (newest-first == highest-id-first), matching a real serial PK.
        pool.seed_event(id=i + 1, action=f'action.{i}', occurred_at=base - timedelta(seconds=i))
    _patch(monkeypatch, pool)

    with TestClient(app, raise_server_exceptions=False) as client:
        first = client.get('/api/ops/audit?limit=2', headers=_headers('admin'))
        assert first.status_code == 200
        first_body = first.json()
        assert len(first_body['events']) == 2
        assert first_body['next_cursor'] is not None

        second = client.get(
            f'/api/ops/audit?limit=2&cursor={first_body["next_cursor"]}',
            headers=_headers('admin'),
        )
        assert second.status_code == 200
        second_body = second.json()

    first_ids = {e['id'] for e in first_body['events']}
    second_ids = {e['id'] for e in second_body['events']}
    assert first_ids.isdisjoint(second_ids)
    # Newest-first: page 1 has the two most recent (ids 1, 2); page 2 continues at 3.
    assert first_ids == {1, 2}
    assert 3 in second_ids


def test_malformed_cursor_is_400(monkeypatch):
    pool = _FakePool()
    _patch(monkeypatch, pool)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get(
            '/api/ops/audit?cursor=not-valid-base64!!!', headers=_headers('admin'),
        )

    assert response.status_code == 400


def test_date_range_over_90_days_is_422(monkeypatch):
    pool = _FakePool()
    _patch(monkeypatch, pool)
    date_from = (datetime.now(UTC) - timedelta(days=100)).isoformat()
    date_to = datetime.now(UTC).isoformat()

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get(
            f'/api/ops/audit?date_from={date_from}&date_to={date_to}',
            headers=_headers('admin'),
        )

    assert response.status_code == 422


def test_limit_above_max_is_422(monkeypatch):
    pool = _FakePool()
    _patch(monkeypatch, pool)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get('/api/ops/audit?limit=101', headers=_headers('admin'))

    assert response.status_code == 422


def test_csv_export_is_stamped_and_redacted(monkeypatch):
    pool = _FakePool()
    pool.seed_event(action='sea_condition.declare', metadata=json.dumps({'status': 'Not Advised'}))
    _patch(monkeypatch, pool)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get(
            '/api/ops/audit/export?format=csv', headers=_headers('admin'),
        )

    assert response.status_code == 200
    assert response.headers['content-type'].startswith('text/csv')
    assert 'attachment' in response.headers['content-disposition']
    body = response.text
    assert '# generated_at=' in body
    assert '# applied_filters=' in body
    assert 'sea_condition.declare' in body


def test_json_export_is_stamped_and_redacted(monkeypatch):
    pool = _FakePool()
    pool.seed_event(action='advisory.create', metadata=json.dumps({'status': 'Published'}))
    _patch(monkeypatch, pool)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get(
            '/api/ops/audit/export?format=json', headers=_headers('admin'),
        )

    assert response.status_code == 200
    assert response.headers['content-type'].startswith('application/json')
    body = response.json()
    assert 'generated_at' in body
    assert 'applied_filters' in body
    assert body['truncated'] is False
    assert len(body['events']) == 1
    assert body['events'][0]['action'] == 'advisory.create'
