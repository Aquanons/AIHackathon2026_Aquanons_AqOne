from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.db import get_pool

# Deliberately NOT behind require_user, for the same reason as sos.py and
# catch.py: a fisherman at sea has no account and no way to obtain a token
# out there. vessel_id is a locally-generated identifier, not a credential.
router = APIRouter(prefix='/api/spots', tags=['spots'])


class FishingSpotIn(BaseModel):
    """A community-reported fishing spot, as queued and uploaded by the
    handset.

    No prediction/trend/health fields exist here on purpose - there is no
    trained model behind this feature (see
    mobile/lib/models/fishing_spot.dart's doc comment), so this is honestly
    just "a fisherman said they caught something here", not a classification.

    `local_id` doubles as an idempotency key (mirrors
    mobile/lib/services/fishing_spot_service.dart's retry-on-next-sync-tick
    behaviour), so a retried POST for the same local_id must not create a
    second row.
    """

    vessel_id: str = Field(min_length=1, max_length=32)
    local_id: str | None = Field(default=None, max_length=64)
    posted_by: str | None = Field(default=None, max_length=64)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    species_name: str | None = Field(default=None, max_length=64)
    notes: str | None = Field(default=None, max_length=240)


@router.post('', status_code=200)
async def ingest_spot(payload: FishingSpotIn) -> dict[str, object]:
    """Accept a fishing spot report from the handset. Idempotent on local_id.

    Mirrors ingest_catch_log's shape: the vessel may be unknown to the
    backend if this is the first thing it has ever sent, so the vessel row
    is created on demand rather than rejecting the write over a missing
    foreign key.
    """
    pool = get_pool()
    async with pool.acquire() as conn, conn.transaction():
        await conn.execute(
            '''
                INSERT INTO vessels (id, boat_name)
                VALUES ($1, $1)
                ON CONFLICT (id) DO NOTHING
                ''',
            payload.vessel_id,
        )

        row = await conn.fetchrow(
            '''
                INSERT INTO fishing_spots (
                  vessel_id, local_id, posted_by, latitude, longitude,
                  species_name, notes
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7)
                ON CONFLICT (local_id) WHERE local_id IS NOT NULL DO UPDATE SET
                  -- A retried upload of the same local_id fills in whatever
                  -- was missing rather than overwriting what already landed.
                  posted_by    = COALESCE(fishing_spots.posted_by, EXCLUDED.posted_by),
                  species_name = COALESCE(fishing_spots.species_name, EXCLUDED.species_name),
                  notes        = COALESCE(fishing_spots.notes, EXCLUDED.notes)
                RETURNING id, created_at, (xmax = 0) AS was_inserted
                ''',
            payload.vessel_id,
            payload.local_id,
            payload.posted_by,
            payload.latitude,
            payload.longitude,
            payload.species_name,
            payload.notes,
        )

    return {
        'spot': {
            'id': row['id'],
            'created': bool(row['was_inserted']),
            'duplicate': not bool(row['was_inserted']),
            'created_at': row['created_at'].isoformat(),
        }
    }


@router.get('')
async def list_spots(limit: int = 200) -> dict[str, object]:
    """Public read - every fisherman with the app sees every reported spot,
    same as buoys/hazards/advisories. Also the endpoint the dispatcher
    dashboard's fetchHotspots() already calls (see dashboard.js) expecting
    exactly this `{"spots": [{id, posted_by, latitude, longitude}]}` shape,
    so no dashboard-side changes are needed once this exists.
    """
    pool = get_pool()
    capped_limit = max(1, min(limit, 500))
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            '''
            SELECT id, posted_by, latitude, longitude, species_name, notes,
                   created_at
            FROM fishing_spots
            ORDER BY created_at DESC
            LIMIT $1
            ''',
            capped_limit,
        )
    return {
        'spots': [
            {
                'id': row['id'],
                'posted_by': row['posted_by'],
                'latitude': row['latitude'],
                'longitude': row['longitude'],
                'species_name': row['species_name'],
                'notes': row['notes'],
                'created_at': row['created_at'].isoformat(),
            }
            for row in rows
        ]
    }
