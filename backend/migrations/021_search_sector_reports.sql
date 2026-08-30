-- Phase 3 of docs/40_DRIFT_PREDICTION_SEARCH_RETASKING_IMPLEMENTATION_PLAN.md:
-- a searched sector reported through the protected responder contract now
-- carries which run it was checked against, who reported it, the approved
-- detection-method preset, an optional note, and an idempotency key - an
-- operational audit record, not a demo primitive.
--
-- The synthetic/demo fixture path (app/demo/scenarios.py, via
-- record_legacy_search_sector) is unaffected: it keeps writing rows with
-- these new columns NULL, exactly as every pre-Phase-3 sector already is -
-- "preserve existing synthetic sectors and replay ability" (docs/40 Phase 3
-- item 3).

ALTER TABLE search_sectors
  ADD COLUMN IF NOT EXISTS run_id BIGINT REFERENCES drift_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reported_by TEXT,
  ADD COLUMN IF NOT EXISTS method TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- A retry with the same key against the same incident must be a no-op
-- (return the current state), never a second Bayesian update (docs/40
-- Phase 3 item 4 "deduplicate the idempotency key").
CREATE UNIQUE INDEX IF NOT EXISTS uq_search_sectors_idempotency
  ON search_sectors (incident_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
