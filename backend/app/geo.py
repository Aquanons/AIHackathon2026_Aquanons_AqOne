"""Geographic bounds for AqOne's service area: New Washington, Aklan.

Single source of truth for where synthetic data is allowed to exist. Both the
backend generator and the dashboard's demo markers derive from the constants
here, because when they were defined independently they drifted apart and
produced buoys inland and vessels 50 km outside the municipality.

Verified reference points (PhilAtlas, Philippine Statistics Authority):

    New Washington municipal centre   11.6473 N, 122.4356 E  (land, ~8 m elev.)
    Land area                         66.69 km2
    Marine waterbody                  Sibuyan Sea
    Kalibo                            10.36 km to the north-west
    Batan                              9.40 km to the south-east

The municipality is a narrow coastal strip on the west side of Batan Bay, whose
estuary opens north into the Sibuyan Sea.

────────────────────────────────────────────────────────────────────────────
WATER_POLYGON BELOW IS APPROXIMATE.

It was drawn from the reference points above, not traced from a coastline
dataset. It is deliberately conservative - held offshore of where the coast is
believed to run - so generated points land in water even if the true shoreline
sits somewhat differently.

To replace it with an exact polygon: draw the sea area on geojson.io, then
paste the ring's coordinates below as (lat, lon) pairs. Note that GeoJSON
orders coordinates [lon, lat], so they must be swapped. Nothing else needs to
change; every consumer reads this constant.

Paste WATER_POLYGON_GEOJSON (see geojson_feature_collection below) into
geojson.io to see the current polygon on a map.
────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np

# Municipal centre, on land. Used for map framing, never as a data position.
CENTER_LAT = 11.6473
CENTER_LON = 122.4356

KM_PER_DEG_LAT = 110.574


def km_per_deg_lon(lat: float) -> float:
    return 111.320 * math.cos(math.radians(lat))


# Ring of (lat, lon) covering Batan Bay and the open Sibuyan Sea north of it,
# out to roughly 15 km offshore. Ordered anticlockwise starting at the
# south-west corner of the bay.
WATER_POLYGON: tuple[tuple[float, float], ...] = (
    # ── Landward edge: follows the believed coastline. Drift tracks that reach
    #    this boundary have genuinely beached.
    (11.6620, 122.4600),  # inner Batan Bay, west shore off Poblacion/Tambak
    (11.6560, 122.4900),  # inner bay, toward the Batan side
    (11.6750, 122.5250),  # east side of the bay mouth
    (11.7150, 122.5500),  # bay mouth, opening north-east
    # ── Seaward edge: open Sibuyan Sea. This is an arbitrary limit on the demo
    #    area, not a shore. Held well offshore so drift simulations have room to
    #    run for many hours before hitting it - a track terminating here is an
    #    artefact of the bounds, not a beaching.
    (11.9600, 122.7400),
    (12.0200, 122.5600),
    (12.0200, 122.3400),
    (11.9000, 122.2900),
    # ── Back to the landward edge, west of the bay mouth.
    (11.7850, 122.3700),  # offshore, north of Kalibo's river mouth
    (11.7350, 122.3900),  # nearshore, west of the bay mouth
    (11.7050, 122.4250),  # nearshore, off Dumaguit / Ochando
    (11.6820, 122.4450),  # back into the bay along the west shore
)

# Shore gateways sit on land, unlike buoys. These are the LoRa mesh exit points
# to the internet, hosted at existing coastal facilities.
SHORE_STATIONS: tuple[dict[str, Any], ...] = (
    {
        'name': 'New Washington Municipal Hall',
        'lat': 11.6473,
        'lon': 122.4356,
        'type': 'MDRRMO Station',
        'role': 'Shore gateway',
    },
    {
        # Held slightly landward of the quay: a gateway is a shore installation,
        # and the invariant tested in tests/test_geo.py is that no shore station
        # falls inside the water polygon.
        'name': 'Dumaguit Port',
        'lat': 11.6700,
        'lon': 122.4370,
        'type': 'Port Facility',
        'role': 'Shore gateway',
    },
    {
        'name': 'BFAR Kalibo',
        'lat': 11.7086,
        'lon': 122.3653,
        'type': 'BFAR Station',
        'role': 'Shore gateway',
    },
)


def bounding_box() -> tuple[float, float, float, float]:
    """(min_lat, min_lon, max_lat, max_lon) of the water polygon."""
    lats = [lat for lat, _ in WATER_POLYGON]
    lons = [lon for _, lon in WATER_POLYGON]
    return min(lats), min(lons), max(lats), max(lons)


def point_in_water(lat: float, lon: float) -> bool:
    """Ray-casting point-in-polygon test.

    Implemented directly rather than pulling in shapely: the polygon is a
    simple ring of ~11 vertices and this keeps the production image free of a
    geometry dependency used in exactly one place.
    """
    inside = False
    count = len(WATER_POLYGON)
    for i in range(count):
        lat_i, lon_i = WATER_POLYGON[i]
        lat_j, lon_j = WATER_POLYGON[(i - 1) % count]
        intersects = (lat_i > lat) != (lat_j > lat)
        if intersects:
            lon_at_lat = (lon_j - lon_i) * (lat - lat_i) / (lat_j - lat_i) + lon_i
            if lon < lon_at_lat:
                inside = not inside
    return inside


def sample_water_points(rng: np.random.Generator, count: int) -> list[tuple[float, float]]:
    """Uniformly sample `count` positions inside the water polygon.

    Rejection sampling against the bounding box. The polygon fills a healthy
    fraction of its box, so this converges quickly; the iteration cap exists
    only so a future malformed polygon fails loudly instead of hanging.
    """
    min_lat, min_lon, max_lat, max_lon = bounding_box()
    points: list[tuple[float, float]] = []
    attempts = 0
    max_attempts = count * 500

    while len(points) < count:
        attempts += 1
        if attempts > max_attempts:
            raise RuntimeError(
                f'Could not sample {count} points inside WATER_POLYGON after '
                f'{max_attempts} attempts. The polygon is probably malformed '
                f'or degenerate.'
            )
        lat = float(rng.uniform(min_lat, max_lat))
        lon = float(rng.uniform(min_lon, max_lon))
        if point_in_water(lat, lon):
            points.append((lat, lon))

    return points


def nearest_water_point(lat: float, lon: float, step_km: float = 0.5) -> tuple[float, float]:
    """Nudge a position into the water if it has drifted onto land.

    Used as a guard on computed positions - vessel tracks, drift endpoints -
    where the maths may legitimately walk a point ashore.
    """
    if point_in_water(lat, lon):
        return lat, lon

    for radius_km in np.arange(step_km, 25.0, step_km):
        for bearing in range(0, 360, 15):
            rad = math.radians(bearing)
            candidate_lat = lat + (radius_km * math.cos(rad)) / KM_PER_DEG_LAT
            candidate_lon = lon + (radius_km * math.sin(rad)) / km_per_deg_lon(lat)
            if point_in_water(candidate_lat, candidate_lon):
                return candidate_lat, candidate_lon

    return CENTER_LAT, CENTER_LON


def geojson_feature_collection() -> dict[str, Any]:
    """The service area as GeoJSON, for map rendering and visual verification.

    Paste the output into geojson.io to check the polygon against the real
    coastline.
    """
    ring = [[lon, lat] for lat, lon in WATER_POLYGON]
    ring.append(ring[0])  # GeoJSON rings must close

    features: list[dict[str, Any]] = [
        {
            'type': 'Feature',
            'properties': {'name': 'New Washington municipal waters', 'kind': 'water'},
            'geometry': {'type': 'Polygon', 'coordinates': [ring]},
        }
    ]
    for station in SHORE_STATIONS:
        features.append(
            {
                'type': 'Feature',
                'properties': {
                    'name': station['name'],
                    'kind': 'shore_station',
                    'type': station['type'],
                },
                'geometry': {'type': 'Point', 'coordinates': [station['lon'], station['lat']]},
            }
        )

    return {'type': 'FeatureCollection', 'features': features}


if __name__ == '__main__':
    import json

    print(json.dumps(geojson_feature_collection(), indent=2))
