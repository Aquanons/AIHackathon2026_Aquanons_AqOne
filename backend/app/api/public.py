"""Unauthenticated read-only safety feeds for the fisherman handset.

Every other API surface requires a bearer token. The handset has no account and
never will: `docs/07_SCOPE_OUT.md` records the decision that fisherman identity
is a device-local id with no password, because a person in distress cannot be
asked to log in.

That decision left the app unable to read the two feeds it most needs. It called
`/api/sea-condition`, got 401, fell back to `/api/public/sea-condition`, which
had never been built, and rendered "Sea condition unavailable" forever. The
squall model had no route to the handset at all.

These endpoints are read-only and expose no personal data - a sea-state
declaration and a weather nowcast. They carry the same reasoning as
unauthenticated SOS ingest: safety information must not be gated behind
credentials the person at risk cannot hold.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.ai.squall import build_buoys, current_detection, event_detection_summary, load_bundle
from app.api.sea_condition import _buoy_telemetry, _serialise
from app.api.squall import _load_rows
from app.db import get_pool
from app.geo import SHORE_STATIONS

router = APIRouter(prefix='/api/public', tags=['public'])

OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
OPEN_METEO_MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine'
FORECAST_UPSTREAM_TIMEOUT_SECONDS = 5.0
MAX_FORECAST_DAYS = 7

# A synthetic reading older than this cannot be trusted as "current weather" -
# see docs/37 non-negotiable rule: stale data must never raise a fresh RETURN
# NOW warning. Squalls are a tens-of-minutes phenomenon (PRD §5.1), so a few
# hours old is already stale for this purpose.
SQUALL_MAX_DATA_AGE = timedelta(hours=3)

DEMO_BUOYS: tuple[dict[str, object], ...] = (
    {
        'id': 'buoy-a',
        'name': 'Buoy A - Tambak',
        'latitude': 11.6800,
        'longitude': 122.4140,
        'coverage_radius_meters': 700,
        'status': 'active',
    },
    {
        'id': 'buoy-b',
        'name': 'Buoy B - Batan Bay',
        'latitude': 11.6520,
        'longitude': 122.4480,
        'coverage_radius_meters': 700,
        'status': 'active',
    },
)


@router.get('/buoys')
async def public_buoys() -> dict[str, object]:
    """Buoy coverage markers for the fisherman app.

    The live database may still be empty during a pitch rehearsal. Returning the
    demo mesh keeps Venture usable while real buoy telemetry is being installed.
    """
    try:
        pool = get_pool()
    except HTTPException:
        return {'buoys': list(DEMO_BUOYS), 'shore_stations': list(SHORE_STATIONS)}
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            '''
            SELECT id, label, 700 AS coverage_radius_meters
            FROM buoys
            ORDER BY id
            LIMIT 20
            '''
        )

    if not rows:
        return {'buoys': list(DEMO_BUOYS), 'shore_stations': list(SHORE_STATIONS)}

    fallback_positions = list(DEMO_BUOYS)
    buoys = []
    for index, row in enumerate(rows):
        fallback = fallback_positions[index % len(fallback_positions)]
        buoys.append(
            {
                'id': row['id'],
                'name': row['label'],
                'latitude': fallback['latitude'],
                'longitude': fallback['longitude'],
                'coverage_radius_meters': row['coverage_radius_meters'],
                'status': 'active',
            }
        )
    return {'buoys': buoys, 'shore_stations': list(SHORE_STATIONS)}


@router.get('/alerts/waves')
async def public_wave_alerts() -> dict[str, object]:
    return {'wave_warnings': []}


@router.get('/alerts/capsizing')
async def public_capsizing_alerts() -> dict[str, object]:
    return {'capsizing_advisories': []}


@router.get('/sea-condition')
async def public_sea_condition() -> dict[str, object]:
    """The MDRRMO's current declaration.

    This is a human decision, not model output. The handset renders it with the
    setter's name and timestamp so a fisher can see a person stands behind it.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            'SELECT * FROM sea_conditions ORDER BY created_at DESC, id DESC LIMIT 1'
        )
        telemetry = await _buoy_telemetry(conn)
    current = _serialise(row) if row else {'status': 'unknown'}
    if telemetry:
        current['buoy_telemetry'] = telemetry
    return {'current': current}


def _daily_wave_max(marine_payload: dict[str, object]) -> dict[str, float]:
    """Max hourly significant wave height per calendar day.

    The marine API only reports hourly, so this collapses to a daily figure
    the same way the handset's own client-side fallback does
    (`DailyOutlook.parseMarineDailyMax` in mobile/lib/models/daily_outlook.dart)
    - kept in sync so a proxied day and a directly-fetched fallback day never
    disagree about the same swell.
    """
    hourly = marine_payload.get('hourly')
    if not isinstance(hourly, dict):
        return {}
    times = hourly.get('time')
    heights = hourly.get('wave_height')
    if not isinstance(times, list) or not isinstance(heights, list):
        return {}
    by_day: dict[str, float] = {}
    for time_str, height in zip(times, heights, strict=False):
        if not isinstance(time_str, str) or not isinstance(height, (int, float)):
            continue
        day = time_str[:10]
        by_day[day] = max(by_day.get(day, float('-inf')), float(height))
    return by_day


@router.get('/forecast')
async def public_forecast(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    days: int = Query(default=7, ge=1, le=MAX_FORECAST_DAYS),
) -> dict[str, object]:
    """Transparent Open-Meteo/marine proxy - see docs/05_PUBLIC_API.md.

    No server-side fusion model exists yet, so this never claims
    `aqone-fusion` and never includes a `risk` block - the handset scores
    each day itself when `risk` is absent. `wave_m` stays null rather than
    0.0 whenever the marine model has nothing for a day: a missing reading
    must never read as flat calm.
    """
    try:
        async with httpx.AsyncClient(timeout=FORECAST_UPSTREAM_TIMEOUT_SECONDS) as client:
            atmo_response = await client.get(
                OPEN_METEO_FORECAST_URL,
                params={
                    'latitude': lat,
                    'longitude': lon,
                    'daily': (
                        'weather_code,temperature_2m_max,temperature_2m_min,'
                        'wind_speed_10m_max,wind_gusts_10m_max,precipitation_sum'
                    ),
                    'forecast_days': days,
                    'timezone': 'auto',
                },
            )
            atmo_response.raise_for_status()
            atmo = atmo_response.json()

            marine: dict[str, object] = {}
            try:
                marine_response = await client.get(
                    OPEN_METEO_MARINE_URL,
                    params={
                        'latitude': lat,
                        'longitude': lon,
                        'hourly': 'wave_height',
                        'forecast_days': days,
                        'timezone': 'auto',
                    },
                )
                marine_response.raise_for_status()
                marine = marine_response.json()
            except (httpx.HTTPError, ValueError):
                # Wave data is frequently unavailable for nearshore cells.
                # That degrades wave_m to null for every day below, not the
                # whole forecast to an error.
                marine = {}
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=502, detail='upstream weather provider unavailable'
        ) from exc

    daily = atmo.get('daily')
    if not isinstance(daily, dict):
        raise HTTPException(status_code=502, detail='malformed weather provider response')

    times = daily.get('time')
    if not isinstance(times, list):
        raise HTTPException(status_code=502, detail='malformed weather provider response')

    wave_by_day = _daily_wave_max(marine)

    def _at(key: str, index: int) -> object | None:
        series = daily.get(key)
        if isinstance(series, list) and index < len(series):
            return series[index]
        return None

    out_days: list[dict[str, object]] = []
    for index, date_str in enumerate(times):
        if not isinstance(date_str, str):
            continue
        wave = wave_by_day.get(date_str)
        out_days.append(
            {
                'date': date_str,
                'weather_code': _at('weather_code', index),
                'temp_max': _at('temperature_2m_max', index),
                'temp_min': _at('temperature_2m_min', index),
                'wind_kph': _at('wind_speed_10m_max', index),
                'gust_kph': _at('wind_gusts_10m_max', index),
                'precip_mm': _at('precipitation_sum', index),
                'wave_m': wave,
            }
        )

    return {
        'source': 'open-meteo',
        'generated_at': datetime.now(UTC).isoformat(),
        'days': out_days,
    }


@router.get('/squall')
async def public_squall() -> dict[str, object]:
    """Squall nowcast for the handset.

    Adds `return_now` and `level` on top of the dashboard's payload so the app
    does not have to re-derive the alarm condition from raw probabilities. The
    threshold is the model's own decision boundary, carried in the response -
    never a number invented on the client.

    Degrades quietly. If the model file is missing or there are no readings, the
    app is told `level: "unknown"` rather than being handed an exception. An
    alarm that cannot be evaluated must not render as "all clear".
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        readings, _, buoy_rows = await _load_rows(conn)

    empty = {
        'calibration': 'synthetic',
        'as_of': None,
        'detections': [],
        'threshold': None,
        'return_now': False,
        'level': 'unknown',
        'source': 'AqOne squall nowcast — calibrated on synthetic data',
        'stale': False,
        'stale_reason': None,
    }

    if not readings:
        return empty

    latest_reading_at = max(row['observed_at'] for row in readings)
    as_of = latest_reading_at.isoformat()
    age = datetime.now(UTC) - latest_reading_at

    # A stale synthetic reading must never raise a fresh RETURN NOW warning
    # (docs/37 non-negotiable rule). This is checked before the model even
    # runs, so a stale detection can never slip through the threshold logic
    # below by accident.
    if age > SQUALL_MAX_DATA_AGE:
        return empty | {
            'as_of': as_of,
            'stale': True,
            'stale_reason': (
                f'latest synthetic reading is {age} old, past the '
                f'{SQUALL_MAX_DATA_AGE} freshness window for this nowcast'
            ),
        }

    try:
        model = load_bundle()
    except FileNotFoundError:
        return empty

    buoys = build_buoys(buoy_rows)
    detections = current_detection(readings, buoys, model)
    summary = event_detection_summary(model, detections)

    threshold = summary.get('threshold')
    rows = summary.get('detections') or []

    # A detection at or above the model's own threshold is the RETURN NOW
    # condition. Anything below it that still carries meaningful probability is
    # a watch - visible, but it must not alarm.
    triggered = [
        row for row in rows
        if isinstance(threshold, (int, float))
        and float(row.get('probability') or 0.0) >= float(threshold)
    ]

    if triggered:
        level = 'return_now'
    elif rows:
        level = 'watch'
    else:
        level = 'clear'

    # Which buoys the squall is forecast to reach. A detection carries
    # `arrival_by_buoy`, not a single buoy id - the whole point of the model is
    # that a squall crosses the array rather than sitting on one sensor.
    triggered_buoys: list[str] = []
    lead_minutes: float | None = None
    for row in triggered:
        for arrival in row.get('arrival_by_buoy') or []:
            buoy_id = arrival.get('buoy_id')
            if buoy_id and buoy_id not in triggered_buoys:
                triggered_buoys.append(buoy_id)
            eta = arrival.get('arrival_minutes')
            if isinstance(eta, (int, float)):
                lead_minutes = eta if lead_minutes is None else min(lead_minutes, eta)

    return summary | {
        'as_of': as_of,
        'return_now': bool(triggered),
        'level': level,
        'triggered_buoys': triggered_buoys,
        # Soonest forecast arrival across affected buoys - what the handset
        # shows as "squall in ~N minutes".
        'lead_minutes': round(lead_minutes) if lead_minutes is not None else None,
        'source': 'AqOne squall nowcast — calibrated on synthetic data',
        'stale': False,
        'stale_reason': None,
    }
