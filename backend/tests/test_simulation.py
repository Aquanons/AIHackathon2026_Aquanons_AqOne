import math

from app.simulation.generator import build_plan


def test_synthetic_plan_is_deterministic_and_plausible():
    plan_one = build_plan(days=14, seed=42)
    plan_two = build_plan(days=14, seed=42)

    assert plan_one.fingerprint() == plan_two.fingerprint()

    counts = plan_one.counts()
    assert 8 <= counts['buoys'] <= 12
    assert 30 <= counts['vessels'] <= 50
    # Raised from 6-10: that few events left almost no positives after a
    # train/test split, and the squall classifier scored 0.0 precision and
    # recall. 2-3 events per day is realistic for tropical waters.
    assert 28 <= counts['squall_events'] <= 44
    assert 5 <= counts['incidents'] <= 8
    assert counts['sos_events'] == counts['incidents']
    assert counts['barometric_readings'] == counts['buoys'] * 14 * 288
    assert counts['current_observations'] == counts['buoys'] * 14 * 96
    assert counts['buoy_contacts'] > counts['vessels'] * 14 * 2

    pressures = [row['pressure_hpa'] for row in plan_one.barometric_readings]
    assert min(pressures) >= 998.5
    assert max(pressures) <= 1016.5

    currents = [math.hypot(row['true_u_mps'], row['true_v_mps']) for row in plan_one.current_observations]
    observed_currents = [
        math.hypot(row['observed_u_mps'], row['observed_v_mps'])
        for row in plan_one.current_observations
    ]
    assert max(currents) <= 1.5
    assert max(observed_currents) <= 1.5

    example = plan_one.example_squall()
    assert example is not None
    assert example['observed_buoy_ids']
