from __future__ import annotations

from app.api.hotspots import MIN_REPORTERS, aggregate_hotspots
from app.main import app


def _row(vessel_id: str, lat: float = 11.69, lon: float = 122.43):
    return {'vessel_id': vessel_id, 'latitude': lat, 'longitude': lon}


def test_public_hotspot_route_is_registered() -> None:
    assert '/api/public/hotspots' in app.openapi()['paths']


def test_cells_below_reporter_threshold_are_withheld() -> None:
    rows = [_row(f'vessel-{index}') for index in range(MIN_REPORTERS - 1)]
    assert aggregate_hotspots(rows) == []


def test_eligible_cell_never_exposes_vessel_or_exact_points() -> None:
    rows = [_row(f'vessel-{index}') for index in range(MIN_REPORTERS)]
    cells = aggregate_hotspots(rows)
    assert len(cells) == 1
    assert cells[0]['observations'] == MIN_REPORTERS
    assert 'vessel_id' not in cells[0]
    assert 'latitude' not in cells[0]
    assert 'longitude' not in cells[0]


def test_one_prolific_vessel_cannot_publish_a_cell() -> None:
    rows = [_row('same-vessel') for _ in range(100)]
    assert aggregate_hotspots(rows) == []


def test_activity_scores_are_normalized() -> None:
    rows = [
        *[_row(f'a-{index}', 11.69, 122.43) for index in range(MIN_REPORTERS)],
        *[_row(f'b-{index}', 11.73, 122.47) for index in range(MIN_REPORTERS + 2)],
    ]
    cells = aggregate_hotspots(rows)
    assert len(cells) == 2
    assert cells[0]['score'] == 1.0
    assert all(0.0 <= float(cell['score']) <= 1.0 for cell in cells)
