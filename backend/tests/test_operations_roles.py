"""docs/41 Phase 1: `require_roles` action-matrix coverage.

Denied-role requests never reach a route handler - `require_roles` rejects
inside dependency resolution, before any database call - so most tests here
run without a database, same pattern as test_auth.py's PROTECTED_PATHS. The
sea-condition actor-derivation test is the one exception: it needs to observe
what actually got persisted, so it fakes the pool the same way
test_responder_loop.py / test_vessel_auth.py do.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app import db as app_db
from app.api import sea_condition as sea_condition_api
from app.auth import create_token
from app.main import app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv('DATABASE_URL', raising=False)
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


def _headers(role: str) -> dict[str, str]:
    token = create_token(1, 'ops@example.com', role)
    return {'Authorization': f'Bearer {token}'}


# Representative sample of RESPONDER_ROLES-gated routes: one per action
# category in the docs/05_PUBLIC_API.md matrix, picked for a minimal or
# absent request body so the 403 is unambiguously the role guard and not a
# body-validation error.
RESPONDER_GATED_ROUTES = [
    ('POST', '/api/sos/1/acknowledge', {}),
    ('POST', '/api/sos/1/resolve', {}),
    ('POST', '/api/ai/anomaly/cases/1/acknowledge', {}),
    ('POST', '/api/ai/drift/cases/1/resolve', {}),
    ('POST', '/api/advisories/alert', {
        'id': 'zone-1', 'name': 'Zone', 'score': 90, 'level': 'danger',
        'trigger': 'test', 'reasons': ['test'], 'source': 'test',
        'observedAt': '2026-08-15T00:00:00Z',
    }),
    ('POST', '/api/sea-condition', {'status': 'Safe to Go Out'}),
]


@pytest.mark.parametrize('method,path,body', RESPONDER_GATED_ROUTES)
def test_forged_role_outside_valid_roles_is_rejected(client, method, path, body):
    """A token whose role claim isn't mdrrmo/lgu/admin (e.g. corrupted or
    forged) must get 403, not 500 or a silent pass - require_user alone never
    validated role membership, which is the gap this phase closes.
    """
    response = client.request(method, path, headers=_headers('rogue'), json=body)
    assert response.status_code == 403


@pytest.mark.parametrize('method,path,body', RESPONDER_GATED_ROUTES)
@pytest.mark.parametrize('role', ['mdrrmo', 'lgu', 'admin'])
def test_every_operator_role_passes_the_responder_guard(client, method, path, body, role):
    """Responder incident actions and advisory/sea-condition publication stay
    open to all three operator roles (docs/05_PUBLIC_API.md action matrix) -
    only device management narrows by role. A 404/422/503 here is fine (no
    database is configured in this fixture); only 401/403 would mean the role
    guard itself is wrongly blocking a permitted role.
    """
    response = client.request(method, path, headers=_headers(role), json=body)
    assert response.status_code not in (401, 403)


def test_missing_token_is_401_not_403(client):
    response = client.post('/api/sea-condition', json={'status': 'Safe to Go Out'})
    assert response.status_code == 401


class _SeaConditionFakePool:
    def __init__(self) -> None:
        self.inserted: dict[str, object] | None = None

    def acquire(self):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def fetchrow(self, query: str, *args):
        if 'INSERT INTO sea_conditions' in query:
            status, reason, set_by_user_id, set_by_name = args
            self.inserted = {
                'id': 1,
                'status': status,
                'reason': reason,
                'set_by_user_id': set_by_user_id,
                'set_by_name': set_by_name,
                'created_at': datetime.now(UTC),
            }
            return self.inserted
        return None


def test_sea_condition_actor_is_derived_from_token_not_body(monkeypatch):
    """docs/41 Phase 1 fix: the request body previously supplied
    set_by_user_id/set_by_name directly to the INSERT, so any authenticated
    caller could attribute a declaration to someone else. Both must now
    reflect the authenticated token regardless of what the body claims.
    """
    pool = _SeaConditionFakePool()
    monkeypatch.setattr(app_db, 'get_pool', lambda: pool)
    monkeypatch.setattr(sea_condition_api, 'get_pool', lambda: pool)
    monkeypatch.delenv('DATABASE_URL', raising=False)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            '/api/sea-condition',
            headers=_headers('mdrrmo'),
            json={
                'status': 'Safe to Go Out',
                'reason': 'calm seas',
                'set_by_user_id': '999',
                'set_by_name': 'Forged Name',
            },
        )

    assert response.status_code == 201
    assert pool.inserted is not None
    assert pool.inserted['set_by_user_id'] == '1'
    assert pool.inserted['set_by_name'] == 'ops@example.com'
