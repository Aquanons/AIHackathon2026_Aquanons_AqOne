-- SOS ingest with cross-transport de-duplication.
--
-- An SOS can now reach the backend by two independent routes:
--
--   direct  phone -> HTTPS -> backend            (when the phone has internet)
--   buoy    phone -> WiFi -> LoRa -> gateway -> backend
--
-- Both are attempted deliberately. For a distress signal, redundancy beats
-- tidiness: whichever arrives first wins and the other must not create a
-- second incident on the dispatcher's screen.
--
-- The de-duplication key is (vessel_id, client_ts).
--
-- Why not local_id alone? The phone's local_id is a UUID, but the LoRa frame
-- carries only 64 payload bytes (docs/02_LOAM_PACKET_SPEC.md) - a 36-character
-- UUID would consume more than half of it, leaving no room for position and
-- note. The frame header already carries TS, the origin epoch second, which is
-- the same value the phone stores as client_ts. So both transports know it for
-- free, with no firmware change.
--
-- A vessel does not raise two distinct emergencies within the same second, so
-- the pair is safely unique. local_id is still recorded and uniquely indexed
-- where present, as a second guard for the direct path.

ALTER TABLE sos_events ADD COLUMN IF NOT EXISTS local_id TEXT;
ALTER TABLE sos_events ADD COLUMN IF NOT EXISTS client_ts BIGINT;
ALTER TABLE sos_events ADD COLUMN IF NOT EXISTS boat TEXT;
ALTER TABLE sos_events ADD COLUMN IF NOT EXISTS note_source TEXT;
ALTER TABLE sos_events ADD COLUMN IF NOT EXISTS src_id BIGINT;
ALTER TABLE sos_events ADD COLUMN IF NOT EXISTS seq INTEGER;
ALTER TABLE sos_events ADD COLUMN IF NOT EXISTS trust_tier TEXT NOT NULL DEFAULT 'self_declared';

-- Which routes actually delivered this event. Both may be true; the dispatcher
-- sees one incident either way. Useful evidence that the mesh worked.
ALTER TABLE sos_events ADD COLUMN IF NOT EXISTS delivered_direct BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sos_events ADD COLUMN IF NOT EXISTS delivered_via_buoy BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sos_events ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE sos_events ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
ALTER TABLE sos_events ADD COLUMN IF NOT EXISTS acked_by TEXT;

-- Backfill so the unique index below can be created on existing rows.
UPDATE sos_events
   SET client_ts = EXTRACT(EPOCH FROM created_at)::BIGINT
 WHERE client_ts IS NULL;

-- The cross-transport idempotency key.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sos_events_vessel_client_ts
  ON sos_events (vessel_id, client_ts);

-- Second guard for the direct path. Partial, because SOS arriving over LoRa
-- has no local_id and several such rows would otherwise collide on NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sos_events_local_id
  ON sos_events (local_id)
  WHERE local_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sos_events_recent
  ON sos_events (created_at DESC);
