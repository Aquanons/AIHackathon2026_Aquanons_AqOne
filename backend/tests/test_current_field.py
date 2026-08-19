from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

import numpy as np

from app.ai.current_field import create_current_field_factory
from app.ai.drift import _synthetic_current_vector


class _FakePool:
    """Minimal asyncpg pool mock that returns observation rows."""

    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = rows

    def acquire(self) -> _FakePool:
        return self

    async def __aenter__(self) -> _FakePool:
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    async def fetch(self, _query: str) -> list[dict[str, Any]]:
        return self._rows


def _make_observation(
    buoy_id: str,
    lat: float,
    lon: float,
    at: datetime,
    u: float,
    v: float,
) -> dict[str, Any]:
    return {
        'buoy_id': buoy_id,
        'buoy_lat': lat,
        'buoy_lon': lon,
        'observed_at': at,
        'observed_u_mps': u,
        'observed_v_mps': v,
    }


def test_no_observations_returns_synthetic():
    pool = _FakePool([])
    fn = asyncio.run(create_current_field_factory(pool))

    lat = np.array([11.7, 11.8], dtype=float)
    lon = np.array([122.4, 122.5], dtype=float)
    at = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)

    u_est, v_est = fn(lat, lon, at)
    u_synth, v_synth = _synthetic_current_vector(lat, lon, at)

    np.testing.assert_array_almost_equal(u_est, u_synth)
    np.testing.assert_array_almost_equal(v_est, v_synth)
    assert getattr(fn, 'observation_fraction', None) == 0.0


def test_observations_used_when_in_range():
    t0 = datetime(2026, 8, 1, 11, 50, tzinfo=UTC)
    t1 = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)

    rows = [
        _make_observation('B1', 11.7, 122.4, t0, 0.5, 0.3),
        _make_observation('B1', 11.7, 122.4, t1, 0.6, 0.4),
    ]
    pool = _FakePool(rows)
    fn = asyncio.run(create_current_field_factory(pool))

    lat = np.array([11.7], dtype=float)
    lon = np.array([122.4], dtype=float)
    at = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)

    u_est, v_est = fn(lat, lon, at)

    assert abs(float(u_est[0]) - 0.6) < 0.01
    assert abs(float(v_est[0]) - 0.4) < 0.01
    assert getattr(fn, 'observation_fraction', None) == 1.0


def test_fallback_for_distant_particles():
    t0 = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)

    rows = [
        _make_observation('B1', 11.7, 122.4, t0, 0.5, 0.3),
    ]
    pool = _FakePool(rows)
    fn = asyncio.run(create_current_field_factory(pool))

    far_lat = np.array([15.0], dtype=float)
    far_lon = np.array([126.0], dtype=float)
    at = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)

    u_est, v_est = fn(far_lat, far_lon, at)
    u_synth, v_synth = _synthetic_current_vector(far_lat, far_lon, at)

    np.testing.assert_array_almost_equal(u_est, u_synth)
    np.testing.assert_array_almost_equal(v_est, v_synth)
    assert getattr(fn, 'observation_fraction', None) == 0.0


def test_never_selects_true_columns():
    t0 = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)

    rows = [
        {
            'buoy_id': 'B1',
            'buoy_lat': 11.7,
            'buoy_lon': 122.4,
            'observed_at': t0,
            'observed_u_mps': 0.99,
            'observed_v_mps': 0.88,
        },
    ]
    pool = _FakePool(rows)
    fn = asyncio.run(create_current_field_factory(pool))

    lat = np.array([11.7], dtype=float)
    lon = np.array([122.4], dtype=float)

    u_est, v_est = fn(lat, lon, t0)

    assert abs(float(u_est[0]) - 0.99) < 0.01
    assert abs(float(v_est[0]) - 0.88) < 0.01
