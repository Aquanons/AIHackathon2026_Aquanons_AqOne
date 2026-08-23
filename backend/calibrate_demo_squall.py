"""Standalone calibration harness — reproduces app/demo/scenarios.py pressure
staging and runs the REAL squall model against each beat."""
import hashlib, math, sys
from datetime import UTC, datetime, timedelta

import numpy as np

sys.path.insert(0, '.')
from app.ai.squall import (DEFAULT_THRESHOLD, build_buoys, build_history,
                           detect_squall, extract_pressure_features, load_bundle)
from app.simulation.generator import _build_buoys, _event_pressure_at, _offset

# --- verbatim copies of the constants and helpers in app/demo/scenarios.py ---
SQUALL_CENTER = (11.6892, 122.3667)
SQUALL_BEARING_DEG = 72.0
SQUALL_SPEED_KPH = 28.0
SQUALL_PRESSURE_DROP_HPA = 5.0
SQUALL_RISE_MINUTES = 45
SQUALL_HOLD_MINUTES = 75
SQUALL_ORIGIN_DISTANCE_KM = 18.0
BEAT_AGE = {0: 0, 1: 60, 2: 75, 3: 90, 4: 90, 5: 90, 6: 90}


def _stable_noise(buoy_id, observed_at):
    key = f'{buoy_id}:{observed_at.isoformat()}'.encode('utf-8')
    value = int.from_bytes(hashlib.sha256(key).digest()[:4], 'big') / 2**32
    return (value * 2.0 - 1.0) * 0.16


def _baseline_pressure(buoy_id, observed_at):
    digest = hashlib.sha256(buoy_id.encode('utf-8')).digest()
    phase = int.from_bytes(digest[:4], 'big') / 2**32 * 2.0 * math.pi
    t_hours = observed_at.timestamp() / 3600.0
    diurnal = 1.15 * math.sin((2.0 * math.pi * t_hours / 24.0) + phase)
    semi = 0.35 * math.sin((2.0 * math.pi * t_hours / 12.42) + phase / 2.5)
    slow = 0.28 * math.sin((2.0 * math.pi * t_hours / (24.0 * 7.0)) + phase / 3.0)
    p = 1011.4 + diurnal + semi + slow + _stable_noise(buoy_id, observed_at)
    return round(max(998.5, min(1016.5, p)), 2)


def _event_template(started_at):
    b = math.radians(SQUALL_BEARING_DEG)
    olat, olon = _offset(SQUALL_CENTER[0], SQUALL_CENTER[1],
                         north_km=-SQUALL_ORIGIN_DISTANCE_KM * math.cos(b),
                         east_km=-SQUALL_ORIGIN_DISTANCE_KM * math.sin(b))
    return {'started_at': started_at, 'front_origin_lat': olat, 'front_origin_lon': olon,
            'bearing_deg': SQUALL_BEARING_DEG, 'speed_kph': SQUALL_SPEED_KPH,
            'pressure_drop_hpa': SQUALL_PRESSURE_DROP_HPA,
            'rise_minutes': SQUALL_RISE_MINUTES, 'hold_minutes': SQUALL_HOLD_MINUTES}


def window_rows(buoys, beat, as_of):
    event = _event_template(as_of - timedelta(minutes=BEAT_AGE[beat]))
    rows = []
    for buoy in buoys:
        for step in range(19):                      # 19 readings, 5-min steps
            observed_at = as_of - timedelta(minutes=(18 - step) * 5)
            p = _baseline_pressure(buoy['id'], observed_at)
            if beat > 0:
                p += _event_pressure_at(event, buoy, observed_at)
            rows.append({'buoy_id': buoy['id'], 'observed_at': observed_at,
                         'pressure_hpa': round(max(998.5, min(1016.5, p)), 2)})
    return rows


rng = np.random.default_rng(42)
buoy_rows = _build_buoys(rng, datetime.now(UTC))
print(f'buoys: {len(buoy_rows)}  ids={[b["id"] for b in buoy_rows]}')
bundle = load_bundle()
print(f'threshold: {bundle.threshold} (DEFAULT {DEFAULT_THRESHOLD})\n')

buoy_meta = build_buoys([{'id': b['id'], 'lat': b['lat'], 'lon': b['lon'],
                          'contact_radius_m': b['contact_radius_m']} for b in buoy_rows])

print(f'{"beat":<6}{"age":<6}{"drop hPa":<11}{"probability":<14}{"detected?"}')
print('-' * 55)
results = {}
for beat in (0, 1, 2, 3):
    as_of = datetime.now(UTC).replace(second=0, microsecond=0)
    rows = window_rows(buoy_rows, beat, as_of)
    history = build_history(rows)
    latest = max(r.observed_at for s in history.values() for r in s)
    fb = extract_pressure_features(history, buoy_meta, latest)
    det = detect_squall(fb, buoy_meta, bundle)
    pressures = [r['pressure_hpa'] for r in rows]
    base = [r['pressure_hpa'] for r in window_rows(buoy_rows, 0, as_of)]
    drop = max(b - p for b, p in zip(base, pressures))
    prob = det.probability if det else None
    results[beat] = prob
    shown = f'{prob:.4f}' if prob is not None else 'below thresh'
    print(f'{beat:<6}{BEAT_AGE[beat]:<6}{drop:<11.2f}{shown:<14}{"YES" if det else "no"}')

print()
print('VERDICT')
print(f'  beat 0 must NOT detect : {"PASS" if results[0] is None else "FAIL"}')
print(f'  beat 3 MUST detect     : {"PASS" if results[3] is not None else "FAIL"}')
