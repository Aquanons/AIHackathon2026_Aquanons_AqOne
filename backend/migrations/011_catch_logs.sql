-- Catch logging, back in scope after being cut during hackathon rescoping
-- (see docs/07_SCOPE_OUT.md and docs/guides/07_SECURITY.md). The mobile app
-- was fully built for this the first time around; only the backend side was
-- never shipped, so this is new rather than a restore.
--
-- Unlike sos_events, a catch log never travels over LoRa - it is queued on
-- the handset and uploaded over plain HTTP whenever the phone has signal, so
-- there is no buoy/src_id/seq bookkeeping here.
--
-- local_id is the handset's idempotency key (mobile/lib/services/catch_service.dart
-- retries an upload until it gets a definite answer). Partial unique index
-- because a request built before this column existed - or one with no local
-- queue at all - has no local_id to be unique on.

CREATE TABLE IF NOT EXISTS catch_logs (
  id           BIGSERIAL PRIMARY KEY,
  vessel_id    TEXT NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  local_id     TEXT,
  species_name TEXT,
  quantity_kg  DOUBLE PRECISION NOT NULL,
  catch_date   DATE NOT NULL,
  latitude     DOUBLE PRECISION,
  longitude    DOUBLE PRECISION,
  method       TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_catch_logs_local_id
  ON catch_logs (local_id)
  WHERE local_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_catch_logs_vessel
  ON catch_logs (vessel_id, catch_date DESC);

CREATE INDEX IF NOT EXISTS idx_catch_logs_recent
  ON catch_logs (created_at DESC);
