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

from app.ai.drift import _contour_polygon, _to_latlon


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


def recommend_next_area(grid_dict: dict[str, Any]) -> dict[str, Any]:
    """The single highest remaining-mass cell of the posterior, as a
    geographic rectangle/centroid plus its probability mass (docs/40 Phase 3
    item 5). A recommendation for responder review - never an asset
    assignment, route, or automatic re-tasking.
    """
    values, x_edges, y_edges, origin_lat, origin_lon = _grid_from_dict(grid_dict)
    label = 'recommendation for responder review'
    if values.size == 0 or float(values.sum()) <= 0.0:
        return {'label': label, 'bounds': None, 'centroid': None, 'remaining_mass': 0.0}

    row, col = (int(i) for i in np.unravel_index(np.argmax(values), values.shape))
    x0, x1 = float(x_edges[col]), float(x_edges[col + 1])
    y0, y1 = float(y_edges[row]), float(y_edges[row + 1])

    xs = np.array([x0, x1, (x0 + x1) / 2.0])
    ys = np.array([y0, y1, (y0 + y1) / 2.0])
    lat, lon = _to_latlon(xs, ys, origin_lat, origin_lon)

    return {
        'label': label,
        'bounds': {
            'south': float(lat[0]), 'west': float(lon[0]),
            'north': float(lat[1]), 'east': float(lon[1]),
        },
        'centroid': {'lat': float(lat[2]), 'lon': float(lon[2])},
        'remaining_mass': float(values[row, col]),
    }


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
