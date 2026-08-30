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

from datetime import UTC, datetime

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.api.sea_condition import _buoy_telemetry, _serialise
from app.api.squall import _load_rows, _return_now_enabled, build_squall_status
from app.db import get_pool
from app.geo import SHORE_STATIONS

router = APIRouter(prefix='/api/public', tags=['public'])

OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
OPEN_METEO_MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine'
FORECAST_UPSTREAM_TIMEOUT_SECONDS = 5.0
MAX_FORECAST_DAYS = 7

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

    Reads live pressure telemetry only (docs/39 Phase 3) - production never
    lets an old synthetic scenario reach a real handset. `build_squall_status`
    runs the quality gate (docs/39 Phase 2) before any detection: a missing,
    stale, or incomplete array reports `level: "unknown"` with a reason and
    the last real observation time, never an invented "all clear". `level:
    "return_now"` additionally requires SQUALL_RETURN_NOW_ENABLED - a live
    detection cannot alarm a handset before that field-validation gate opens
    (docs/39 Phase 4), regardless of how confident the model is.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        readings, _, buoy_rows = await _load_rows(conn, live=True)
    return build_squall_status(readings, buoy_rows, source='live', allow_return_now=_return_now_enabled())
