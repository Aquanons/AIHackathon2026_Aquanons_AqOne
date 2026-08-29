"""app.ai.trip_profile_eval.evaluate: docs/38 Phase 4.

Before this phase, a normal (non-incident) trip was re-scored only at its
own historical contact timestamps (`as_of = contacts[idx - 1].observed_at`)
- never past its own final contact - so `status == 'alert'` was checked only
at moments the vessel was still actively checking in. The published
"0% false alarm rate" was true by construction, not by measurement
(docs/30_DEMO_DECISION_01_ANOMALY.md §1.1).

These tests exercise the pure `evaluate(rows, incidents)` function directly,
with no database, per the plan's regression-test requirement.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.ai.trip_profile_eval import evaluate


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


def _established_history(vessel_id: str, days: int = 4) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for day in range(days):
        start = datetime(2026, 8, 1 + day, 6, tzinfo=UTC)
        rows.extend(_rows_for_trip(vessel_id, f'trip-{day + 1}', start, ['B01', 'B02', 'B03']))
    return rows


def test_a_completed_normal_trip_can_false_alarm_once_the_clock_moves_forward():
    """The regression pin: a trip that finished its typical route and then
    legitimately went quiet (nothing more ever arrives) must be evaluated at
    a later clock, not only at its own historical timestamps. Empirically
    (with this exact profile shape) the model reaches 'alert' about two
    hours after the last contact - proving the sweep actually explores time
    the vessel was never observed at, which the pre-fix code could never do.
    """
    rows = _established_history('V-NORMAL')
    trip_5_start = datetime(2026, 8, 5, 6, tzinfo=UTC)
    rows += _rows_for_trip('V-NORMAL', 'trip-5', trip_5_start, ['B01', 'B02', 'B03'])

    result = evaluate(rows, incidents=[])

    assert result['normal_trips_evaluated'] == 5
    assert result['candidates_raised'] >= 1
    assert result['false_alarm_rate'] > 0.0


def test_an_incident_trip_is_still_detected_via_the_forward_sweep():
    rows = _established_history('V-INCIDENT')
    incident_contacts = _rows_for_trip('V-INCIDENT', 'trip-5', datetime(2026, 8, 5, 6, tzinfo=UTC), ['B01'])
    rows += incident_contacts
    incidents = [{'vessel_id': 'V-INCIDENT', 'last_contact_at': incident_contacts[-1]['observed_at']}]

    result = evaluate(rows, incidents)

    assert result['incidents_detected'] == 1
    assert result['median_detection_latency_minutes'] > 0.0
    assert result['factor_breakdown_example'] is not None


def test_aggregate_counts_are_internally_consistent():
    """docs/38 Phase 4 item 2: report eligible normal trips, candidates
    raised, false-candidate rate, and cases excluded for stale/out-of-
    coverage data, at minimum.
    """
    trip_5_start = datetime(2026, 8, 5, 6, tzinfo=UTC)
    rows = _established_history('V-A') + _rows_for_trip('V-A', 'trip-5', trip_5_start, ['B01', 'B02', 'B03'])
    rows += _established_history('V-B') + _rows_for_trip('V-B', 'trip-5', trip_5_start, ['B01', 'B02', 'B03'])

    result = evaluate(rows, incidents=[])

    # Every trip in the dataset (4 historical + 1 current, per vessel) is
    # its own normal sample - not just each vessel's latest trip.
    assert result['eligible_normal_trips'] == result['normal_trips_evaluated'] == 10
    assert 0 <= result['candidates_raised'] <= result['normal_trips_evaluated']
    assert result['false_alarm_rate'] == result['candidates_raised'] / result['normal_trips_evaluated']
    # Every contact in this synthetic dataset comes from a real, registered
    # buoy and every trip has at least one contact - nothing here should
    # ever be excluded for staleness or missing coverage.
    assert result['excluded_stale_or_out_of_coverage'] == 0
