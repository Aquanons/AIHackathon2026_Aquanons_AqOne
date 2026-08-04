"""Every synthetic position must sit in New Washington's municipal waters.

Before app.geo existed, the generator swept an arc of bearings from a centre
point that was ~8 km off the real municipality, which put buoys inland over
Panay and vessels 50 km outside the service area. These tests make that class
of error fail loudly instead of only being visible on the demo map.
"""

import json

import numpy as np
import pytest

from app import geo
from app.simulation.generator import build_plan


def test_municipal_centre_is_on_land():
    # The centre is the town itself (elevation ~8 m), used only for framing.
    # If this ever reports water, the polygon has swallowed the coastline.
    assert not geo.point_in_water(geo.CENTER_LAT, geo.CENTER_LON)


def test_shore_stations_are_on_land():
    for station in geo.SHORE_STATIONS:
        assert not geo.point_in_water(station['lat'], station['lon']), (
            f"{station['name']} is inside the water polygon; shore gateways "
            f'are land installations.'
        )


def test_sampled_points_are_all_in_water():
    rng = np.random.default_rng(11)
    for lat, lon in geo.sample_water_points(rng, 3000):
        assert geo.point_in_water(lat, lon)


def test_points_far_outside_the_area_are_rejected():
    # Boracay / Malay - roughly 50 km west, and previously present in the
    # dashboard's demo data.
    assert not geo.point_in_water(11.9007, 121.9191)
    # Deep inland Panay.
    assert not geo.point_in_water(11.4000, 122.3000)


def test_geojson_ring_is_closed():
    collection = geo.geojson_feature_collection()
    polygon = collection['features'][0]
    ring = polygon['geometry']['coordinates'][0]
    assert ring[0] == ring[-1], 'GeoJSON polygon rings must close'
    # GeoJSON is [lon, lat] - a swap would put the site in the Indian Ocean.
    for lon, lat in ring:
        assert 121.0 < lon < 124.0
        assert 10.0 < lat < 13.0


@pytest.fixture(scope='module')
def plan():
    return build_plan(days=14, seed=42)


def test_generated_buoys_are_at_sea_within_municipal_waters(plan):
    from app.simulation.generator import _distance_km

    assert plan.buoys
    for buoy in plan.buoys:
        assert geo.point_in_water(buoy['lat'], buoy['lon']), f"buoy {buoy['id']} is on land"
        distance = _distance_km(geo.CENTER_LAT, geo.CENTER_LON, buoy['lat'], buoy['lon'])
        assert 3.0 <= distance <= 26.0, f"buoy {buoy['id']} is {distance:.1f} km out"


def test_generated_buoy_contacts_are_at_sea(plan):
    checked = 0
    for contact in plan.buoy_contacts:
        if contact.get('latitude') is None:
            continue
        checked += 1
        assert geo.point_in_water(contact['latitude'], contact['longitude'])
    assert checked > 0


def test_incident_drift_tracks_stay_in_water(plan):
    """Drift is pure advection and will happily cross land.

    The generator terminates a track at the last in-water position - a real
    drifting object beaches rather than continuing overland.
    """
    assert plan.incidents
    for incident in plan.incidents:
        assert geo.point_in_water(incident['last_contact_lat'], incident['last_contact_lon'])
        track = incident['true_track']
        if isinstance(track, str):
            track = json.loads(track)
        assert track, 'incident has an empty drift track'
        for point in track:
            assert geo.point_in_water(point['lat'], point['lon']), (
                f"incident {incident.get('id')} drifts onto land at "
                f"{point['lat']}, {point['lon']}"
            )


def test_drift_tracks_are_long_enough_to_demo(plan):
    """A beaching guard that terminates everything immediately is useless.

    Guards against a future polygon change that traps drift against an
    artificial seaward boundary and produces two-point tracks.
    """
    lengths = []
    for incident in plan.incidents:
        track = incident['true_track']
        if isinstance(track, str):
            track = json.loads(track)
        lengths.append(len(track))
    assert max(lengths) >= 20, f'longest drift track is only {max(lengths)} steps'
