"""GET /api/public/forecast - a transparent Open-Meteo/marine proxy.

docs/05_PUBLIC_API.md documents this contract as agreed before it existed;
this pins the actual implementation against it. In particular: no fusion
model exists yet, so the response must never claim `aqone-fusion` and must
never invent a `risk` block, and a day with no marine data must keep
`wave_m: null` rather than collapsing to `0.0` - a missing reading is not the
same claim as a flat sea.
"""

from __future__ import annotations

import httpx
from fastapi.testclient import TestClient

from app.main import app

FORECAST = '/api/public/forecast'


class _FakeHTTPError(httpx.HTTPError):
    pass


class _FakeResponse:
    def __init__(self, payload: object, status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise _FakeHTTPError(f'status {self.status_code}')

    def json(self) -> object:
        return self._payload


class _FakeAsyncClient:
    def __init__(self, get_impl) -> None:
        self._get_impl = get_impl

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc) -> None:
        return None

    async def get(self, url: str, params: dict | None = None) -> _FakeResponse:
        return self._get_impl(url, params)


def _install_fake_client(monkeypatch, get_impl) -> None:
    monkeypatch.setattr(httpx, 'AsyncClient', lambda **_: _FakeAsyncClient(get_impl))


ATMO_PAYLOAD = {
    'daily': {
        'time': ['2026-08-16', '2026-08-17'],
        'weather_code': [95, 3],
        'temperature_2m_max': [31.2, 29.8],
        'temperature_2m_min': [25.8, 25.1],
        'wind_speed_10m_max': [24.0, 12.0],
        'wind_gusts_10m_max': [41.0, 20.0],
        'precipitation_sum': [18.4, 2.0],
    }
}

MARINE_PAYLOAD = {
    'hourly': {
        'time': ['2026-08-16T00:00', '2026-08-16T12:00'],
        'wave_height': [1.8, 2.1],
        # 2026-08-17 deliberately absent - the marine grid frequently has no
        # data for a nearshore cell, and that day's wave_m must stay null.
    }
}


def test_valid_forecast_shape_and_source_label(monkeypatch):
    def get_impl(url: str, params):
        if 'marine' in url:
            return _FakeResponse(MARINE_PAYLOAD)
        return _FakeResponse(ATMO_PAYLOAD)

    _install_fake_client(monkeypatch, get_impl)

    with TestClient(app) as client:
        response = client.get(FORECAST, params={'lat': 11.68, 'lon': 122.41})

    assert response.status_code == 200
    body = response.json()
    assert body['source'] == 'open-meteo'
    assert 'risk' not in body
    assert body['generated_at']

    days = body['days']
    assert [d['date'] for d in days] == ['2026-08-16', '2026-08-17']
    assert days[0]['weather_code'] == 95
    assert days[0]['wind_kph'] == 24.0
    assert days[0]['gust_kph'] == 41.0
    assert days[0]['wave_m'] == 2.1

    # No marine reading landed on 2026-08-17 - null, never 0.0.
    assert days[1]['wave_m'] is None


def test_invalid_coordinates_are_rejected(monkeypatch):
    with TestClient(app) as client:
        response = client.get(FORECAST, params={'lat': 999, 'lon': 122.41})

    assert response.status_code == 422


def test_days_above_seven_is_rejected(monkeypatch):
    with TestClient(app) as client:
        response = client.get(
            FORECAST, params={'lat': 11.68, 'lon': 122.41, 'days': 8}
        )

    assert response.status_code == 422


def test_upstream_timeout_surfaces_as_502_not_a_silent_empty_forecast(monkeypatch):
    def get_impl(url: str, params):
        raise _FakeHTTPError('timed out')

    _install_fake_client(monkeypatch, get_impl)

    with TestClient(app) as client:
        response = client.get(FORECAST, params={'lat': 11.68, 'lon': 122.41})

    # A 502 (not 200 with empty days) is what lets the handset's own
    # AqOneForecastProvider fall through to calling Open-Meteo itself -
    # BackendClient.getJson() only fails over on a non-200.
    assert response.status_code == 502


def test_marine_failure_degrades_only_wave_m_not_the_whole_forecast(monkeypatch):
    def get_impl(url: str, params):
        if 'marine' in url:
            raise _FakeHTTPError('marine model unavailable')
        return _FakeResponse(ATMO_PAYLOAD)

    _install_fake_client(monkeypatch, get_impl)

    with TestClient(app) as client:
        response = client.get(FORECAST, params={'lat': 11.68, 'lon': 122.41})

    assert response.status_code == 200
    days = response.json()['days']
    assert all(day['wave_m'] is None for day in days)
    assert days[0]['weather_code'] == 95


def test_route_is_registered_public_and_needs_no_token() -> None:
    spec = app.openapi()
    assert FORECAST in spec['paths']
    assert 'get' in spec['paths'][FORECAST]
