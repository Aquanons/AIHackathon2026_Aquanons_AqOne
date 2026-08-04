from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import require_user
from app.db import get_pool

# Responder status vocabulary. One byte, so it survives a 64-byte LoRa frame in
# phase 2 and stays consistent between dispatchers under pressure. The canonical
# table lives in docs/13_RESPONDER_LOOP.md; the dashboard and the Flutter app
# mirror these values.
RESPONDER_RECEIVED = 1
RESPONDER_DISPATCHED = 2
RESPONDER_COAST_GUARD = 3
RESPONDER_NEAREST_VESSEL = 4
RESPONDER_DELAYED = 5

RESPONDER_STATUS_LABELS: dict[int, str] = {
    RESPONDER_RECEIVED: 'MDRRMO has your call',
    RESPONDER_DISPATCHED: 'Rescue boat on the way',
    RESPONDER_COAST_GUARD: 'Coast Guard notified',
    RESPONDER_NEAREST_VESSEL: 'Nearby boats alerted',
    RESPONDER_DELAYED: 'Delayed - still coming',
}

REPLY_STILL_IN_DANGER = 1
REPLY_SAFE_NOW = 2


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _delivery_state(row: Any) -> str:
    """Collapse the stored flags into the four states the app speaks.

    Mirrors docs/06_DELIVERY_STATES.md. The handset merges this with whatever
    it already knows, so a state can only ever move forward.
    """
    if row['resolved_at'] is not None:
        return 'acknowledged'
    if row['acknowledged_at'] is not None:
        return 'acknowledged'
    if row['delivered_direct'] or row['delivered_via_buoy']:
        return 'delivered'
    return 'relayed'

# Deliberately NOT behind require_user.
#
# This is a distress endpoint. A fisherman in trouble has no account, no token
# and no way to obtain one at sea, and the LoRa gateway forwards frames from
# handsets it cannot authenticate. Requiring a bearer token here would mean
# rejecting the exact call the product exists to deliver.
#
# The trust model is already explicit about this: every vessel identity is
# self-declared until a responder confirms it (see TrustTier in the mobile app),
# and the dashboard shows that tier next to each incident. Abuse is handled by
# the confidence scoring and by dispatchers, not by blocking the call.
router = APIRouter(prefix='/api/sos', tags=['sos'])

# The read side stays protected - that is dispatcher data.
protected_router = APIRouter(prefix='/api/sos', tags=['sos'])


class SosIn(BaseModel):
    """An SOS as delivered by either transport.

    `client_ts` is mandatory: with `vessel_id` it forms the de-duplication key
    that lets the direct and buoy routes deliver the same emergency without
    creating two incidents.
    """

    vessel_id: str
    client_ts: int = Field(description='Origin epoch seconds, from the handset')
    boat: str = ''
    lat: float | None = None
    lon: float | None = None
    note: str | None = None
    trust_tier: str = 'self_declared'

    # Direct path only - the LoRa frame has no room for a UUID.
    local_id: str | None = None

    # Buoy path only - taken from the LoRa frame header.
    buoy_id: str | None = None
    src_id: int | None = None
    seq: int | None = None

    source: Literal['direct', 'buoy'] = 'direct'


@router.post('', status_code=200)
async def ingest_sos(payload: SosIn) -> dict[str, object]:
    """Accept an SOS from either transport. Idempotent.

    First arrival creates the incident. A second arrival of the same emergency
    by the other route updates the existing row rather than inserting: it fills
    in whatever that route knows and the other did not (the direct path has
    local_id, the buoy path has buoy/seq), and records that the route delivered.

    Always returns the same event id, so a client retrying - or both transports
    succeeding - is safe.
    """
    pool = get_pool()
    async with pool.acquire() as conn, conn.transaction():
        # The vessel may be unknown: a handset can raise an SOS before it
        # has ever been seen by the backend. Refusing on a missing foreign
        # key would drop a distress call.
        await conn.execute(
            '''
                INSERT INTO vessels (id, boat_name)
                VALUES ($1, $2)
                ON CONFLICT (id) DO NOTHING
                ''',
            payload.vessel_id,
            payload.boat or payload.vessel_id,
        )

        row = await conn.fetchrow(
            '''
                INSERT INTO sos_events (
                  vessel_id, client_ts, boat, latitude, longitude, note,
                  trust_tier, local_id, buoy_id, src_id, seq,
                  delivered_direct, delivered_via_buoy
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                ON CONFLICT (vessel_id, client_ts) DO UPDATE SET
                  -- COALESCE keeps whatever we already knew and fills the gaps
                  -- from this delivery. Neither route can erase the other's data.
                  latitude   = COALESCE(sos_events.latitude,  EXCLUDED.latitude),
                  longitude  = COALESCE(sos_events.longitude, EXCLUDED.longitude),
                  note       = COALESCE(NULLIF(sos_events.note, ''), EXCLUDED.note),
                  local_id   = COALESCE(sos_events.local_id,  EXCLUDED.local_id),
                  buoy_id    = COALESCE(sos_events.buoy_id,   EXCLUDED.buoy_id),
                  src_id     = COALESCE(sos_events.src_id,    EXCLUDED.src_id),
                  seq        = COALESCE(sos_events.seq,       EXCLUDED.seq),
                  boat       = COALESCE(NULLIF(sos_events.boat, ''), EXCLUDED.boat),
                  delivered_direct   = sos_events.delivered_direct   OR EXCLUDED.delivered_direct,
                  delivered_via_buoy = sos_events.delivered_via_buoy OR EXCLUDED.delivered_via_buoy
                RETURNING *, (xmax = 0) AS was_inserted
                ''',
            payload.vessel_id,
            payload.client_ts,
            payload.boat,
            payload.lat,
            payload.lon,
            payload.note,
            payload.trust_tier,
            payload.local_id,
            payload.buoy_id,
            payload.src_id,
            payload.seq,
            payload.source == 'direct',
            payload.source == 'buoy',
        )

    return {
        'id': row['id'],
        # False means this emergency was already known - the other transport
        # got here first. The client treats both as success.
        'created': bool(row['was_inserted']),
        'duplicate': not bool(row['was_inserted']),
        'vessel_id': row['vessel_id'],
        'client_ts': row['client_ts'],
        'delivered_direct': row['delivered_direct'],
        'delivered_via_buoy': row['delivered_via_buoy'],
        'acknowledged_at': row['acknowledged_at'].isoformat() if row['acknowledged_at'] else None,
    }


@protected_router.get('/active')
async def active_sos(_: dict = Depends(require_user)) -> dict[str, object]:
    """Unacknowledged SOS events, newest first. Dispatcher view."""
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            '''
            SELECT id, vessel_id, boat, latitude, longitude, note, trust_tier,
                   client_ts, delivered_direct, delivered_via_buoy,
                   buoy_id, created_at, acknowledged_at, acked_by
            FROM sos_events
            WHERE acknowledged_at IS NULL
              AND resolved_at IS NULL
            ORDER BY created_at DESC
            LIMIT 100
            '''
        )
    return {
        'events': [
            {
                **{k: v for k, v in dict(row).items() if k not in ('created_at', 'acknowledged_at')},
                'created_at': row['created_at'].isoformat(),
                'acknowledged_at': (
                    row['acknowledged_at'].isoformat() if row['acknowledged_at'] else None
                ),
            }
            for row in rows
        ]
    }


class AcknowledgeIn(BaseModel):
    """A dispatcher's answer to a distress call.

    `eta_minutes` is what the dispatcher types; the server converts it to an
    absolute `eta_at` so the clock is authoritative and not the browser's, and
    so the handset's countdown stays correct however long delivery takes.
    """

    eta_minutes: int | None = Field(default=None, ge=1, le=720)
    responder_status: int = Field(default=RESPONDER_RECEIVED, ge=1, le=5)
    responder_note: str | None = None


@protected_router.post('/{event_id}/acknowledge')
async def acknowledge(
    event_id: int,
    payload: AcknowledgeIn | None = None,
    user: dict = Depends(require_user),
) -> dict[str, object]:
    body = payload or AcknowledgeIn()
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            '''
            UPDATE sos_events
               SET acknowledged_at  = COALESCE(acknowledged_at, NOW()),
                   acked_by         = $2,
                   responder_status = $3,
                   responder_note   = COALESCE($4, responder_note),
                   -- NULL eta_minutes leaves any existing ETA untouched, so a
                   -- dispatcher can update the status without wiping the time.
                   eta_at = CASE
                              WHEN $5::INT IS NULL THEN eta_at
                              ELSE NOW() + ($5::INT * INTERVAL '1 minute')
                            END
             WHERE id = $1
            RETURNING id, acknowledged_at, acked_by, eta_at,
                      responder_status, responder_note
            ''',
            event_id,
            user.get('email') or 'unknown',
            body.responder_status,
            body.responder_note,
            body.eta_minutes,
        )
    if row is None:
        raise HTTPException(status_code=404, detail='no such SOS event')
    return {
        'ok': True,
        'id': row['id'],
        'acknowledged_at': row['acknowledged_at'].isoformat(),
        'acked_by': row['acked_by'],
        'eta_at': row['eta_at'].isoformat() if row['eta_at'] else None,
        'responder_status': row['responder_status'],
        'responder_status_label': RESPONDER_STATUS_LABELS.get(row['responder_status']),
        'responder_note': row['responder_note'],
    }


@protected_router.post('/{event_id}/resolve')
async def resolve_sos(
    event_id: int,
    user: dict = Depends(require_user),
) -> dict[str, object]:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            '''
            UPDATE sos_events
               SET resolved_at = COALESCE(resolved_at, NOW()),
                   acked_by = COALESCE(acked_by, $2)
             WHERE id = $1
            RETURNING id, resolved_at, acked_by
            ''',
            event_id,
            user.get('email') or 'unknown',
        )
    if row is None:
        raise HTTPException(status_code=404, detail='no such SOS event')
    return {
        'ok': True,
        'id': row['id'],
        'resolved_at': _iso(row['resolved_at']),
        'acked_by': row['acked_by'],
    }


@router.get('/vessel/{vessel_id}')
async def vessel_sos(vessel_id: str) -> dict[str, object]:
    """What the handset polls to learn whether anyone answered.

    Unauthenticated for the same reason ingest is: a handset in distress has no
    token. It returns only the events belonging to the vessel id in the path, so
    it discloses nothing a dispatcher would not already be shouting over VHF.

    This route did not exist. The app has been calling
    /api/v1/vessels/{id}/sos, which no router ever served, so reconciliation
    silently 404'd and no acknowledgement ever reached a fisherman.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            '''
            SELECT id, local_id, seq, client_ts, acknowledged_at, acked_by,
                   eta_at, responder_status, responder_note,
                   fisher_reply, resolved_at,
                   delivered_direct, delivered_via_buoy
            FROM sos_events
            WHERE vessel_id = $1
            ORDER BY created_at DESC
            LIMIT 20
            ''',
            vessel_id,
        )

    return {
        'vessel_id': vessel_id,
        # Server time, so the handset can correct for clock drift before
        # rendering a countdown against eta_at.
        'server_time': datetime.now(UTC).isoformat(),
        'events': [
            {
                'id': row['id'],
                'local_id': row['local_id'],
                'seq': row['seq'],
                'client_ts': row['client_ts'],
                'delivery_state': _delivery_state(row),
                'acknowledged_at': _iso(row['acknowledged_at']),
                'acked_by': row['acked_by'],
                'eta_at': _iso(row['eta_at']),
                'responder_status': row['responder_status'],
                'responder_status_label': RESPONDER_STATUS_LABELS.get(row['responder_status']),
                'responder_note': row['responder_note'],
                'fisher_reply': row['fisher_reply'],
                'resolved_at': _iso(row['resolved_at']),
            }
            for row in rows
        ],
    }


class ReplyIn(BaseModel):
    """The fisher's one-tap answer to an acknowledgement."""

    reply: int = Field(ge=1, le=2, description='1 STILL_IN_DANGER, 2 SAFE_NOW')


@router.post('/{event_id}/reply')
async def fisher_reply(event_id: int, payload: ReplyIn) -> dict[str, object]:
    """Record the fisher's reply. Unauthenticated, like ingest.

    It can only annotate an event that already exists and cannot create one, so
    the worst an abuser achieves is a wrong flag on an incident a dispatcher is
    already looking at.

    SAFE_NOW resolves the incident, which is what lets a dispatcher release
    assets to somebody else.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            '''
            UPDATE sos_events
               SET fisher_reply      = $2,
                   fisher_replied_at = NOW(),
                   resolved_at = CASE WHEN $2 = $3 THEN NOW() ELSE resolved_at END
             WHERE id = $1
            RETURNING id, fisher_reply, fisher_replied_at, resolved_at
            ''',
            event_id,
            payload.reply,
            REPLY_SAFE_NOW,
        )
    if row is None:
        raise HTTPException(status_code=404, detail='no such SOS event')
    return {
        'ok': True,
        'id': row['id'],
        'fisher_reply': row['fisher_reply'],
        'fisher_replied_at': _iso(row['fisher_replied_at']),
        'resolved_at': _iso(row['resolved_at']),
    }
