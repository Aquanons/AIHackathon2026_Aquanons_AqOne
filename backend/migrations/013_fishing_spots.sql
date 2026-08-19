-- Community-reported fishing spots ("fish hotspots"). A fisherman drops a
-- pin for a real spot they fished; other fishermen see it on the Venture
-- map. No automated classification exists behind this - there is no trained
-- model, so this table deliberately has no prediction/trend/health columns.
-- See mobile/lib/models/fishing_spot.dart for the full reasoning.
--
-- Same shape as catch_logs on purpose: never travels over LoRa (queued on
-- the handset, uploaded over plain HTTP whenever there's signal), so no
-- buoy/src_id/seq bookkeeping, and local_id is the handset's idempotency
-- key for retried uploads.
--
-- posted_by is denormalized from vessels.boat_name at write time rather than
-- joined at read time: GET /api/spots is a public, unauthenticated endpoint
-- also served to the dispatcher dashboard (see backend/app/api/spots.py),
-- and a fisherman's boat name is not sensitive the way an account would be.

CREATE TABLE IF NOT EXISTS fishing_spots (
  id           BIGSERIAL PRIMARY KEY,
  vessel_id    TEXT NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  local_id     TEXT,
  posted_by    TEXT,
  latitude     DOUBLE PRECISION NOT NULL,
  longitude    DOUBLE PRECISION NOT NULL,
  species_name TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fishing_spots_local_id
  ON fishing_spots (local_id)
  WHERE local_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fishing_spots_recent
  ON fishing_spots (created_at DESC);
