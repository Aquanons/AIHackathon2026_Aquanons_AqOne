-- Phase 1 of docs/39_SQUALL_NOWCASTING_IMPLEMENTATION_PLAN.md:
-- trustworthy gateway pressure-event ingest.
--
-- barometric_readings previously had no way to tell a live buoy reading from
-- synthetic/demo data other than the is_synthetic boolean, and no way to
-- deduplicate a retried gateway submission - a network retry would silently
-- create a second logical reading. Mirrors 016_contact_events.sql exactly.
--
-- event_id is the gateway's upstream event id (docs/04_INGEST_API.md
-- "Pressure events"). It stays nullable because the existing generator
-- (app/simulation/generator.py) and demo scenarios (app/demo/scenarios.py)
-- still insert directly without one; only rows from the new gateway endpoint
-- carry it, and only those need the uniqueness guarantee.
--
-- source is the explicit live/synthetic label the plan's acceptance boundary
-- requires. It defaults to 'synthetic' so every pre-existing row (all of
-- which were written with is_synthetic = TRUE - there is no other writer
-- today) keeps its true meaning without a data rewrite.

ALTER TABLE barometric_readings ADD COLUMN IF NOT EXISTS event_id TEXT;
ALTER TABLE barometric_readings ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'synthetic';

ALTER TABLE barometric_readings DROP CONSTRAINT IF EXISTS chk_barometric_readings_source;
ALTER TABLE barometric_readings ADD CONSTRAINT chk_barometric_readings_source CHECK (source IN ('live', 'synthetic'));

-- Partial: only gateway-submitted rows carry an event_id, and only those need
-- deduplication. NULL is excluded so historical/generator/demo rows (which
-- have none) never collide with each other on NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_barometric_readings_event_id
  ON barometric_readings (event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_barometric_readings_source
  ON barometric_readings (source);
