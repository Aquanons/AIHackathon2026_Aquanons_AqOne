from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app import db as app_db
from app.ai.drift import DriftResult
from app.api import drift as drift_api
from app.auth import create_token
from app.main import app

# These routes now require a bearer token; the endpoint behaviour under test
# is unchanged, so the tests authenticate as a valid operator.
AUTH = {'Authorization': f"Bearer {create_token(1, 'ops@example.com', 'mdrrmo')}"}


class _FakePool:
    async def close(self) -> None:
        return None

    def acquire(self):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def fetchval(self, _query: str):
        return 1

    async def fetch(self, query: str):
        if 'FROM incidents' in query:
            return [
                {
                    'id': 7,
                    'vessel_id': 'V-007',
                    'last_contact_at': datetime(2026, 8, 1, 8, tzinfo=UTC),
                    'last_contact_lat': 11.7,
                    'last_contact_lon': 122.4,
                    'abnormal_reason': 'capsize',
                    'is_synthetic': True,
                }
            ]
        return []


def test_predict_endpoint_returns_geojson_polygons(monkeypatch):
    monkeypatch.setenv('DATABASE_URL', 'postgresql://example')

    async def fake_create_pool(_url):
        return _FakePool()

    monkeypatch.setattr(app_db.asyncpg, 'create_pool', fake_create_pool)

    ring = [[122.0, 11.0], [122.1, 11.0], [122.1, 11.1], [122.0, 11.1], [122.0, 11.0]]
    fake_result = DriftResult(
        grid={
            'type': 'DensityGrid',
            'origin': {'lat': 11.0, 'lon': 122.0},
            'x_edges_m': [],
            'y_edges_m': [],
            'values': [],
        },
        contours=[
            {'type': 'Feature', 'geometry': {'type': 'Polygon', 'coordinates': [ring]}, 'properties': {'mass': 0.95}},
            {'type': 'Feature', 'geometry': {'type': 'Polygon', 'coordinates': [ring]}, 'properties': {'mass': 0.75}},
            {'type': 'Feature', 'geometry': {'type': 'Polygon', 'coordinates': [ring]}, 'properties': {'mass': 0.5}},
        ],
        centroid_track=[{'at': datetime(2026, 8, 1, tzinfo=UTC).isoformat(), 'lat': 11.05, 'lon': 122.05}],
        degraded=False,
        runtime_ms=1.23,
        wind_source='test',
        object_class='person_in_water',
    )
    monkeypatch.setattr(drift_api, 'predict_drift', lambda **kwargs: fake_result)

    with TestClient(app) as client:
        response = client.post(
            '/api/ai/drift/predict',
            headers=AUTH,
            json={
                'last_lat': 11.69,
                'last_lon': 122.37,
                'observed_at': '2026-08-01T08:00:00+08:00',
                'object_class': 'person_in_water',
                'forecast_hours': 24,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload['contours'][0]['geometry']['type'] == 'Polygon'
    assert payload['contours'][0]['geometry']['coordinates'][0][0] == payload['contours'][0]['geometry'][
        'coordinates'
    ][0][-1]


def test_incidents_endpoint_lists_summaries(monkeypatch):
    monkeypatch.setenv('DATABASE_URL', 'postgresql://example')

    async def fake_create_pool(_url):
        return _FakePool()

    monkeypatch.setattr(app_db.asyncpg, 'create_pool', fake_create_pool)

    with TestClient(app) as client:
        response = client.get('/api/ai/drift/incidents', headers=AUTH)

    assert response.status_code == 200
    payload = response.json()
    assert payload[0]['id'] == 7
    assert payload[0]['vessel_id'] == 'V-007'
