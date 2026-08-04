from datetime import UTC, datetime, timedelta

from app.ai.squall import (
    build_buoys,
    build_history,
    estimate_propagation_vector,
    extract_pressure_features,
)


def _buoy_rows() -> list[dict[str, object]]:
    return [
        {'id': 'B01', 'lat': 11.6892, 'lon': 122.3667, 'contact_radius_m': 900},
        {'id': 'B02', 'lat': 11.6992, 'lon': 122.4667, 'contact_radius_m': 900},
        {'id': 'B03', 'lat': 11.7192, 'lon': 122.5667, 'contact_radius_m': 900},
        {'id': 'B04', 'lat': 11.7192, 'lon': 122.6667, 'contact_radius_m': 900},
    ]


def _readings(as_of: datetime) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for offset_minutes in range(90, -5, -5):
        at = as_of - timedelta(minutes=offset_minutes)
        for index, buoy_id in enumerate(['B01', 'B02', 'B03', 'B04']):
            base = 1015.0
            if buoy_id == 'B01' and offset_minutes <= 30:
                base -= (30 - offset_minutes) * 0.06
            if buoy_id == 'B02' and offset_minutes <= 45:
                base -= (45 - offset_minutes) * 0.04
            rows.append({'buoy_id': buoy_id, 'observed_at': at, 'pressure_hpa': base - index * 0.02})
    return rows


def test_extract_pressure_features_returns_pressure_trace_and_buoy_rows():
    as_of = datetime(2026, 8, 4, 12, tzinfo=UTC)
    buoys = build_buoys(_buoy_rows())
    history = build_history(_readings(as_of))

    bundle = extract_pressure_features(history, buoys, as_of)

    assert bundle.feature_names[0] == 'mean_tendency_30'
    assert len(bundle.values) == len(bundle.feature_names)
    assert set(bundle.pressure_trace) == {'B01', 'B02', 'B03', 'B04'}
    assert len(bundle.buoy_rows) == 4
    assert bundle.buoy_rows[0].pressure_tendency_30 <= 0


def test_propagation_vector_estimate_tracks_eastward_onset_progression():
    buoys = build_buoys(_buoy_rows())
    as_of = datetime(2026, 8, 4, 12, tzinfo=UTC)
    onset_times = {
        'B01': as_of - timedelta(minutes=45),
        'B02': as_of - timedelta(minutes=30),
        'B03': as_of - timedelta(minutes=15),
        'B04': as_of,
    }

    estimate = estimate_propagation_vector(onset_times, buoys)

    assert 75 <= estimate.bearing_deg <= 105
    assert estimate.speed_mps > 0
    assert estimate.onset_coverage == 1.0
    assert estimate.onset_span_minutes == 45.0
    assert estimate.geometry_degenerate is False


def test_propagation_vector_flags_collinear_geometry_and_caps_confidence():
    buoys = build_buoys(
        [
            {'id': 'B01', 'lat': 11.6892, 'lon': 122.3667, 'contact_radius_m': 900},
            {'id': 'B02', 'lat': 11.6892, 'lon': 122.4667, 'contact_radius_m': 900},
            {'id': 'B03', 'lat': 11.6892, 'lon': 122.5667, 'contact_radius_m': 900},
            {'id': 'B04', 'lat': 11.6892, 'lon': 122.6667, 'contact_radius_m': 900},
        ]
    )
    as_of = datetime(2026, 8, 4, 12, tzinfo=UTC)
    onset_times = {
        'B01': as_of - timedelta(minutes=45),
        'B02': as_of - timedelta(minutes=30),
        'B03': as_of - timedelta(minutes=15),
        'B04': as_of,
    }

    estimate = estimate_propagation_vector(onset_times, buoys)

    assert estimate.geometry_degenerate is True
    assert estimate.r2 == 0.0
