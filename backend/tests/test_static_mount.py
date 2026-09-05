"""The static dashboard mount must not shadow the API.

StaticFiles is mounted at "/" so the dashboard is served from the same origin
as the API. Starlette matches routes in registration order, so if that mount is
ever registered before the routers it captures every API path - including
/health/ready, which turns the Railway healthcheck red for reasons that look
unrelated to the change. These tests fail loudly if that ordering regresses.
"""

from fastapi.testclient import TestClient

from app.main import app


def test_health_ready_returns_json_not_html(monkeypatch):
    monkeypatch.delenv('DATABASE_URL', raising=False)

    with TestClient(app) as client:
        response = client.get('/health/ready')

    # 503 is correct without a database; the point is that it is still JSON
    # from the API route and not HTML captured by the static mount.
    assert response.status_code == 503
    assert 'application/json' in response.headers['content-type']
    assert 'detail' in response.json()


def test_healthz_returns_json_not_html(monkeypatch):
    monkeypatch.delenv('DATABASE_URL', raising=False)

    with TestClient(app) as client:
        response = client.get('/healthz')

    assert response.status_code == 200
    assert 'application/json' in response.headers['content-type']
    assert response.json() == {'status': 'ok'}


def test_api_routes_are_not_captured_by_static_mount(monkeypatch):
    monkeypatch.delenv('DATABASE_URL', raising=False)

    with TestClient(app) as client:
        response = client.get('/api/ai/metrics')

    # Without eval results this is a 404, but it must be the router's JSON 404
    # carrying a detail message - not a static-file HTML 404.
    assert 'application/json' in response.headers['content-type']


def test_root_serves_dashboard_when_web_dir_present(monkeypatch):
    monkeypatch.delenv('DATABASE_URL', raising=False)

    with TestClient(app) as client:
        response = client.get('/')

    # In a full checkout web/index.html exists and is served. If the web
    # directory is absent the mount is skipped by design and "/" 404s.
    assert response.status_code in (200, 404)
    if response.status_code == 200:
        assert 'text/html' in response.headers['content-type']
        assert 'html/login.html' in response.text
