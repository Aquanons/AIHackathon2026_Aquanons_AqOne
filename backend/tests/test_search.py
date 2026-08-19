"""Tests for Bayesian search allocation.

Acceptance tests:
  (a) an unsearched grid is unchanged
  (b) a searched sector reduces mass there and the grid still sums to 1.0
  (c) with detection probability 1.0 the searched cells reach zero
"""

import numpy as np

from app.ai.search import contour_area_km2, contours_from_grid, update_posterior


def _make_grid(values, x_edges, y_edges, origin_lat=11.65, origin_lon=122.45):
    return {
        'type': 'DensityGrid',
        'origin': {'lat': origin_lat, 'lon': origin_lon},
        'x_edges_m': [float(v) for v in x_edges],
        'y_edges_m': [float(v) for v in y_edges],
        'values': values.tolist() if isinstance(values, np.ndarray) else values,
    }


def _simple_grid():
    values = np.array([
        [0.05, 0.10, 0.05],
        [0.10, 0.20, 0.10],
        [0.05, 0.10, 0.05],
    ], dtype=float)
    values /= values.sum()
    x_edges = np.array([0.0, 500.0, 1000.0, 1500.0])
    y_edges = np.array([0.0, 500.0, 1000.0, 1500.0])
    return _make_grid(values, x_edges, y_edges)


def test_unsearched_grid_unchanged():
    grid = _simple_grid()
    updated = update_posterior(grid, [])
    np.testing.assert_array_almost_equal(
        np.array(updated['values']),
        np.array(grid['values']),
    )


def test_searched_sector_reduces_mass_and_renormalises():
    grid = _simple_grid()
    sector = {
        'x_min_m': 0.0,
        'x_max_m': 500.0,
        'y_min_m': 0.0,
        'y_max_m': 500.0,
        'detection_probability': 0.8,
    }
    updated = update_posterior(grid, [sector])
    values = np.array(updated['values'])
    assert values.sum() > 0.999, f'grid should sum to ~1.0, got {values.sum()}'
    assert values.sum() < 1.001
    original = np.array(grid['values'])
    assert values[0, 0] < original[0, 0], 'searched cell should have less mass'


def test_detection_probability_one_zeros_cells():
    grid = _simple_grid()
    sector = {
        'x_min_m': 0.0,
        'x_max_m': 500.0,
        'y_min_m': 0.0,
        'y_max_m': 500.0,
        'detection_probability': 1.0,
    }
    updated = update_posterior(grid, [sector])
    values = np.array(updated['values'])
    assert values[0, 0] == 0.0, 'cell with dp=1.0 should be zero'
    assert values.sum() > 0.999, 'grid should still sum to ~1.0'


def test_multiple_sectors_accumulate():
    grid = _simple_grid()
    s1 = {'x_min_m': 0.0, 'x_max_m': 500.0, 'y_min_m': 0.0, 'y_max_m': 500.0, 'detection_probability': 0.5}
    s2 = {'x_min_m': 0.0, 'x_max_m': 500.0, 'y_min_m': 0.0, 'y_max_m': 500.0, 'detection_probability': 0.5}
    updated = update_posterior(grid, [s1, s2])
    values = np.array(updated['values'])
    original = np.array(grid['values'])
    assert values[0, 0] < original[0, 0] * 0.3, 'two 50% searches should leave < 25%'
    assert values.sum() > 0.999


def test_contours_recomputed_from_updated_grid():
    grid = _simple_grid()
    contours = contours_from_grid(grid)
    assert len(contours) == 3
    for c in contours:
        assert c['geometry']['type'] == 'Polygon'
        assert c['properties']['mass'] in (0.50, 0.75, 0.95)


def test_contour_area_positive():
    grid = _simple_grid()
    contours = contours_from_grid(grid)
    for c in contours:
        area = contour_area_km2(c)
        assert area > 0, f'contour area should be positive, got {area}'
