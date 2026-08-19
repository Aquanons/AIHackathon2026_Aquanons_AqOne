"""Bayesian search allocation: update the posterior probability grid.

When a sector is searched and the target is not found, the probability mass
in that sector is reduced by the detection probability and the grid is
renormalised.  This is the standard Bayesian update used in operational SAR
(SAROPS, COSTAS).

The grid is the state — the particle simulation is not re-run on each update.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from app.ai.drift import _contour_polygon


def _grid_from_dict(grid_dict: dict[str, Any]) -> tuple[np.ndarray, np.ndarray, np.ndarray, float, float]:
    """Deserialize a DensityGrid dict into numpy arrays.

    Returns (values, x_edges, y_edges, origin_lat, origin_lon).
    """
    values = np.array(grid_dict['values'], dtype=float)
    x_edges = np.array(grid_dict['x_edges_m'], dtype=float)
    y_edges = np.array(grid_dict['y_edges_m'], dtype=float)
    origin = grid_dict['origin']
    return values, x_edges, y_edges, float(origin['lat']), float(origin['lon'])


def _grid_to_dict(
    values: np.ndarray,
    x_edges: np.ndarray,
    y_edges: np.ndarray,
    origin_lat: float,
    origin_lon: float,
) -> dict[str, Any]:
    """Serialize a grid back to a DensityGrid dict."""
    return {
        'type': 'DensityGrid',
        'origin': {'lat': origin_lat, 'lon': origin_lon},
        'x_edges_m': [float(v) for v in x_edges.tolist()],
        'y_edges_m': [float(v) for v in y_edges.tolist()],
        'values': values.tolist(),
    }


def update_posterior(
    grid_dict: dict[str, Any],
    sectors: list[dict[str, Any]],
) -> dict[str, Any]:
    """Apply Bayesian updates for all searched sectors to the prior grid.

    Each sector is a dict with keys: x_min_m, x_max_m, y_min_m, y_max_m,
    detection_probability.  Cells whose centres fall inside the sector bounding
    box are multiplied by (1 - detection_probability), then the grid is
    renormalised to sum to 1.

    Returns the updated grid dict (the posterior).
    """
    values, x_edges, y_edges, origin_lat, origin_lon = _grid_from_dict(grid_dict)
    x_centers = (x_edges[:-1] + x_edges[1:]) / 2.0
    y_centers = (y_edges[:-1] + y_edges[1:]) / 2.0

    xx, yy = np.meshgrid(x_centers, y_centers)

    for sector in sectors:
        mask = (
            (xx >= sector['x_min_m'])
            & (xx <= sector['x_max_m'])
            & (yy >= sector['y_min_m'])
            & (yy <= sector['y_max_m'])
        )
        values[mask] *= 1.0 - sector['detection_probability']

    total = values.sum()
    if total > 0:
        values /= total

    return _grid_to_dict(values, x_edges, y_edges, origin_lat, origin_lon)


def contours_from_grid(
    grid_dict: dict[str, Any],
    mass_targets: tuple[float, ...] = (0.50, 0.75, 0.95),
) -> list[dict[str, Any]]:
    """Recompute contours from a (possibly updated) grid.

    Uses the same logic as predict_drift but works on any grid dict.
    """
    values, x_edges, y_edges, origin_lat, origin_lon = _grid_from_dict(grid_dict)
    x_centers = (x_edges[:-1] + x_edges[1:]) / 2.0
    y_centers = (y_edges[:-1] + y_edges[1:]) / 2.0
    return [
        _contour_polygon(x_centers, y_centers, values, mass, origin_lat, origin_lon)
        for mass in mass_targets
    ]


def contour_area_km2(contour: dict[str, Any]) -> float:
    """Compute the area of a GeoJSON Polygon contour in km²."""
    ring = contour['geometry']['coordinates'][0]
    if len(ring) < 4:
        return 0.0
    n = len(ring) - 1
    area_deg2 = 0.0
    for i in range(n):
        lon_i, lat_i = ring[i]
        lon_j, lat_j = ring[(i + 1) % n]
        area_deg2 += lon_i * lat_j - lon_j * lat_i
    return abs(area_deg2 / 2.0) * 111.320 * 110.574
