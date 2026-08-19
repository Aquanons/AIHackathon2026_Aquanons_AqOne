"""Tests for buoy coverage computation.

The acceptance test asserts WiFi coverage < LoRa coverage (the whole point of
two radios) and both are between 0 and 1.
"""

from app.ai.coverage import compute_coverage
from app.geo import water_area_km2
from app.simulation.generator import build_plan


def _buoy_dicts():
    plan = build_plan(days=14, seed=42)
    return [
        {
            'lat': b['lat'],
            'lon': b['lon'],
            'contact_radius_m': b['contact_radius_m'],
            'lora_radius_m': b['lora_radius_m'],
        }
        for b in plan.buoys
    ]


def test_wifi_coverage_less_than_lora():
    buoys = _buoy_dicts()
    result = compute_coverage(buoys)
    assert result['wifi_coverage'] < result['lora_coverage'], (
        f'WiFi ({result["wifi_coverage"]:.3f}) should be less than '
        f'LoRa ({result["lora_coverage"]:.3f}) — buoys have short WiFi '
        f'and long LoRa'
    )


def test_both_fractions_between_zero_and_one():
    buoys = _buoy_dicts()
    result = compute_coverage(buoys)
    assert 0.0 <= result['wifi_coverage'] <= 1.0
    assert 0.0 <= result['lora_coverage'] <= 1.0


def test_water_area_is_positive():
    assert water_area_km2() > 0


def test_coverage_with_no_buoys():
    result = compute_coverage([])
    assert result['wifi_coverage'] == 0.0
    assert result['lora_coverage'] == 0.0


def test_single_buoy_wifi_smaller_than_lora():
    buoys = [{'lat': 11.65, 'lon': 122.45, 'contact_radius_m': 1000, 'lora_radius_m': 7000}]
    result = compute_coverage(buoys, n_samples=5000)
    assert result['wifi_coverage'] < result['lora_coverage']
    assert result['wifi_coverage'] > 0.0
    assert result['lora_coverage'] > 0.0
