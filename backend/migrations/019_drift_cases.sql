-- Phase 1 of docs/40_DRIFT_PREDICTION_SEARCH_RETASKING_IMPLEMENTATION_PLAN.md:
-- turn `incidents` (until now written only by the simulator and the demo
-- scenario engine) into the record of a responder-confirmed drift/search
-- case, without introducing a second incident table.
--
-- A real case must trace back to the confirmed source that opened it: a
-- responder-acknowledged sos_events row, or a responder-escalated
-- anomaly_cases row. Only the synthetic/demo fixture path (is_synthetic) may
-- skip that link - chk_incidents_source enforces this at the database, not
-- just in the API handler.
--
-- true_track is a synthetic-evaluation-only field (docs/40 "Current findings
-- ... Ground truth must never appear for a real incident"). It drops its
-- NOT NULL so a real case is never forced to fabricate one.
--
-- resolved_at/cancelled_at are independent of the *source's* own
-- acknowledged/resolved state - a dispatcher closes the search case itself,
-- separately from closing the underlying SOS or anomaly case.

ALTER TABLE incidents ALTER COLUMN true_track DROP NOT NULL;

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS source_sos_event_id BIGINT REFERENCES sos_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_anomaly_case_id BIGINT REFERENCES anomaly_cases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS object_class TEXT,
  ADD COLUMN IF NOT EXISTS opened_by TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;

ALTER TABLE incidents DROP CONSTRAINT IF EXISTS chk_incidents_source;
ALTER TABLE incidents ADD CONSTRAINT chk_incidents_source
  CHECK (is_synthetic OR source_sos_event_id IS NOT NULL OR source_anomaly_case_id IS NOT NULL);

-- One case per source: a second "open case" call on the same SOS/anomaly
-- must fail (API returns 409) rather than fork a second search effort for
-- the same emergency.
CREATE UNIQUE INDEX IF NOT EXISTS uq_incidents_source_sos
  ON incidents (source_sos_event_id) WHERE source_sos_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_incidents_source_anomaly
  ON incidents (source_anomaly_case_id) WHERE source_anomaly_case_id IS NOT NULL;
