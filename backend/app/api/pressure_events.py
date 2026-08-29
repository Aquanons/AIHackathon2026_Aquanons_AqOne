from __future__ import annotations

import hmac
import os
from datetime import UTC, datetime, timedelta
from typing import Literal

import asyncpg
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.api.contacts import require_gateway_key
from app.db import get_pool

router = APIRouter(prefix='/api/v1', tags=['pressure-events'])

# Physical-plausibility guard on malformed ingest only (lowest sea-level
# pressure ever recorded is ~870 hPa, in a typhoon; highest is ~1085 hPa).
# This is deliberately not the tighter operational trust range squall
# Phase 2 (docs/39_SQUALL_NOWCASTING_IMPLEMENTATION_PLAN.md) must set with
# an MDRRMO/technical-owner decision - that range decides array quality,
# this one only rejects garbage input.
_PRESSURE_MIN_HPA = 850.0
_PRESSURE_MAX_HPA = 1100.0

# Tolerance for a buoy's clock running ahead of the server's. Only bounds the
# future - a delayed gateway resend after an outage carries an old
# observed_at and must still be accepted; Phase 2's freshness gate decides
# separately whether old data is still trustworthy for a live nowcast.
_MAX_FUTURE_SKEW = timedelta(minutes=5)


async def _require_synthetic_demo_gate(x_demo_key: str | None) -> None:
    """Synthetic pressure writes are demo-only (docs/39 Phase 1 item 5).

    Stricter than app/api/contacts.py's ContactEventIn, which accepts
    `source: 'synthetic'` through the gateway key alone: a squall reading can
    reach a handset RETURN NOW alarm, so synthetic pressure data must not be
    injectable in production even by a gateway-key holder. Requires both
    DEMO_MODE (mirrors app/main.py's demo-router gate) and the same
    X-Demo-Key/DEMO_CONTROL_KEY credential app/api/demo.py's
    require_demo_key checks.
    """
    demo_mode = os.environ.get('DEMO_MODE', '').strip().lower() in {'1', 'true', 'yes', 'on'}
    configured_key = os.environ.get('DEMO_CONTROL_KEY', '')
    if (
        not demo_mode
        or not configured_key
        or x_demo_key is None
        or not hmac.compare_digest(x_demo_key, configured_key)
    ):
        raise HTTPException(status_code=403, detail='synthetic pressure data requires demo mode')


class PressureEventIn(BaseModel):
    """One buoy pressure reading, from the gateway only.

    The trusted-telemetry contract squall nowcasting is gated on
    (docs/39_SQUALL_NOWCASTING_IMPLEMENTATION_PLAN.md Phase 1). `event_id` is
    the idempotency key - a retried submission must return the original
    reading, never create a second one.
    """

    v: int = 1
    event_id: str = Field(min_length=1, max_length=128)
    buoy_id: str = Field(min_length=1, max_length=32)
    observed_at: datetime
    pressure_hpa: float = Field(ge=_PRESSURE_MIN_HPA, le=_PRESSURE_MAX_HPA)
    source: Literal['live', 'synthetic']

    @field_validator('observed_at')
    @classmethod
    def _reject_future_clock_skew(cls, value: datetime) -> datetime:
        as_utc = value if value.tzinfo is not None else value.replace(tzinfo=UTC)
        if as_utc - datetime.now(UTC) > _MAX_FUTURE_SKEW:
            raise ValueError('observed_at is too far in the future')
        return value


@router.post('/pressure-events', dependencies=[Depends(require_gateway_key)], status_code=200)
async def ingest_pressure_event(
    payload: PressureEventIn,
    x_demo_key: str | None = Header(default=None, alias='X-Demo-Key'),
) -> dict[str, object]:
    """Accept one pressure reading. Idempotent on event_id.

    First submission inserts and returns the new row. A retry of the same
    event_id - a gateway resend after a dropped ack, for example - returns
    the already-stored reading rather than creating a second logical one.
    """
    if payload.source == 'synthetic':
        await _require_synthetic_demo_gate(x_demo_key)

    pool = get_pool()
    async with pool.acquire() as conn:
        try:
            row = await conn.fetchrow(
                '''
                INSERT INTO barometric_readings (
                  event_id, buoy_id, observed_at, pressure_hpa,
                  source, is_synthetic
                )
                VALUES ($1,$2,$3,$4,$5,$6)
                ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING
                RETURNING id, event_id, buoy_id, source
                ''',
                payload.event_id,
                payload.buoy_id,
                payload.observed_at,
                payload.pressure_hpa,
                payload.source,
                payload.source == 'synthetic',
            )
        except asyncpg.ForeignKeyViolationError as exc:
            raise HTTPException(status_code=400, detail='unknown buoy_id') from exc

        deduped = row is None
        if row is None:
            row = await conn.fetchrow(
                'SELECT id, event_id, buoy_id, source FROM barometric_readings WHERE event_id = $1',
                payload.event_id,
            )

    return {
        'accepted': True,
        'event_id': row['event_id'],
        'deduped': deduped,
        'reading_id': row['id'],
        'buoy_id': row['buoy_id'],
        'source': row['source'],
    }
