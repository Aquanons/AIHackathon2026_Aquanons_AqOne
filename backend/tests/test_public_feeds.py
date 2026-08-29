"""The handset's safety feeds must never require a login.

Fisherman identity is a device-local id with no password, by design. Before
these routes existed the app called /api/sea-condition, got 401, fell back to
/api/public/sea-condition, got 404, and displayed "Sea condition unavailable"
permanently. The squall model had no route to the handset at all.

These tests exist so nobody re-protects them by adding a router to the
_protected block in main.py without noticing.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_public_routes_exist_and_need_no_token() -> None:
    """No Authorization header anywhere in this test. That is the point."""
    spec = app.openapi()
    assert '/api/public/sea-condition' in spec['paths']
    assert '/api/public/squall' in spec['paths']
    assert '/api/public/forecast' in spec['paths']


def test_public_feeds_are_not_401() -> None:
    """A handset with no credentials must not be turned away.

    The database is unavailable in this test, so a 500/503 is acceptable - what
    must never happen is 401 or 404, which are the two failures that silently
    blank the fisherman's warning banner.
    """
    client = TestClient(app, raise_server_exceptions=False)
    for path in ('/api/public/sea-condition', '/api/public/squall'):
        response = client.get(path)
        assert response.status_code not in (401, 403), (
            f'{path} requires auth - the handset has no account and never will'
        )
        assert response.status_code != 404, f'{path} is not registered'


def test_protected_twins_still_require_auth() -> None:
    """Opening the public feeds must not have opened the dashboard's routes."""
    client = TestClient(app, raise_server_exceptions=False)
    for path in ('/api/sea-condition', '/api/ai/squall/current'):
        assert client.get(path).status_code in (401, 403), (
            f'{path} should still be protected'
        )
