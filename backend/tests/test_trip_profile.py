from datetime import UTC, datetime, timedelta

from app.ai.trip_profile import (
    ContactPoint,
    WeatherSnapshot,
    build_profiles_from_contacts,
    score_trip,
)


def _rows_for_trip(vessel_id: str, trip_id: str, start: datetime, route: list[str]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for index, buoy_id in enumerate(route):
        rows.append(
            {
                'vessel_id': vessel_id,
                'trip_id': trip_id,
                'buoy_id': buoy_id,
                'observed_at': start + timedelta(minutes=45 * index),
                'latitude': 11.6892 + index * 0.01,
                'longitude': 122.3667 + index * 0.01,
            }
        )
    return rows


def _calm_weather(lat: float, lon: float, at: datetime) -> WeatherSnapshot:
    return WeatherSnapshot('test', False, 1.0, 90.0, 0)


def test_profile_builder_uses_fleet_fallback_for_cold_start():
    rows = []
    rows.extend(_rows_for_trip('V-001', 'trip-1', datetime(2026, 8, 1, 6, tzinfo=UTC), ['B01', 'B02', 'B03']))
    rows.extend(_rows_for_trip('V-001', 'trip-2', datetime(2026, 8, 2, 6, tzinfo=UTC), ['B01', 'B02', 'B03']))
    profiles = build_profiles_from_contacts(rows)

    assert profiles['V-001'].low_confidence is True
    assert profiles['V-001'].typical_sequence == ['B01', 'B02', 'B03']


def test_overdue_vessel_scores_high():
    rows = []
    for day in range(4):
        trip_day = datetime(2026, 8, 1 + day, 6, tzinfo=UTC)
        rows.extend(_rows_for_trip('V-002', f'trip-{day + 1}', trip_day, ['B01', 'B02', 'B03']))
    profiles = build_profiles_from_contacts(rows)
    profile = profiles['V-002']
    contacts = [
        ContactPoint('B01', datetime(2026, 8, 10, 6, tzinfo=UTC), 11.6892, 122.3667),
        ContactPoint('B02', datetime(2026, 8, 10, 6, 45, tzinfo=UTC), 11.6992, 122.3767),
    ]

    score = score_trip(
        profile,
        contacts,
        as_of=contacts[-1].observed_at + timedelta(hours=4),
        weather_provider=_calm_weather,
    )

    assert score.status == 'alert'
    assert score.score >= 0.85


def test_normal_vessel_scores_low():
    rows = []
    for day in range(4):
        trip_day = datetime(2026, 8, 1 + day, 6, tzinfo=UTC)
        rows.extend(_rows_for_trip('V-003', f'trip-{day + 1}', trip_day, ['B01', 'B02', 'B03']))
    profiles = build_profiles_from_contacts(rows)
    profile = profiles['V-003']
    contacts = [
        ContactPoint('B01', datetime(2026, 8, 10, 6, tzinfo=UTC), 11.6892, 122.3667),
        ContactPoint('B02', datetime(2026, 8, 10, 6, 45, tzinfo=UTC), 11.6992, 122.3767),
        ContactPoint('B03', datetime(2026, 8, 10, 7, 30, tzinfo=UTC), 11.7092, 122.3867),
    ]

    score = score_trip(
        profile,
        contacts,
        as_of=contacts[-1].observed_at + timedelta(minutes=5),
        weather_provider=_calm_weather,
    )

    assert score.status == 'normal'
    assert score.score < 0.25
