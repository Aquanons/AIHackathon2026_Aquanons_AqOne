import math
from datetime import UTC, datetime

import numpy as np

from app.ai.drift import ObjectClass, WindSeries, predict_drift


def _uniform_east_current(lat, lon, at):
    shape = np.asarray(lat).shape
    return np.ones(shape, dtype=float), np.zeros(shape, dtype=float)


def _zero_wind(lat, lon, start_at, horizon_hours):
    times = [start_at, start_at.replace(hour=min(23, start_at.hour + 1))]
    zeros = np.zeros(2, dtype=float)
    return WindSeries(times=times, u_mps=zeros, v_mps=zeros, source='test', degraded=False)


def test_uniform_eastward_current_moves_centroid_expected_distance():
    result = predict_drift(
        last_lat=11.6892,
        last_lon=122.3667,
        observed_at=datetime(2026, 8, 1, tzinfo=UTC),
        object_class=ObjectClass.person_in_water,
        forecast_hours=24,
        particle_count=1000,
        step_minutes=60,
        current_vector_fn=_uniform_east_current,
        wind_provider=_zero_wind,
        initial_spread_m=0.0,
        diffusivity_m2_s=0.0,
    )

    final = result.centroid_track[-1]
    east_m = (final['lon'] - 122.3667) * 111_320.0 * math.cos(math.radians(11.6892))
    assert abs(east_m - 86_400.0) < 500.0

    assert len(result.contours) == 3
    for feature in result.contours:
        assert feature['geometry']['type'] == 'Polygon'
        ring = feature['geometry']['coordinates'][0]
        assert ring[0] == ring[-1]
