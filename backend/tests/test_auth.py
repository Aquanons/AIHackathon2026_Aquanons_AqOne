"""Auth boundary tests.

These deliberately run without a database. The auth dependency executes before
any route handler touches the pool, so an unauthenticated request must be
rejected with 401 rather than reaching the database and failing with 503. If
that ordering ever inverts, these tests catch it.
"""

import pytest
from fastapi.testclient import TestClient

from app.auth import create_token, hash_password, normalize_email, verify_password
from app.main import app

PROTECTED_PATHS = [
    '/api/ai/anomaly/active',
    '/api/ai/drift/incidents',
    '/api/ai/squall/current',
    '/api/ai/metrics',
    '/api/sea-condition',
]


@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv('DATABASE_URL', raising=False)
    with TestClient(app) as c:
        yield c


@pytest.mark.parametrize('path', PROTECTED_PATHS)
def test_protected_paths_reject_missing_token(client, path):
    response = client.get(path)
    assert response.status_code == 401
    assert response.json()['detail'] == 'authentication required'


@pytest.mark.parametrize('path', PROTECTED_PATHS)
def test_protected_paths_reject_garbage_token(client, path):
    response = client.get(path, headers={'Authorization': 'Bearer not-a-real-token'})
    assert response.status_code == 401


def test_health_endpoints_stay_open(client):
    assert client.get('/healthz').status_code == 200
    # 503 without a database, but crucially not 401 - Railway's healthcheck
    # must never require a token.
    assert client.get('/health/ready').status_code == 503


def test_static_pages_stay_open(client):
    response = client.get('/html/login.html')
    assert response.status_code in (200, 404)
    assert response.status_code != 401


def test_admin_signup_disabled_without_setup_key(client, monkeypatch):
    monkeypatch.delenv('ADMIN_SETUP_KEY', raising=False)
    response = client.post(
        '/api/admin-signup',
        json={'setup_key': 'anything', 'email': 'a@example.com', 'password': 'password123'},
    )
    assert response.status_code == 503


def test_admin_signup_rejects_wrong_setup_key(client, monkeypatch):
    monkeypatch.setenv('ADMIN_SETUP_KEY', 'the-real-key')
    response = client.post(
        '/api/admin-signup',
        json={'setup_key': 'wrong-key', 'email': 'a@example.com', 'password': 'password123'},
    )
    assert response.status_code == 403


def test_admin_signup_rejects_short_password(client, monkeypatch):
    monkeypatch.setenv('ADMIN_SETUP_KEY', 'the-real-key')
    response = client.post(
        '/api/admin-signup',
        json={'setup_key': 'the-real-key', 'email': 'a@example.com', 'password': 'short'},
    )
    assert response.status_code == 422


def test_advisory_alert_requires_token(client):
    """Phase 4 fix: POST /api/advisories/alert previously had no auth
    dependency at all, despite publishing directly to `status: 'Published'`
    - visible immediately on GET /api/public/advisories, which has no token
    requirement by design. No caller of this route exists anywhere in this
    repo (checked web/js/dangerZonePredictor.js, web/js/advisoryService.js,
    and backend/app) - it was a live, unauthenticated
    publish-to-the-public-dashboard endpoint. See app/api/advisories.py
    trigger_danger_alert() for the full audit note.
    """
    response = client.post(
        '/api/advisories/alert',
        json={
            'id': 'zone-1',
            'name': 'Test Zone',
            'score': 90,
            'level': 'danger',
            'trigger': 'test',
            'reasons': ['test'],
            'source': 'test',
            'observedAt': '2026-08-15T00:00:00Z',
        },
    )
    assert response.status_code == 401


def test_me_requires_token(client):
    assert client.get('/api/me').status_code == 401


def test_me_accepts_valid_token(client):
    token = create_token(1, 'ops@example.com', 'mdrrmo')
    response = client.get('/api/me', headers={'Authorization': f'Bearer {token}'})
    assert response.status_code == 200
    assert response.json()['user']['email'] == 'ops@example.com'


def test_password_hash_roundtrip():
    hashed = hash_password('correct horse battery staple')
    assert hashed != 'correct horse battery staple'
    assert verify_password('correct horse battery staple', hashed)
    assert not verify_password('wrong password', hashed)


def test_email_normalisation():
    assert normalize_email('  Ops@Example.COM ') == 'ops@example.com'
