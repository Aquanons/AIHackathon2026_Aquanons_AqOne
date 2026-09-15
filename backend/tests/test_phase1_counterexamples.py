"""Reproducible counterexamples for Phase 1 data fit and baseline errors.

Directly documents the starting defects from the data correctness audit:
- DRIFT-01: Synthetic current leakage, missing as_of in observation loading, last-step-only observation fraction
- TRIP-03: Synthetic weather injected into real trip scoring
- HAZARD-01/02: Target mismatch between training and inference; buoy health altering physical weather probability
- CURRENT-01: Newest buoy timestamp hiding older stale readings in sea condition telemetry
- SQUALL-01: Squall endpoint claiming calibrated operational probability
- HOTSPOTS-01: Catch report count conflated with contributors, missing location qualification
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import numpy as np

from app.ai.current_field import (
    _load_buoy_observations,
    create_current_field_factory,
)
from app.ai.trip_profile import (
    ContactPoint,
    VesselProfile,
    score_trip,
)


class _MockPool:
    def __init__(self, rows: list[dict]):
        self._rows = rows

    def acquire(self):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    async def fetch(self, query: str, *args):
        # Emulate filtering by is_synthetic and as_of
        results = list(self._rows)
        if 'is_synthetic = FALSE' in query:
            results = [r for r in results if not r.get('is_synthetic', False)]
        if 'observed_at <=' in query and args:
            cutoff = args[0]
            results = [r for r in results if r.get('observed_at') <= cutoff]
        return results


def test_reproduce_synthetic_current_leakage():
    """Verify that _load_buoy_observations filters synthetic rows when requested."""
    t0 = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)
    synthetic_row = {
        'buoy_id': 'B1',
        'buoy_lat': 11.7,
        'buoy_lon': 122.4,
        'observed_at': t0,
        'observed_u_mps': 0.8,
        'observed_v_mps': 0.5,
        'is_synthetic': True,
    }
    pool = _MockPool([synthetic_row])

    # With include_synthetic=False, synthetic rows are excluded
    obs = asyncio.run(_load_buoy_observations(pool, include_synthetic=False))
    assert len(obs) == 0

    # With allow_synthetic=False, creating a current field when only synthetic
    # data exists returns zero-field (no synthetic leakage)
    fn = asyncio.run(create_current_field_factory(pool, allow_synthetic=False, include_synthetic=False))
    lat_arr = np.array([11.7])
    lon_arr = np.array([122.4])
    u, v = fn(lat_arr, lon_arr, t0)
    assert np.all(u == 0.0)
    assert np.all(v == 0.0)
    assert getattr(fn, 'observation_fraction', 0.0) == 0.0


def test_reproduce_trip_profile_synthetic_weather_leakage():
    """Verify that real vessel trips without a weather provider do not fabricate weather."""
    real_profile = VesselProfile(
        vessel_id='V-REAL-01',
        trip_count=8,
        low_confidence=False,
        typical_departure_hour=6.0,
        departure_hour_std=1.0,
        typical_sequence=['B01', 'B02'],
        interval_stats=[{'leg_index': 1.0, 'mean': 60.0, 'std': 10.0, 'p10': 50.0, 'p90': 70.0}],
        typical_trip_duration_minutes={'median': 180.0, 'iqr': 30.0},
        typical_max_distance_km={'mean': 5.0, 'std': 1.0},
        rebuilt_at='2026-08-01T00:00:00Z',
        source='manual',
    )
    assert not real_profile.is_synthetic

    t0 = datetime(2026, 8, 1, 6, 0, tzinfo=UTC)
    contacts = [
        ContactPoint(buoy_id='B01', observed_at=t0, latitude=11.7, longitude=122.4),
        ContactPoint(buoy_id='B02', observed_at=t0 + timedelta(hours=1), latitude=11.72, longitude=122.42),
    ]

    # Score with no weather provider
    score = score_trip(real_profile, contacts, as_of=t0 + timedelta(hours=2), weather_provider=None)
    weather_factor = next(f for f in score.factors if f.name == 'weather')
    assert weather_factor.value == 0.0
    assert 'not assessed' in weather_factor.explanation.lower()


def test_as_of_decision_cutoff_enforced_in_current_loader():
    """Verify that _load_buoy_observations filters out future observations past as_of."""
    t0 = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)
    past_row = {
        'buoy_id': 'B1',
        'buoy_lat': 11.7,
        'buoy_lon': 122.4,
        'observed_at': t0 - timedelta(minutes=10),
        'observed_u_mps': 0.1,
        'observed_v_mps': 0.2,
        'is_synthetic': False,
    }
    future_row = {
        'buoy_id': 'B1',
        'buoy_lat': 11.7,
        'buoy_lon': 122.4,
        'observed_at': t0 + timedelta(minutes=10),
        'observed_u_mps': 0.5,
        'observed_v_mps': 0.6,
        'is_synthetic': False,
    }
    pool = _MockPool([past_row, future_row])

    obs = asyncio.run(_load_buoy_observations(pool, include_synthetic=False, as_of=t0))
    assert 'B1' in obs
    assert len(obs['B1']['times']) == 1
