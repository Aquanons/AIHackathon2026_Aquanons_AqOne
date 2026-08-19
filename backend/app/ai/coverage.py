"""Buoy coverage of the municipal water area.

Computes the fraction of WATER_POLYGON reachable within each buoy's WiFi
(contact_radius_m) and LoRa (lora_radius_m) radii using Monte Carlo sampling.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np

from app.geo import sample_water_points, water_area_km2

EARTH_RADIUS_M = 6_371_000.0
DEFAULT_SAMPLES = 10_000


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance in metres between two lat/lon points."""
    lat1_r = math.radians(lat1)
    lat2_r = math.radians(lat2)
    dlat = lat2_r - lat1_r
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2.0) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2.0) ** 2
    return EARTH_RADIUS_M * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def compute_coverage(
    buoys: list[dict[str, Any]],
    *,
    n_samples: int = DEFAULT_SAMPLES,
    seed: int = 42,
) -> dict[str, float]:
    """Estimate WiFi and LoRa coverage fractions of the water polygon.

    Returns a dict with keys:
        wifi_coverage  — fraction of water points within any buoy's contact_radius_m
        lora_coverage  — fraction within any buoy's lora_radius_m
        water_area_km2 — total area of WATER_POLYGON
        n_samples      — number of Monte Carlo points used
    """
    rng = np.random.default_rng(seed)
    points = sample_water_points(rng, n_samples)

    n_wifi = 0
    n_lora = 0

    for pt_lat, pt_lon in points:
        for buoy in buoys:
            dist = _haversine_m(pt_lat, pt_lon, buoy['lat'], buoy['lon'])
            if dist <= buoy.get('contact_radius_m', 0):
                n_wifi += 1
                break
        for buoy in buoys:
            dist = _haversine_m(pt_lat, pt_lon, buoy['lat'], buoy['lon'])
            if dist <= buoy.get('lora_radius_m', 0):
                n_lora += 1
                break

    return {
        'wifi_coverage': n_wifi / n_samples,
        'lora_coverage': n_lora / n_samples,
        'water_area_km2': water_area_km2(),
        'n_samples': n_samples,
    }
