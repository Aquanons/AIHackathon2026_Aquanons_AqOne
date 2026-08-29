"""Buoy-measured current-field estimator for drift prediction.

Loads the most recent ``current_observations`` from the database once, then
returns a synchronous callable that interpolates the observed current at any
particle position and time.  Particles outside the buoy array fall back to the
synthetic current field so the model never pretends the array covers the whole
ocean.

Interpolation is inverse-distance weighting in space and linear interpolation
in time between the two bracketing observations for each buoy.  The factory
reports the fraction of particle-steps that used real observations versus
fallback so the dashboard can surface how much of the prediction was
array-driven.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import asyncpg
import numpy as np

from app.ai.drift import _synthetic_current_vector

IDW_POWER = 2.0
MAX_RADIUS_M = 111_000.0
MAX_AGE_SECONDS = 3600.0


def _haversine_m(lat1: np.ndarray, lon1: np.ndarray, lat2: float, lon2: float) -> np.ndarray:
    """Vectorised haversine distance in metres from arrays to a single point."""
    lat1_rad = np.radians(lat1)
    lon1_rad = np.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)
    dlat = lat1_rad - lat2_rad
    dlon = lon1_rad - lon2_rad
    a = np.sin(dlat / 2.0) ** 2 + math.cos(lat2_rad) * np.cos(lat1_rad) * np.sin(dlon / 2.0) ** 2
    return 6_371_000.0 * 2.0 * np.arctan2(np.sqrt(a), np.sqrt(1.0 - a))


async def _load_buoy_observations(conn: asyncpg.Connection) -> dict[str, dict[str, Any]]:
    """Load buoy positions and their observation time-series from the DB.

    Only ``observed_u_mps`` / ``observed_v_mps`` are loaded.  The ``true_*``
    columns are never selected.
    """
    rows = await conn.fetch(
        '''
        SELECT b.id AS buoy_id,
               b.lat AS buoy_lat,
               b.lon AS buoy_lon,
               co.observed_at,
               co.observed_u_mps,
               co.observed_v_mps
        FROM current_observations co
        JOIN buoys b ON b.id = co.buoy_id
        WHERE b.lat IS NOT NULL AND b.lon IS NOT NULL
        ORDER BY co.observed_at
        '''
    )
    buoys: dict[str, dict[str, Any]] = {}
    for row in rows:
        bid = row['buoy_id']
        if bid not in buoys:
            buoys[bid] = {
                'lat': float(row['buoy_lat']),
                'lon': float(row['buoy_lon']),
                'times': [],
                'u': [],
                'v': [],
            }
        buoys[bid]['times'].append(row['observed_at'].timestamp())
        buoys[bid]['u'].append(float(row['observed_u_mps']))
        buoys[bid]['v'].append(float(row['observed_v_mps']))
    for buoy in buoys.values():
        buoy['times'] = np.array(buoy['times'], dtype=float)
        buoy['u'] = np.array(buoy['u'], dtype=float)
        buoy['v'] = np.array(buoy['v'], dtype=float)
    return buoys


async def count_nearby_fresh_buoys(pool: asyncpg.Pool, lat: float, lon: float, at: datetime) -> int:
    """How many distinct buoys have a current observation within
    ``MAX_RADIUS_M`` of ``(lat, lon)`` and within ``MAX_AGE_SECONDS`` of
    ``at``.

    The field-geometry half of the docs/40 Phase 2 production quality gate.
    One buoy gives a single point value, not a spatial gradient - a
    production run needs more than one to interpolate a direction rather
    than extrapolate blindly from a lone reading.
    """
    async with pool.acquire() as conn:
        buoys = await _load_buoy_observations(conn)

    target_time = at.astimezone(UTC).timestamp()
    count = 0
    for buoy in buoys.values():
        if len(buoy['times']) == 0:
            continue
        dist_m = _haversine_m(np.array([lat]), np.array([lon]), buoy['lat'], buoy['lon'])[0]
        if dist_m >= MAX_RADIUS_M:
            continue
        nearest_age = float(np.min(np.abs(buoy['times'] - target_time)))
        if nearest_age <= MAX_AGE_SECONDS:
            count += 1
    return count


async def create_current_field_factory(
    pool: asyncpg.Pool,
) -> Callable[[np.ndarray, np.ndarray, datetime], tuple[np.ndarray, np.ndarray]]:
    """Load observations once and return a vectorised current-field callable.

    The returned callable matches the contract expected by
    :func:`app.ai.drift.predict_drift`'s ``current_vector_fn`` parameter:
    ``(lat_array, lon_array, timestamp) -> (u_mps, v_mps)``.

    If the database contains no observations the callable degrades gracefully
    to the synthetic field for every particle.
    """
    async with pool.acquire() as conn:
        buoys = await _load_buoy_observations(conn)

    buoy_list = list(buoys.values())
    n_buoys = len(buoy_list)

    if n_buoys == 0:
        def _empty_field(
            lat: np.ndarray, lon: np.ndarray, at: datetime,
        ) -> tuple[np.ndarray, np.ndarray]:
            return _synthetic_current_vector(lat, lon, at)
        _empty_field.observation_fraction = 0.0  # type: ignore[attr-defined]
        return _empty_field

    buoy_lats = np.array([b['lat'] for b in buoy_list], dtype=float)
    buoy_lons = np.array([b['lon'] for b in buoy_list], dtype=float)
    buoy_times = [b['times'] for b in buoy_list]
    buoy_u = [b['u'] for b in buoy_list]
    buoy_v = [b['v'] for b in buoy_list]

    def _estimated_field(
        lat: np.ndarray, lon: np.ndarray, at: datetime,
    ) -> tuple[np.ndarray, np.ndarray]:
        n = len(lat)
        target_time = at.astimezone(UTC).timestamp()
        u_out = np.zeros(n, dtype=float)
        v_out = np.zeros(n, dtype=float)
        weights = np.zeros(n, dtype=float)

        for i in range(n_buoys):
            dist_m = _haversine_m(lat, lon, buoy_lats[i], buoy_lons[i])
            in_range = dist_m < MAX_RADIUS_M
            if not np.any(in_range):
                continue

            spatial_w = np.where(
                in_range,
                1.0 / np.power(np.maximum(dist_m, 1.0), IDW_POWER),
                0.0,
            )

            times_i = buoy_times[i]
            diffs = np.abs(times_i - target_time)
            nearest_idx = int(np.argmin(diffs))
            nearest_age = diffs[nearest_idx]

            if nearest_age > MAX_AGE_SECONDS:
                continue

            if len(times_i) >= 2:
                sorted_idx = int(np.searchsorted(times_i, target_time))
                if sorted_idx == 0:
                    obs_u = buoy_u[i][0]
                    obs_v = buoy_v[i][0]
                elif sorted_idx >= len(times_i):
                    obs_u = buoy_u[i][-1]
                    obs_v = buoy_v[i][-1]
                else:
                    t0 = times_i[sorted_idx - 1]
                    t1 = times_i[sorted_idx]
                    alpha = (target_time - t0) / (t1 - t0) if t1 != t0 else 0.0
                    obs_u = buoy_u[i][sorted_idx - 1] * (1.0 - alpha) + buoy_u[i][sorted_idx] * alpha
                    obs_v = buoy_v[i][sorted_idx - 1] * (1.0 - alpha) + buoy_v[i][sorted_idx] * alpha
            else:
                obs_u = buoy_u[i][0]
                obs_v = buoy_v[i][0]

            temporal_w = max(0.0, 1.0 - nearest_age / MAX_AGE_SECONDS)
            combined = spatial_w * temporal_w

            u_out += combined * obs_u
            v_out += combined * obs_v
            weights += combined

        has_obs = weights > 0.0
        n_observed = int(np.sum(has_obs))
        u_out[has_obs] /= weights[has_obs]
        v_out[has_obs] /= weights[has_obs]

        if n_observed < n:
            synthetic_u, synthetic_v = _synthetic_current_vector(lat[~has_obs], lon[~has_obs], at)
            u_out[~has_obs] = synthetic_u
            v_out[~has_obs] = synthetic_v

        _estimated_field.observation_fraction = n_observed / n  # type: ignore[attr-defined]
        return u_out, v_out

    return _estimated_field
