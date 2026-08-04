"""Scan the dashboard's hardcoded coordinates against the service area.

The demo markers in web/js/dashboard.js are maintained by hand, and stray
positions kept reappearing - Boracay 50 km west, vessels inland over Panay -
because nothing checked them. This walks every `lat: x, lng: y` literal in the
file and classifies it, so an out-of-area marker fails here rather than being
spotted on a projector.

Shore stations must be on land; buoys, vessels, incidents and alerts must be in
the water polygon.
"""

import re
from pathlib import Path

import pytest

from app import geo

DASHBOARD_JS = Path(__file__).resolve().parents[2] / 'web' / 'js' / 'dashboard.js'

COORD_RE = re.compile(r'lat:\s*(-?\d+\.\d+)\s*,\s*lng:\s*(-?\d+\.\d+)')

# Shore gateways are the only markers that legitimately sit on land.
LAND_MARKER_NAMES = tuple(station['name'] for station in geo.SHORE_STATIONS)


def _line_context(source: str, index: int) -> str:
    line_start = source.rfind('\n', 0, index) + 1
    line_end = source.find('\n', index)
    return source[line_start : line_end if line_end != -1 else len(source)].strip()


@pytest.fixture(scope='module')
def coordinates():
    assert DASHBOARD_JS.exists(), f'dashboard not found at {DASHBOARD_JS}'
    source = DASHBOARD_JS.read_text(encoding='utf-8', errors='replace')
    found = []
    for match in COORD_RE.finditer(source):
        found.append(
            (float(match.group(1)), float(match.group(2)), _line_context(source, match.start()))
        )
    assert found, 'no coordinate literals found - has the format changed?'
    return found


def test_no_marker_sits_outside_the_service_area(coordinates):
    """Every marker is either water, or a named shore station on land."""
    offenders = []
    for lat, lon, context in coordinates:
        is_land_marker = any(name in context for name in LAND_MARKER_NAMES)
        in_water = geo.point_in_water(lat, lon)

        if is_land_marker:
            if in_water:
                offenders.append(f'shore station in water at {lat}, {lon} -> {context[:90]}')
        elif not in_water:
            offenders.append(f'marker on land/outside area at {lat}, {lon} -> {context[:90]}')

    assert not offenders, 'stray dashboard coordinates:\n  ' + '\n  '.join(offenders)


def test_no_coordinate_is_wildly_outside_aklan(coordinates):
    """Catches a lat/lng swap or a stale Boracay-era value."""
    for lat, lon, context in coordinates:
        assert 11.4 <= lat <= 12.1, f'latitude {lat} is outside Aklan -> {context[:90]}'
        assert 122.2 <= lon <= 122.8, f'longitude {lon} is outside Aklan -> {context[:90]}'
