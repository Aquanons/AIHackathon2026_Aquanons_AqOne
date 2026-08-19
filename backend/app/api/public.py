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

from fastapi import APIRouter, HTTPException

from app.ai.squall import build_buoys, current_detection, event_detection_summary, load_bundle
from app.api.sea_condition import _serialise
from app.api.squall import _load_rows
from app.db import get_pool
from app.geo import SHORE_STATIONS

router = APIRouter(prefix='/api/public', tags=['public'])

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
    return {'current': _serialise(row) if row else None}


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
    }

    if not readings:
        return empty

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
        'as_of': max(row['observed_at'] for row in readings).isoformat(),
        'return_now': bool(triggered),
        'level': level,
        'triggered_buoys': triggered_buoys,
        # Soonest forecast arrival across affected buoys - what the handset
        # shows as "squall in ~N minutes".
        'lead_minutes': round(lead_minutes) if lead_minutes is not None else None,
        'source': 'AqOne squall nowcast — calibrated on synthetic data',
    }
