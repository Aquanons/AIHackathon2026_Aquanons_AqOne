"""Tests for warning delivery state tracking (Phase 2 Task 2.5)."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app import db as app_db
from app.api import advisories as advisories_api
from app.main import app


class _FakeWarnConn:
    def __init__(self, pool: _FakeWarnPool):
        self.pool = pool

    async def fetchrow(self, query: str, *args):
        if 'SELECT id FROM advisories WHERE id = $1' in query:
            wid = args[0]
            if wid in self.pool.advisories:
                return {'id': wid}
            return None

        if 'INSERT INTO warning_delivery_events' in query:
            row = {
                'id': len(self.pool.deliveries) + 1,
                'warning_id': args[0],
                'vessel_id': args[1],
                'buoy_id': args[2],
                'delivery_state': args[3],
                'occurred_at': args[4],
                'recorded_at': datetime.now(UTC),
                'details': args[5],
            }
            self.pool.deliveries.append(row)
            return row

        raise AssertionError(f'unexpected query: {query}')

    async def fetch(self, query: str, *args):
        if 'SELECT id, warning_id, vessel_id, buoy_id, delivery_state' in query:
            wid = args[0]
            return [d for d in self.pool.deliveries if d['warning_id'] == wid]
        raise AssertionError(f'unexpected query: {query}')


class _FakeWarnAcquire:
    def __init__(self, conn: _FakeWarnConn):
        self.conn = conn

    async def __aenter__(self):
        return self.conn

    async def __aexit__(self, *args):
        pass


class _FakeWarnPool:
    def __init__(self):
        self.advisories = {101, 102}
        self.deliveries: list[dict[str, object]] = []

    def acquire(self):
        return _FakeWarnAcquire(_FakeWarnConn(self))


def test_warning_delivery_lifecycle_and_validation(monkeypatch):
    fake_pool = _FakeWarnPool()
    monkeypatch.setattr(app_db, 'get_pool', lambda: fake_pool)
    monkeypatch.setattr(advisories_api, 'get_pool', lambda: fake_pool)

    with TestClient(app, raise_server_exceptions=False) as client:
        # Invalid delivery state
        res_bad = client.post(
            '/api/advisories/delivery',
            json={'warning_id': 101, 'delivery_state': 'delivered_somewhere'},
        )
        assert res_bad.status_code == 422

        # Nonexistent warning
        res_404 = client.post(
            '/api/advisories/delivery',
            json={'warning_id': 999, 'delivery_state': 'gateway_accepted'},
        )
        assert res_404.status_code == 404

        # Step 1: gateway_accepted
        res_gw = client.post(
            '/api/advisories/delivery',
            json={
                'warning_id': 101,
                'delivery_state': 'gateway_accepted',
                'buoy_id': 'SHORE01',
            },
        )
        assert res_gw.status_code == 200
        assert res_gw.json()['delivery_state'] == 'gateway_accepted'

        # Step 2: buoy_received
        res_buoy = client.post(
            '/api/advisories/delivery',
            json={
                'warning_id': 101,
                'delivery_state': 'buoy_received',
                'buoy_id': 'BUOY01',
            },
        )
        assert res_buoy.status_code == 200

        # Step 3: phone_received
        res_phone = client.post(
            '/api/advisories/delivery',
            json={
                'warning_id': 101,
                'delivery_state': 'phone_received',
                'vessel_id': 'NW-001',
                'buoy_id': 'BUOY01',
            },
        )
        assert res_phone.status_code == 200

        # Step 4: user_acknowledged
        res_ack = client.post(
            '/api/advisories/delivery',
            json={
                'warning_id': 101,
                'delivery_state': 'user_acknowledged',
                'vessel_id': 'NW-001',
            },
        )
        assert res_ack.status_code == 200

        # Query deliveries for warning 101
        res_list = client.get('/api/advisories/101/deliveries')
        assert res_list.status_code == 200
        events = res_list.json()['deliveries']
        assert len(events) == 4
        states = [e['delivery_state'] for e in events]
        assert states == [
            'gateway_accepted',
            'buoy_received',
            'phone_received',
            'user_acknowledged',
        ]
