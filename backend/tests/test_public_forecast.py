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


ATMO_PAYLOAD_WITH_HOURLY = {
    'latitude': 11.68,
    'longitude': 122.41,
    'timezone': 'Asia/Manila',
    'timezone_abbreviation': 'PST',
    'utc_offset_seconds': 28800,
    'daily': {
        'time': ['2026-08-16', '2026-08-17'],
        'weather_code': [95, 3],
        'temperature_2m_max': [31.2, 29.8],
        'temperature_2m_min': [25.8, 25.1],
        'wind_speed_10m_max': [24.0, 12.0],
        'wind_gusts_10m_max': [41.0, 20.0],
        'precipitation_sum': [18.4, 2.0],
    },
    'hourly': {
        'time': ['2026-08-16T00:00', '2026-08-16T01:00', '2026-08-16T02:00'],
        'weather_code': [95, 95, 3],
        'temperature_2m': [26.5, 26.2, 25.9],
        'wind_speed_10m': [22.0, 24.0, 15.0],
        'wind_gusts_10m': [38.0, 42.0, 25.0],
        'precipitation': [2.1, 1.5, 0.0],
    },
}

MARINE_PAYLOAD_HOURLY = {
    'hourly': {
        'time': ['2026-08-16T00:00', '2026-08-16T01:00', '2026-08-16T02:00'],
        'wave_height': [1.8, 2.1, 1.4],
    }
}


def test_hourly_alignment_and_units_metadata(monkeypatch):
    def get_impl(url: str, params):
        if 'marine' in url:
            return _FakeResponse(MARINE_PAYLOAD_HOURLY)
        return _FakeResponse(ATMO_PAYLOAD_WITH_HOURLY)

    _install_fake_client(monkeypatch, get_impl)

    with TestClient(app) as client:
        response = client.get(FORECAST, params={'lat': 11.68, 'lon': 122.41})

    assert response.status_code == 200
    body = response.json()
    assert body['source'] == 'open-meteo'
    assert body['timezone'] == 'Asia/Manila'
    assert body['timezone_abbreviation'] == 'PST'
    assert body['utc_offset_seconds'] == 28800
    assert body['latitude'] == 11.68
    assert body['longitude'] == 122.41

    units = body['units']
    assert units['time'] == 'iso8601'
    assert units['temperature'] == 'celsius'
    assert units['wind_speed'] == 'km/h'
    assert units['wind_gusts'] == 'km/h'
    assert units['precipitation'] == 'mm'
    assert units['wave_height'] == 'm'

    hours = body['hours']
    assert len(hours) == 3
    assert hours[0] == {
        'time': '2026-08-16T00:00',
        'weather_code': 95,
        'temp_c': 26.5,
        'wind_kph': 22.0,
        'gust_kph': 38.0,
        'precip_mm': 2.1,
        'wave_m': 1.8,
    }
    assert hours[1]['time'] == '2026-08-16T01:00'
    assert hours[1]['gust_kph'] == 42.0
    assert hours[1]['wave_m'] == 2.1
    assert hours[2]['time'] == '2026-08-16T02:00'
    assert hours[2]['weather_code'] == 3
    assert hours[2]['wave_m'] == 1.4

    # Preserves daily response
    days = body['days']
    assert len(days) == 2
    assert days[0]['wave_m'] == 2.1


def test_hourly_and_marine_timestamp_join_and_reordering(monkeypatch):
    # Marine arrives out of order and missing 01:00
    marine_payload = {
        'hourly': {
            'time': ['2026-08-16T02:00', '2026-08-16T00:00'],
            'wave_height': [1.4, 1.8],
        }
    }

    def get_impl(url: str, params):
        if 'marine' in url:
            return _FakeResponse(marine_payload)
        return _FakeResponse(ATMO_PAYLOAD_WITH_HOURLY)

    _install_fake_client(monkeypatch, get_impl)

    with TestClient(app) as client:
        response = client.get(FORECAST, params={'lat': 11.68, 'lon': 122.41})

    assert response.status_code == 200
    hours = response.json()['hours']
    # 00:00 joined by timestamp, not index 0 of marine
    assert hours[0]['time'] == '2026-08-16T00:00'
    assert hours[0]['wave_m'] == 1.8
    # 01:00 missing in marine -> null, never 0.0 or shifted
    assert hours[1]['time'] == '2026-08-16T01:00'
    assert hours[1]['wave_m'] is None
    # 02:00 joined correctly
    assert hours[2]['time'] == '2026-08-16T02:00'
    assert hours[2]['wave_m'] == 1.4


def test_unequal_series_arrays_handled_safely(monkeypatch):
    atmo_unequal = {
        'daily': ATMO_PAYLOAD_WITH_HOURLY['daily'],
        'hourly': {
            'time': ['2026-08-16T00:00', '2026-08-16T01:00', '2026-08-16T02:00'],
            'weather_code': [95, 95],  # 3rd missing
            'wind_gusts_10m': [38.0],  # 2nd and 3rd missing
        },
    }
    marine_unequal = {
        'hourly': {
            'time': ['2026-08-16T00:00', '2026-08-16T01:00', '2026-08-16T02:00'],
            'wave_height': [1.8],  # 2nd and 3rd missing
        }
    }

    def get_impl(url: str, params):
        if 'marine' in url:
            return _FakeResponse(marine_unequal)
        return _FakeResponse(atmo_unequal)

    _install_fake_client(monkeypatch, get_impl)

    with TestClient(app) as client:
        response = client.get(FORECAST, params={'lat': 11.68, 'lon': 122.41})

    assert response.status_code == 200
    hours = response.json()['hours']
    assert len(hours) == 3
    assert hours[0]['gust_kph'] == 38.0
    assert hours[0]['wave_m'] == 1.8

    assert hours[1]['gust_kph'] is None
    assert hours[1]['wave_m'] is None

    assert hours[2]['weather_code'] is None
    assert hours[2]['gust_kph'] is None
    assert hours[2]['wave_m'] is None


def test_nonfinite_and_negative_values_sanitized_to_none(monkeypatch):
    atmo_bad_vals = {
        'daily': ATMO_PAYLOAD_WITH_HOURLY['daily'],
        'hourly': {
            'time': ['2026-08-16T00:00', '2026-08-16T01:00'],
            'weather_code': [-1, 'bad'],
            'temperature_2m': [float('nan'), float('inf')],
            'wind_speed_10m': [-10.0, float('nan')],
            'wind_gusts_10m': [-5.0, float('inf')],
            'precipitation': [-1.0, 'rain'],
        },
    }
    marine_bad_vals = {
        'hourly': {
            'time': ['2026-08-16T00:00', '2026-08-16T01:00'],
            'wave_height': [-2.0, float('nan')],
        }
    }

    def get_impl(url: str, params):
        if 'marine' in url:
            return _FakeResponse(marine_bad_vals)
        return _FakeResponse(atmo_bad_vals)

    _install_fake_client(monkeypatch, get_impl)

    with TestClient(app) as client:
        response = client.get(FORECAST, params={'lat': 11.68, 'lon': 122.41})

    assert response.status_code == 200
    hours = response.json()['hours']
    for h in hours:
        assert h['weather_code'] is None
        assert h['temp_c'] is None
        assert h['wind_kph'] is None
        assert h['gust_kph'] is None
        assert h['precip_mm'] is None
        assert h['wave_m'] is None


def test_duplicate_and_ambiguous_timestamps_rejected_without_calm(monkeypatch):
    marine_duplicate = {
        'hourly': {
            'time': ['2026-08-16T00:00', '2026-08-16T00:00'],
            'wave_height': [1.2, 3.5],  # conflicting duplicate
        }
    }
    atmo_duplicate = {
        'daily': ATMO_PAYLOAD_WITH_HOURLY['daily'],
        'hourly': {
            'time': ['2026-08-16T00:00', '2026-08-16T00:00'],
            'weather_code': [95, 3],
            'wind_gusts_10m': [50.0, 20.0],
        },
    }

    def get_impl(url: str, params):
        if 'marine' in url:
            return _FakeResponse(marine_duplicate)
        return _FakeResponse(atmo_duplicate)

    _install_fake_client(monkeypatch, get_impl)

    with TestClient(app) as client:
        response = client.get(FORECAST, params={'lat': 11.68, 'lon': 122.41})

    assert response.status_code == 200
    hours = response.json()['hours']
    # Duplicate timestamp is rejected as ambiguous without calm defaults
    assert len(hours) == 1
    assert hours[0]['time'] == '2026-08-16T00:00'
    assert hours[0]['weather_code'] is None
    assert hours[0]['gust_kph'] is None
    assert hours[0]['wave_m'] is None


def test_malformed_hourly_payload_preserves_daily_response(monkeypatch):
    atmo_malformed_hourly = {
        'daily': ATMO_PAYLOAD['daily'],
        'hourly': 'not-a-dict',
    }

    def get_impl(url: str, params):
        if 'marine' in url:
            return _FakeResponse(MARINE_PAYLOAD)
        return _FakeResponse(atmo_malformed_hourly)

    _install_fake_client(monkeypatch, get_impl)

    with TestClient(app) as client:
        response = client.get(FORECAST, params={'lat': 11.68, 'lon': 122.41})

    assert response.status_code == 200
    body = response.json()
    assert body['hours'] == []
    assert len(body['days']) == 2


def test_hourly_bounded_by_forecast_days(monkeypatch):
    many_times = [f'2026-08-16T{h:02d}:00' for h in range(24)] + [
        f'2026-08-17T{h:02d}:00' for h in range(24)
    ]
    atmo_48h = {
        'daily': ATMO_PAYLOAD['daily'],
        'hourly': {
            'time': many_times,
            'weather_code': [1] * 48,
            'wind_gusts_10m': [15.0] * 48,
        },
    }

    def get_impl(url: str, params):
        return _FakeResponse(atmo_48h)

    _install_fake_client(monkeypatch, get_impl)

    with TestClient(app) as client:
        # Request only 1 day -> bounds to 24 hours max
        response = client.get(FORECAST, params={'lat': 11.68, 'lon': 122.41, 'days': 1})

    assert response.status_code == 200
    body = response.json()
    assert len(body['days']) == 1
    assert len(body['hours']) == 24

