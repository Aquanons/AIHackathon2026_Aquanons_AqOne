from __future__ import annotations

import hmac
import os
from datetime import datetime
from typing import Literal

import asyncpg
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.db import get_pool

router = APIRouter(prefix='/api/v1', tags=['contacts'])


async def require_gateway_key(
    api_key: str | None = Header(default=None, alias='X-Api-Key'),
) -> None:
    """Gateway-only guard for contact-event ingest (docs/04_INGEST_API.md).

    Mirrors app/api/demo.py's require_demo_key shape but with its own env var
    and header value, so a leaked demo key can never authorize contact ingest
    and vice versa. Distinct from app.auth.require_user (dashboard operator
    JWT) and require_vessel_device (paired handset token) - neither the
    handset nor the public dashboard can hold this key, so neither can
    manufacture a contact event.
    """
    configured_key = os.environ.get('GATEWAY_API_KEY', '')
    if not configured_key or api_key is None or not hmac.compare_digest(api_key, configured_key):
        raise HTTPException(status_code=401, detail='invalid gateway key')


class ContactEventIn(BaseModel):
    """One routine vessel-buoy contact, from the gateway only.

    The trip-anomaly detector's only trustworthy input
    (docs/38_AUTOMATIC_DISTRESS_DETECTION_IMPLEMENTATION_PLAN.md Phase 1).
    `event_id` is the idempotency key - a retried submission must return the
    original contact, never create a second one.
    """

    v: int = 1
    event_id: str = Field(min_length=1, max_length=128)
    vessel_id: str = Field(min_length=1, max_length=32)
    trip_id: str = Field(min_length=1, max_length=64)
    buoy_id: str = Field(min_length=1, max_length=32)
    observed_at: datetime
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    source: Literal['live', 'synthetic']


@router.post('/contacts', dependencies=[Depends(require_gateway_key)], status_code=200)
async def ingest_contact(payload: ContactEventIn) -> dict[str, object]:
    """Accept one contact event. Idempotent on event_id.

    First submission inserts and returns the new row. A retry of the same
    event_id - a gateway resend after a dropped ack, for example - returns
    the already-stored contact rather than creating a second logical one.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        # A vessel may be seen here before it is ever seen anywhere else -
        # vessel_profiles/vessel_anomaly_scores (and this phase's
        # anomaly_cases) all carry a FK to vessels(id), so scoring would
        # otherwise fail the first time a genuinely new vessel's only
        # activity is a routine contact rather than an SOS. Mirrors
        # app/api/sos.py's own "vessel may be unknown" upsert.
        await conn.execute(
            '''
            INSERT INTO vessels (id, boat_name)
            VALUES ($1, $1)
            ON CONFLICT (id) DO NOTHING
            ''',
            payload.vessel_id,
        )
        try:
            row = await conn.fetchrow(
                '''
                INSERT INTO buoy_contacts (
                  event_id, buoy_id, vessel_id, trip_id, observed_at,
                  latitude, longitude, source, is_synthetic,
                  contact_type, contact_value
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'mesh_ping',$1)
                ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING
                RETURNING id, event_id, vessel_id, trip_id
                ''',
                payload.event_id,
                payload.buoy_id,
                payload.vessel_id,
                payload.trip_id,
                payload.observed_at,
                payload.latitude,
                payload.longitude,
                payload.source,
                payload.source == 'synthetic',
            )
        except asyncpg.ForeignKeyViolationError as exc:
            raise HTTPException(status_code=400, detail='unknown buoy_id') from exc

        deduped = row is None
        if row is None:
            row = await conn.fetchrow(
                'SELECT id, event_id, vessel_id, trip_id FROM buoy_contacts WHERE event_id = $1',
                payload.event_id,
            )

    return {
        'accepted': True,
        'event_id': row['event_id'],
        'deduped': deduped,
        'contact_id': row['id'],
        'vessel_id': row['vessel_id'],
        'trip_id': row['trip_id'],
    }
