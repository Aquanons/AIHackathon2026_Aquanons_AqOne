"""docs/41 Phase 1: `require_roles` action-matrix coverage.

Denied-role requests never reach a route handler - `require_roles` rejects
inside dependency resolution, before any database call - so every test here
runs without a database, same pattern as test_auth.py's PROTECTED_PATHS.
The sea-condition actor-derivation and audit-event tests live in
test_sea_condition.py, which fakes the pool since it needs to observe what
actually got persisted.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

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
