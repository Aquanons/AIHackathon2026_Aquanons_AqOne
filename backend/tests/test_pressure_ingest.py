"""Gateway-only pressure-event ingest (docs/39 Phase 1, docs/04 "Pressure
events").

The trusted-telemetry input squall nowcasting is gated on. These pin: the
endpoint is unreachable without GATEWAY_API_KEY - not the demo key, not an
operator token; a synthetic reading additionally needs DEMO_MODE and a valid
X-Demo-Key, unlike /api/v1/contacts which accepts synthetic through the
gateway key alone; malformed payloads 422; an unknown buoy_id 400; and a
retried event_id returns the original reading rather than creating a second
one.
"""

from __future__ import annotations

import asyncpg
from fastapi.testclient import TestClient

from app import db as app_db
from app.api import pressure_events as pressure_events_api
from app.main import app


def _payload(**overrides):
    base = {
        'v': 1,
        'event_id': 'gw-01-000099',
        'buoy_id': 'BUOY01',
        'observed_at': '2026-08-29T05:00:00Z',
        'pressure_hpa': 1008.4,
        'source': 'live',
    }
    base.update(overrides)
    return base


def test_missing_gateway_key_is_rejected(monkeypatch):
    monkeypatch.delenv('GATEWAY_API_KEY', raising=False)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post('/api/v1/pressure-events', json=_payload())
    assert response.status_code == 401


def test_wrong_gateway_key_is_rejected(monkeypatch):
    monkeypatch.setenv('GATEWAY_API_KEY', 'correct-key')
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            '/api/v1/pressure-events', json=_payload(), headers={'X-Api-Key': 'wrong-key'}
        )
    assert response.status_code == 401


def test_operator_bearer_token_does_not_substitute_for_the_gateway_key(monkeypatch):
    """A dashboard operator must not be able to manufacture a pressure reading."""
    monkeypatch.setenv('GATEWAY_API_KEY', 'correct-key')
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            '/api/v1/pressure-events', json=_payload(), headers={'Authorization': 'Bearer whatever'}
        )
    assert response.status_code == 401


def test_correct_key_reaches_the_handler(monkeypatch):
    monkeypatch.setenv('GATEWAY_API_KEY', 'correct-key')
    monkeypatch.delenv('DATABASE_URL', raising=False)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            '/api/v1/pressure-events', json=_payload(), headers={'X-Api-Key': 'correct-key'}
        )
    # 503 because there is no database in this test - the point is it is not 401.
    assert response.status_code == 503


def test_missing_source_is_rejected(monkeypatch):
    monkeypatch.setenv('GATEWAY_API_KEY', 'correct-key')
    body = _payload()
    del body['source']
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post('/api/v1/pressure-events', json=body, headers={'X-Api-Key': 'correct-key'})
    assert response.status_code == 422


def test_invalid_source_is_rejected(monkeypatch):
    monkeypatch.setenv('GATEWAY_API_KEY', 'correct-key')
    body = _payload(source='fake')
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post('/api/v1/pressure-events', json=body, headers={'X-Api-Key': 'correct-key'})
    assert response.status_code == 422


def test_invalid_timestamp_is_rejected(monkeypatch):
    monkeypatch.setenv('GATEWAY_API_KEY', 'correct-key')
    body = _payload(observed_at='not-a-timestamp')
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post('/api/v1/pressure-events', json=body, headers={'X-Api-Key': 'correct-key'})
    assert response.status_code == 422


def test_future_timestamp_beyond_skew_tolerance_is_rejected(monkeypatch):
    monkeypatch.setenv('GATEWAY_API_KEY', 'correct-key')
    body = _payload(observed_at='2099-01-01T00:00:00Z')
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post('/api/v1/pressure-events', json=body, headers={'X-Api-Key': 'correct-key'})
    assert response.status_code == 422


def test_empty_event_id_is_rejected(monkeypatch):
    monkeypatch.setenv('GATEWAY_API_KEY', 'correct-key')
    body = _payload(event_id='')
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post('/api/v1/pressure-events', json=body, headers={'X-Api-Key': 'correct-key'})
    assert response.status_code == 422


def test_oversized_buoy_id_is_rejected(monkeypatch):
    monkeypatch.setenv('GATEWAY_API_KEY', 'correct-key')
    body = _payload(buoy_id='B' * 33)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post('/api/v1/pressure-events', json=body, headers={'X-Api-Key': 'correct-key'})
    assert response.status_code == 422


def test_pressure_below_sanity_range_is_rejected(monkeypatch):
    monkeypatch.setenv('GATEWAY_API_KEY', 'correct-key')
    body = _payload(pressure_hpa=100.0)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post('/api/v1/pressure-events', json=body, headers={'X-Api-Key': 'correct-key'})
    assert response.status_code == 422


def test_pressure_above_sanity_range_is_rejected(monkeypatch):
    monkeypatch.setenv('GATEWAY_API_KEY', 'correct-key')
    body = _payload(pressure_hpa=5000.0)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post('/api/v1/pressure-events', json=body, headers={'X-Api-Key': 'correct-key'})
    assert response.status_code == 422


def test_synthetic_without_demo_mode_is_rejected(monkeypatch):
    monkeypatch.setenv('GATEWAY_API_KEY', 'correct-key')
    monkeypatch.delenv('DEMO_MODE', raising=False)
    monkeypatch.delenv('DEMO_CONTROL_KEY', raising=False)
    body = _payload(source='synthetic')
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post('/api/v1/pressure-events', json=body, headers={'X-Api-Key': 'correct-key'})
    assert response.status_code == 403


def test_synthetic_with_demo_mode_but_no_demo_key_is_rejected(monkeypatch):
    monkeypatch.setenv('GATEWAY_API_KEY', 'correct-key')
    monkeypatch.setenv('DEMO_MODE', 'true')
    monkeypatch.setenv('DEMO_CONTROL_KEY', 'demo-secret')
    body = _payload(source='synthetic')
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post('/api/v1/pressure-events', json=body, headers={'X-Api-Key': 'correct-key'})
    assert response.status_code == 403


class _FakePool:
    """In-memory stand-in for barometric_readings, matched loosely on query text.

    Mirrors the real SQL's semantics - ON CONFLICT (event_id) ... DO NOTHING,
    then a fallback SELECT of the existing row - without a real database.
    """

    def __init__(self) -> None:
        self.readings: dict[str, dict[str, object]] = {}
        self.known_buoys = {'BUOY01'}
        self._next_id = 1

    def acquire(self):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def execute(self, query: str, *args):
        return 'OK'

    async def fetchrow(self, query: str, *args):
        if 'INSERT INTO barometric_readings' in query:
            event_id, buoy_id, _observed_at, _pressure_hpa, source, _is_synthetic = args
            if buoy_id not in self.known_buoys:
                raise asyncpg.ForeignKeyViolationError('unknown buoy_id')
            if event_id in self.readings:
                return None
            row = {'id': self._next_id, 'event_id': event_id, 'buoy_id': buoy_id, 'source': source}
            self.readings[event_id] = row
            self._next_id += 1
            return row
        if 'SELECT id, event_id, buoy_id, source FROM barometric_readings' in query:
            (event_id,) = args
            return self.readings.get(event_id)
        return None


def test_first_submission_inserts_and_retry_returns_the_same_reading(monkeypatch):
    monkeypatch.setenv('GATEWAY_API_KEY', 'correct-key')
    pool = _FakePool()
    monkeypatch.setattr(app_db, 'get_pool', lambda: pool)
    monkeypatch.setattr(pressure_events_api, 'get_pool', lambda: pool)

    with TestClient(app, raise_server_exceptions=False) as client:
        first = client.post('/api/v1/pressure-events', json=_payload(), headers={'X-Api-Key': 'correct-key'})
        second = client.post('/api/v1/pressure-events', json=_payload(), headers={'X-Api-Key': 'correct-key'})

    assert first.status_code == 200
    assert second.status_code == 200
    first_body = first.json()
    second_body = second.json()
    assert first_body['deduped'] is False
    assert second_body['deduped'] is True
    # Same logical reading both times - the whole point of the idempotency key.
    assert first_body['reading_id'] == second_body['reading_id']
    assert len(pool.readings) == 1


def test_unknown_buoy_id_is_rejected(monkeypatch):
    monkeypatch.setenv('GATEWAY_API_KEY', 'correct-key')
    pool = _FakePool()
    monkeypatch.setattr(app_db, 'get_pool', lambda: pool)
    monkeypatch.setattr(pressure_events_api, 'get_pool', lambda: pool)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            '/api/v1/pressure-events',
            json=_payload(buoy_id='UNKNOWN-BUOY'),
            headers={'X-Api-Key': 'correct-key'},
        )
    assert response.status_code == 400


def test_synthetic_with_demo_mode_and_correct_demo_key_is_accepted(monkeypatch):
    monkeypatch.setenv('GATEWAY_API_KEY', 'correct-key')
    monkeypatch.setenv('DEMO_MODE', 'true')
    monkeypatch.setenv('DEMO_CONTROL_KEY', 'demo-secret')
    pool = _FakePool()
    monkeypatch.setattr(app_db, 'get_pool', lambda: pool)
    monkeypatch.setattr(pressure_events_api, 'get_pool', lambda: pool)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            '/api/v1/pressure-events',
            json=_payload(source='synthetic'),
            headers={'X-Api-Key': 'correct-key', 'X-Demo-Key': 'demo-secret'},
        )

    assert response.status_code == 200
    assert response.json()['source'] == 'synthetic'
