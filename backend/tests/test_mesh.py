"""The buoy network must actually be a mesh that reaches shore.

Buoys were previously sampled independently, which produced eight isolated
points: ~1 km radios spaced 4-9 km apart, with no path to land. That silently
contradicted the product's central claim - an SOS hopping buoy-to-buoy to a
shore gateway - and was invisible on the map unless you measured the circles.

Placement is now incremental and connectivity is a property of construction.
These tests assert it stayed that way.
"""

from collections import defaultdict, deque

import pytest

from app import geo
from app.simulation.generator import _distance_km, build_plan

# docs/02_LOAM_PACKET_SPEC.md: the worked example uses TTL 5, and a relay drops
# a frame once HOPS exceeds 15. A chain deeper than the TTL cannot deliver.
MAX_HOPS_TO_SHORE = 5


@pytest.fixture(scope='module')
def buoys():
    return build_plan(days=14, seed=42).buoys


def _adjacency(buoys):
    """Link two buoys when they are within the lower of their two LoRa ranges."""
    adj = defaultdict(list)
    for i, a in enumerate(buoys):
        for b in buoys[i + 1 :]:
            gap_m = _distance_km(a['lat'], a['lon'], b['lat'], b['lon']) * 1000.0
            if gap_m <= min(a['lora_radius_m'], b['lora_radius_m']):
                adj[a['id']].append(b['id'])
                adj[b['id']].append(a['id'])
    return adj


def test_every_buoy_has_both_radii(buoys):
    for buoy in buoys:
        assert 800 <= buoy['contact_radius_m'] <= 1500, 'WiFi SoftAP bubble'
        assert 6000 <= buoy['lora_radius_m'] <= 8000, 'LoRa link range'
        # The whole point of two radios: LoRa must massively out-reach WiFi.
        assert buoy['lora_radius_m'] > buoy['contact_radius_m'] * 3


def test_at_least_one_buoy_reaches_a_shore_gateway(buoys):
    linked = [b for b in buoys if b['is_gateway_linked']]
    assert linked, 'no buoy is within LoRa range of a shore station - the mesh has no exit'

    for buoy in linked:
        nearest_m = min(
            _distance_km(buoy['lat'], buoy['lon'], s['lat'], s['lon']) * 1000.0
            for s in geo.SHORE_STATIONS
        )
        assert nearest_m <= buoy['lora_radius_m'], (
            f"{buoy['id']} is flagged gateway-linked but the nearest shore station "
            f'is {nearest_m:.0f} m away, beyond its {buoy["lora_radius_m"]} m range'
        )


def test_mesh_graph_is_fully_connected(buoys):
    adj = _adjacency(buoys)
    start = buoys[0]['id']
    seen = {start}
    queue = deque([start])
    while queue:
        for neighbour in adj[queue.popleft()]:
            if neighbour not in seen:
                seen.add(neighbour)
                queue.append(neighbour)

    isolated = [b['id'] for b in buoys if b['id'] not in seen]
    assert not isolated, f'buoys unreachable from the rest of the mesh: {isolated}'


def test_every_buoy_reaches_shore_within_the_ttl_budget(buoys):
    """Breadth-first from the gateway-linked buoys, counting relay hops."""
    adj = _adjacency(buoys)
    hops = {b['id']: 0 for b in buoys if b['is_gateway_linked']}
    queue = deque(hops)
    while queue:
        node = queue.popleft()
        for neighbour in adj[node]:
            if neighbour not in hops:
                hops[neighbour] = hops[node] + 1
                queue.append(neighbour)

    stranded = [b['id'] for b in buoys if b['id'] not in hops]
    assert not stranded, f'buoys with no path to shore: {stranded}'

    deepest = max(hops.values())
    assert deepest <= MAX_HOPS_TO_SHORE, (
        f'deepest buoy is {deepest} hops from shore, exceeding the TTL budget '
        f'of {MAX_HOPS_TO_SHORE} in docs/02_LOAM_PACKET_SPEC.md'
    )


def test_buoy_coverage_overlaps_rather_than_stacking(buoys):
    """Neighbours should overlap - the Venn-diagram look - without duplicating.

    Two buoys moored within a few hundred metres of each other waste a node;
    two beyond LoRa range break the chain.
    """
    adj = _adjacency(buoys)
    for buoy in buoys:
        assert adj[buoy['id']], f"{buoy['id']} has no LoRa neighbour"
        nearest_m = min(
            _distance_km(buoy['lat'], buoy['lon'], o['lat'], o['lon']) * 1000.0
            for o in buoys
            if o['id'] != buoy['id']
        )
        assert nearest_m > 400, f"{buoy['id']} is stacked on top of a neighbour"
