"""app.ai.squall_eval.evaluate: docs/39_SQUALL_NOWCASTING_IMPLEMENTATION_PLAN.md
Phase 4.

Before this phase, "evaluation" was nothing but train_from_rows()'s own
internal random GroupShuffleSplit, exposed as a side effect of training (and
which also silently overwrote the deployed model bundle). It had no time
separation - a model could be scored on an event chronologically earlier
than ones it trained on - and no accounting for low-quality windows, which
extract_pressure_features() would have silently filled with a nominal
1013.25 hPa baseline and scored as calm.

These tests exercise the pure `evaluate(rows, squalls, buoy_rows)` function
directly, with no database, per the plan's regression-test requirements.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.ai.squall import build_history
from app.ai.squall_eval import BASELINE_ARRAY_DROP_THRESHOLD_HPA, _build_windows, evaluate


def _buoy_rows() -> list[dict[str, object]]:
    return [
        {'id': 'B01', 'lat': 11.6892, 'lon': 122.3667, 'contact_radius_m': 900},
        {'id': 'B02', 'lat': 11.6992, 'lon': 122.4667, 'contact_radius_m': 900},
        {'id': 'B03', 'lat': 11.7192, 'lon': 122.5667, 'contact_radius_m': 900},
        {'id': 'B04', 'lat': 11.7192, 'lon': 122.6667, 'contact_radius_m': 900},
    ]


def _squall_events(count: int, start: datetime) -> list[dict[str, object]]:
    return [{'id': index + 1, 'started_at': start + timedelta(days=index)} for index in range(count)]


def _dataset(events: list[dict[str, object]], *, skip_around: datetime | None = None) -> list[dict[str, object]]:
    """Continuous 5-minute pressure readings across the whole span, with a
    genuine drop at B01/B02 approaching each event's started_at - the same
    drop shape backend/tests/test_squall.py's _quality_readings()/_readings()
    use for one event, generalized to several well-separated ones.

    `skip_around`, if given, omits every reading within 200 minutes of that
    timestamp - used to manufacture a single quality-failing event window
    without disturbing the rest of the dataset.
    """
    span_start = events[0]['started_at'] - timedelta(minutes=200)
    span_end = events[-1]['started_at'] + timedelta(minutes=200)
    buoy_ids = ['B01', 'B02', 'B03', 'B04']
    rows: list[dict[str, object]] = []
    ts = span_start
    while ts <= span_end:
        if skip_around is not None and abs((ts - skip_around).total_seconds()) <= 200 * 60:
            ts += timedelta(minutes=5)
            continue
        for index, buoy_id in enumerate(buoy_ids):
            base = 1015.0
            for event in events:
                offset_minutes = (event['started_at'] - ts).total_seconds() / 60.0
                if buoy_id == 'B01' and 0 <= offset_minutes <= 30:
                    base -= (30 - offset_minutes) * 0.06
                if buoy_id == 'B02' and 0 <= offset_minutes <= 45:
                    base -= (45 - offset_minutes) * 0.04
            rows.append({'buoy_id': buoy_id, 'observed_at': ts, 'pressure_hpa': base - index * 0.02})
        ts += timedelta(minutes=5)
    return rows


def test_train_and_test_splits_share_no_event_group():
    """The exact bug this phase closes: a model must never be scored on an
    event it could have trained on, or vice versa."""
    events = _squall_events(4, datetime(2026, 8, 1, 6, tzinfo=UTC))
    rows = _dataset(events)
    history = build_history(rows)

    windows = _build_windows(history, events, seed=42)

    train_groups = {w.group_id for w in windows if w.split == 'train' and w.label == 1}
    test_groups = {w.group_id for w in windows if w.split == 'test' and w.label == 1}

    assert train_groups, 'expected at least one training event'
    assert test_groups, 'expected at least one test event'
    assert train_groups.isdisjoint(test_groups)

    # Every test window's as_of must be no earlier than every train window's
    # as_of for the *events* split - the model must never be scored on
    # something chronologically before what it trained on. (Negative windows
    # may interleave in time on either side, which is fine - only the event
    # groups themselves must be strictly separated.)
    train_event_times = [w.as_of for w in windows if w.split == 'train' and w.label == 1]
    test_event_times = [w.as_of for w in windows if w.split == 'test' and w.label == 1]
    assert max(train_event_times) < min(test_event_times)


def test_evaluate_emits_every_required_metric():
    events = _squall_events(4, datetime(2026, 8, 1, 6, tzinfo=UTC))
    rows = _dataset(events)

    result = evaluate(rows, events, _buoy_rows())

    for key in (
        'precision',
        'recall',
        'mean_lead_time_minutes',
        'false_alert_rate',
        'brier_score',
        'baseline_precision',
        'baseline_recall',
        'baseline_mean_lead_time_minutes',
        'baseline_false_alert_rate',
        'baseline_brier_score',
        'excluded_low_quality_windows_train',
        'excluded_low_quality_windows_test',
        'train_events',
        'test_events',
        'recommendation',
        'note',
    ):
        assert key in result, f'missing required metric: {key}'

    assert result['note'] == 'synthetic demo evidence only - not field validation'
    assert result['recommendation'] in {'model', 'baseline'}
    assert result['train_events'] == 2
    assert result['test_events'] == 2


def test_a_quality_failing_event_window_is_excluded_not_scored_as_calm():
    """docs/39 Phase 4 test requirement: a quality-failing event window must
    be counted as excluded, never silently scored as a calm (label 0)
    prediction via extract_pressure_features()'s nominal-fill fallback.
    """
    events = _squall_events(4, datetime(2026, 8, 1, 6, tzinfo=UTC))
    # Event 4 lands in the test split (split_index = 4 // 2 = 2, so events
    # 3-4 are test). Strip all telemetry near it - none of its 5 lead-time
    # windows can pass assess_array_quality.
    broken_event_start = events[3]['started_at']
    rows = _dataset(events, skip_around=broken_event_start)

    result = evaluate(rows, events, _buoy_rows())

    # All 5 lead-time windows for the broken event must be excluded.
    assert result['excluded_low_quality_windows_test'] >= 5


def test_baseline_is_untuned_and_transparent():
    """The baseline must not be fit to any split - it is a fixed threshold
    on a single human-readable feature (docs/39 Phase 4 item 2)."""
    assert isinstance(BASELINE_ARRAY_DROP_THRESHOLD_HPA, float)
    assert BASELINE_ARRAY_DROP_THRESHOLD_HPA > 0


def test_too_few_events_is_rejected_rather_than_silently_evaluated():
    events = _squall_events(1, datetime(2026, 8, 1, 6, tzinfo=UTC))
    rows = _dataset(events)

    try:
        evaluate(rows, events, _buoy_rows())
        raise AssertionError('expected ValueError for a single-event dataset')
    except ValueError as exc:
        assert 'at least 2 events' in str(exc)
