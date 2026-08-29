-- Phase 3 of docs/38_AUTOMATIC_DISTRESS_DETECTION_IMPLEMENTATION_PLAN.md:
-- a persistent responder-review record, separate from the derived scores in
-- vessel_anomaly_scores.
--
-- vessel_anomaly_scores is a snapshot: every evaluation run overwrites it,
-- and Phase 2 already made that non-destructive but not history-preserving -
-- a case needs to survive being overwritten by the next run, and a
-- responder's decision must never be erased by a later score refresh
-- (docs/38 acceptance boundary). So this table's own identity
-- (vessel_id, trip_id) is refreshed by evaluation, but the responder-action
-- columns (acknowledged/dismissed/escalated/resolved) are written only by
-- app/api/anomaly_cases.py, never by app/ai/anomaly_service.py.
--
-- case_type follows the acceptance boundary directly: "Low-confidence
-- results enter a verification queue. High-confidence results request
-- responder attention." - profile.low_confidence -> verification,
-- otherwise -> responder_attention. Neither is an SOS; sos_events is a
-- separate table and this one is never written to it.

CREATE TABLE IF NOT EXISTS anomaly_cases (
  id BIGSERIAL PRIMARY KEY,
  vessel_id TEXT NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  trip_id TEXT NOT NULL,
  case_type TEXT NOT NULL CHECK (case_type IN ('verification', 'responder_attention')),
  score DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL,
  reasons JSONB NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('live', 'synthetic')),
  score_evaluated_at TIMESTAMPTZ NOT NULL,
  last_contact_at TIMESTAMPTZ NOT NULL,
  is_synthetic BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  dismissed_at TIMESTAMPTZ,
  dismissed_by TEXT,
  dismissed_reason TEXT,
  escalated_at TIMESTAMPTZ,
  escalated_by TEXT,
  escalated_reason TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  UNIQUE (vessel_id, trip_id)
);

-- The dashboard's "Trip checks" queue: unresolved cases, newest first.
CREATE INDEX IF NOT EXISTS idx_anomaly_cases_open
  ON anomaly_cases (updated_at DESC)
  WHERE resolved_at IS NULL;
