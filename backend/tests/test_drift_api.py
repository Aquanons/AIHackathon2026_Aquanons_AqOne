"""Responder-confirmed drift/search cases (docs/40 Phase 1).

A case can only be opened from a source the responder has already confirmed
(an acknowledged SOS or an escalated anomaly case), never from an arbitrary
client-supplied position. Real incidents must never carry ground truth; only
a synthetic/demo incident may.

`_FakePool` is a tiny in-memory double for the handful of query shapes
`app.api.drift` issues - dispatched by substring the same way the existing
`_FakeStore` in test_anomaly_cases.py works. It intentionally does not model
`conn.transaction()`: the drift handlers below rely on a real unique index
for the hard duplicate-case guarantee (asserted here by having the fake raise
the same `asyncpg.UniqueViolationError` a real duplicate insert would).
"""

from __future__ import annotations

from datetime import UTC, datetime

import asyncpg
import pytest
from fastapi.testclient import TestClient

from app import db as app_db
from app.ai.drift import DriftResult
from app.api import drift as drift_api
from app.auth import create_token
from app.main import app

AUTH = {'Authorization': f"Bearer {create_token(1, 'ops@example.com', 'mdrrmo')}"}


def _fake_prediction() -> DriftResult:
    ring = [[122.0, 11.0], [122.1, 11.0], [122.1, 11.1], [122.0, 11.1], [122.0, 11.0]]
    return DriftResult(
        grid={
            'type': 'DensityGrid',
            'origin': {'lat': 11.0, 'lon': 122.0},
            'x_edges_m': [0.0, 500.0, 1000.0],
            'y_edges_m': [0.0, 500.0, 1000.0],
            'values': [[0.5, 0.5], [0.0, 0.0]],
        },
        contours=[
            {'type': 'Feature', 'geometry': {'type': 'Polygon', 'coordinates': [ring]}, 'properties': {'mass': 0.95}},
        ],
        centroid_track=[{'at': datetime(2026, 8, 1, tzinfo=UTC).isoformat(), 'lat': 11.05, 'lon': 122.05}],
        degraded=False,
        runtime_ms=1.23,
        wind_source='test',
        object_class='person_in_water',
    )


class _FakePool:
    def __init__(self) -> None:
        self.sos_events: dict[int, dict] = {}
        self.anomaly_cases: dict[int, dict] = {}
        self.buoy_contacts: list[dict] = []
        self.incidents: dict[int, dict] = {}
        self.search_sectors: list[dict] = []
        self._next_incident_id = 1

    def acquire(self):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def close(self) -> None:
        return None

    async def fetchval(self, _query: str, *_args):
        return 1

    async def fetchrow(self, query: str, *args):
        if 'FROM sos_events' in query:
            return self.sos_events.get(args[0])

        if 'FROM anomaly_cases WHERE id' in query:
            return self.anomaly_cases.get(args[0])

        if 'FROM buoy_contacts' in query:
            vessel_id, trip_id = args
            matches = [
                row for row in self.buoy_contacts
                if row['vessel_id'] == vessel_id and row['trip_id'] == trip_id
                and row['latitude'] is not None and row['longitude'] is not None
            ]
            if not matches:
                return None
            return max(matches, key=lambda row: row['observed_at'])

        if 'INSERT INTO incidents' in query:
            (
                vessel_id, at, lat, lon, reason, object_class,
                sos_id, anomaly_id, opened_by,
            ) = args
            if sos_id is not None and any(
                row['source_sos_event_id'] == sos_id for row in self.incidents.values()
            ):
                raise asyncpg.UniqueViolationError('duplicate source_sos_event_id')
            if anomaly_id is not None and any(
                row['source_anomaly_case_id'] == anomaly_id for row in self.incidents.values()
            ):
                raise asyncpg.UniqueViolationError('duplicate source_anomaly_case_id')
            incident_id = self._next_incident_id
            self._next_incident_id += 1
            self.incidents[incident_id] = {
                'id': incident_id,
                'vessel_id': vessel_id,
                'last_contact_at': at,
                'last_contact_lat': lat,
                'last_contact_lon': lon,
                'abnormal_reason': reason,
                'object_class': object_class,
                'true_track': None,
                'is_synthetic': False,
                'prior_grid': None,
                'posterior_grid': None,
                'source_sos_event_id': sos_id,
                'source_anomaly_case_id': anomaly_id,
                'opened_by': opened_by,
                'resolved_at': None,
                'resolved_by': None,
                'cancelled_at': None,
                'cancelled_by': None,
                'cancelled_reason': None,
            }
            return {'id': incident_id}

        if 'UPDATE incidents' in query and 'SET resolved_at' in query:
            incident_id, actor = args
            incident = self.incidents.get(incident_id)
            if incident is None:
                return None
            incident['resolved_at'] = incident['resolved_at'] or datetime.now(UTC)
            incident['resolved_by'] = incident['resolved_by'] or actor
            return dict(incident)

        if 'UPDATE incidents' in query and 'SET cancelled_at' in query:
            incident_id, actor, reason = args
            incident = self.incidents.get(incident_id)
            if incident is None:
                return None
            incident['cancelled_at'] = incident['cancelled_at'] or datetime.now(UTC)
            incident['cancelled_by'] = incident['cancelled_by'] or actor
            incident['cancelled_reason'] = incident['cancelled_reason'] or reason
            return dict(incident)

        if 'FROM incidents' in query and 'WHERE id = $1' in query:
            return self.incidents.get(args[0])

        return None

    async def fetch(self, query: str, *args):
        if 'FROM current_observations' in query:
            return []
        if 'FROM search_sectors' in query:
            incident_id = args[0]
            return [row for row in self.search_sectors if row['incident_id'] == incident_id]
        if 'FROM incidents' in query:
            return list(self.incidents.values())
        return []

    async def execute(self, query: str, *args):
        if 'UPDATE incidents SET prior_grid' in query:
            grid_json, incident_id = args
            incident = self.incidents[incident_id]
            incident['prior_grid'] = grid_json
            incident['posterior_grid'] = grid_json
        elif 'UPDATE incidents SET posterior_grid' in query:
            grid_json, incident_id = args
            self.incidents[incident_id]['posterior_grid'] = grid_json
        elif 'INSERT INTO search_sectors' in query:
            incident_id, x_min, x_max, y_min, y_max, pod = args
            self.search_sectors.append({
                'incident_id': incident_id,
                'x_min_m': x_min, 'x_max_m': x_max, 'y_min_m': y_min, 'y_max_m': y_max,
                'detection_probability': pod,
                'searched_at': datetime.now(UTC),
            })
        return 'OK'


@pytest.fixture
def pool(monkeypatch):
    fake = _FakePool()
    monkeypatch.setattr(app_db, 'get_pool', lambda: fake)
    monkeypatch.setattr(drift_api, 'get_pool', lambda: fake)
    monkeypatch.setattr(drift_api, 'predict_drift', lambda **kwargs: _fake_prediction())
    return fake


def _sos(pool, id_, *, acknowledged=True, resolved=False, has_position=True) -> None:
    pool.sos_events[id_] = {
        'vessel_id': 'V-001',
        'latitude': 11.7 if has_position else None,
        'longitude': 122.4 if has_position else None,
        'created_at': datetime(2026, 8, 29, 8, tzinfo=UTC),
        'acknowledged_at': datetime(2026, 8, 29, 8, 5, tzinfo=UTC) if acknowledged else None,
        'resolved_at': datetime(2026, 8, 29, 9, tzinfo=UTC) if resolved else None,
    }


def _anomaly(pool, id_, *, escalated=True, resolved=False, position=True) -> None:
    pool.anomaly_cases[id_] = {
        'vessel_id': 'V-002',
        'trip_id': 'trip-1',
        'escalated_at': datetime(2026, 8, 29, 8, 5, tzinfo=UTC) if escalated else None,
        'resolved_at': datetime(2026, 8, 29, 9, tzinfo=UTC) if resolved else None,
    }
    if position:
        pool.buoy_contacts.append({
            'vessel_id': 'V-002', 'trip_id': 'trip-1',
            'latitude': 11.65, 'longitude': 122.35,
            'observed_at': datetime(2026, 8, 29, 7, tzinfo=UTC),
        })


def test_public_caller_cannot_open_or_read_cases(pool):
    with TestClient(app, raise_server_exceptions=False) as client:
        assert client.post(
            '/api/ai/drift/cases',
            json={'source_type': 'sos', 'source_id': 1, 'object_class': 'person_in_water'},
        ).status_code == 401
        assert client.get('/api/ai/drift/incidents').status_code == 401
        assert client.get('/api/ai/drift/incident/1').status_code == 401


def test_unacknowledged_sos_cannot_open_a_case(pool):
    _sos(pool, 1, acknowledged=False)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            '/api/ai/drift/cases',
            headers=AUTH,
            json={'source_type': 'sos', 'source_id': 1, 'object_class': 'person_in_water'},
        )
    assert response.status_code == 409
    assert 'not been confirmed' in response.json()['detail']


def test_resolved_sos_cannot_open_a_case(pool):
    _sos(pool, 1, acknowledged=True, resolved=True)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            '/api/ai/drift/cases',
            headers=AUTH,
            json={'source_type': 'sos', 'source_id': 1, 'object_class': 'person_in_water'},
        )
    assert response.status_code == 409


def test_confirmed_sos_opens_a_case(pool):
    _sos(pool, 1)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            '/api/ai/drift/cases',
            headers=AUTH,
            json={'source_type': 'sos', 'source_id': 1, 'object_class': 'person_in_water'},
        )
    assert response.status_code == 200
    body = response.json()
    assert body['case_state'] == 'confirmed'
    assert body['source_type'] == 'sos'
    assert body['vessel_id'] == 'V-001'


def test_duplicate_case_creation_is_rejected(pool):
    _sos(pool, 1)
    with TestClient(app, raise_server_exceptions=False) as client:
        first = client.post(
            '/api/ai/drift/cases',
            headers=AUTH,
            json={'source_type': 'sos', 'source_id': 1, 'object_class': 'person_in_water'},
        )
        second = client.post(
            '/api/ai/drift/cases',
            headers=AUTH,
            json={'source_type': 'sos', 'source_id': 1, 'object_class': 'person_in_water'},
        )
    assert first.status_code == 200
    assert second.status_code == 409


def test_unescalated_anomaly_cannot_open_a_case(pool):
    _anomaly(pool, 5, escalated=False)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            '/api/ai/drift/cases',
            headers=AUTH,
            json={'source_type': 'anomaly', 'source_id': 5, 'object_class': 'intact_hull_adrift'},
        )
    assert response.status_code == 409


def test_escalated_anomaly_without_a_position_fix_is_rejected(pool):
    _anomaly(pool, 5, escalated=True, position=False)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            '/api/ai/drift/cases',
            headers=AUTH,
            json={'source_type': 'anomaly', 'source_id': 5, 'object_class': 'intact_hull_adrift'},
        )
    assert response.status_code == 422


def test_escalated_anomaly_opens_a_case(pool):
    _anomaly(pool, 5)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            '/api/ai/drift/cases',
            headers=AUTH,
            json={'source_type': 'anomaly', 'source_id': 5, 'object_class': 'intact_hull_adrift'},
        )
    assert response.status_code == 200
    assert response.json()['source_type'] == 'anomaly'


def test_resolved_case_rejects_a_new_search_report(pool):
    _sos(pool, 1)
    with TestClient(app, raise_server_exceptions=False) as client:
        opened = client.post(
            '/api/ai/drift/cases',
            headers=AUTH,
            json={'source_type': 'sos', 'source_id': 1, 'object_class': 'person_in_water'},
        ).json()
        incident_id = opened['id']

        client.post(f'/api/ai/drift/cases/{incident_id}/resolve', headers=AUTH)

        report = client.post(
            f'/api/ai/drift/incident/{incident_id}/searched',
            headers=AUTH,
            json={
                'x_min_m': -1000, 'x_max_m': 1000,
                'y_min_m': -1000, 'y_max_m': 1000,
                'detection_probability': 0.5,
            },
        )
    assert report.status_code == 409


def test_cancelled_case_rejects_a_new_search_report(pool):
    _sos(pool, 1)
    with TestClient(app, raise_server_exceptions=False) as client:
        incident_id = client.post(
            '/api/ai/drift/cases',
            headers=AUTH,
            json={'source_type': 'sos', 'source_id': 1, 'object_class': 'person_in_water'},
        ).json()['id']

        client.post(
            f'/api/ai/drift/cases/{incident_id}/cancel',
            headers=AUTH,
            json={'reason': 'false alarm, vessel found at dock'},
        )

        report = client.post(
            f'/api/ai/drift/incident/{incident_id}/searched',
            headers=AUTH,
            json={
                'x_min_m': -1000, 'x_max_m': 1000,
                'y_min_m': -1000, 'y_max_m': 1000,
                'detection_probability': 0.5,
            },
        )
    assert report.status_code == 409


def test_real_incident_response_has_no_ground_truth_field(pool):
    _sos(pool, 1)
    with TestClient(app, raise_server_exceptions=False) as client:
        incident_id = client.post(
            '/api/ai/drift/cases',
            headers=AUTH,
            json={'source_type': 'sos', 'source_id': 1, 'object_class': 'person_in_water'},
        ).json()['id']

        response = client.get(f'/api/ai/drift/incident/{incident_id}', headers=AUTH)

    assert response.status_code == 200
    body = response.json()
    assert 'ground_truth_track' not in body
    assert body['incident']['source_type'] == 'sos'
    assert body['incident']['case_state'] == 'confirmed'


def test_synthetic_incident_response_is_visibly_marked_and_carries_ground_truth(pool):
    pool.incidents[9] = {
        'id': 9,
        'vessel_id': 'V-DEMO',
        'last_contact_at': datetime(2026, 8, 1, 8, tzinfo=UTC),
        'last_contact_lat': 11.7,
        'last_contact_lon': 122.4,
        'abnormal_reason': 'capsize',
        'object_class': None,
        'true_track': [{'at': '2026-08-01T08:00:00+00:00', 'lat': 11.7, 'lon': 122.4}],
        'is_synthetic': True,
        'prior_grid': None,
        'posterior_grid': None,
        'source_sos_event_id': None,
        'source_anomaly_case_id': None,
        'resolved_at': None,
        'cancelled_at': None,
    }
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get('/api/ai/drift/incident/9', headers=AUTH)

    assert response.status_code == 200
    body = response.json()
    assert body['incident']['is_synthetic'] is True
    assert body['incident']['source_type'] == 'synthetic'
    assert body['ground_truth_track']


def test_incidents_endpoint_lists_summaries(pool):
    _sos(pool, 1)
    with TestClient(app, raise_server_exceptions=False) as client:
        client.post(
            '/api/ai/drift/cases',
            headers=AUTH,
            json={'source_type': 'sos', 'source_id': 1, 'object_class': 'swamped_banca'},
        )
        response = client.get('/api/ai/drift/incidents', headers=AUTH)

    assert response.status_code == 200
    payload = response.json()
    assert payload[0]['vessel_id'] == 'V-001'
    assert payload[0]['object_class'] == 'swamped_banca'
    assert payload[0]['source_type'] == 'sos'
    assert payload[0]['case_state'] == 'confirmed'
