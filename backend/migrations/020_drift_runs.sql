-- Phase 2 of docs/40_DRIFT_PREDICTION_SEARCH_RETASKING_IMPLEMENTATION_PLAN.md:
-- one immutable, auditable snapshot per drift prediction run, computed once
-- at case-open time (or on an explicit responder-triggered rerun) rather
-- than recomputed on every read.
--
-- This is deliberately a separate table from incidents.prior_grid /
-- posterior_grid, not a replacement for them: those two columns keep serving
-- the simulator and demo-scenario fixture path exactly as before (docs/40
-- Phase 1 "keep a narrowly scoped demo fixture path for synthetic cases").
-- Only a real, responder-opened case (incidents.source_sos_event_id or
-- source_anomaly_case_id set) ever gets rows here. Versioning lives here
-- rather than as a second incidents row so a rerun can never collide with
-- the one-case-per-source uniqueness added in 019_drift_cases.sql.
--
-- A rerun appends run_number = previous max + 1 and leaves every earlier row
-- - and the search_sectors recorded against it - untouched, so a crew
-- already acting on run 1 is never silently redirected mid-search (docs/40
-- Phase 2 item 4). The "current" run for an incident is simply the row with
-- the highest run_number.

CREATE TABLE IF NOT EXISTS drift_runs (
  id BIGSERIAL PRIMARY KEY,
  incident_id BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  run_number INTEGER NOT NULL,
  object_class TEXT NOT NULL,
  forecast_hours DOUBLE PRECISION NOT NULL,
  model_version TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  computed_by TEXT,

  -- Frozen environmental-input snapshot (docs/40 Phase 2 item 3): what fed
  -- this run, and whether it cleared the production quality gate
  -- (app/ai/environment.py). insufficiency_reason is set only when
  -- environmental_status is not 'ok'. wind_source/wind_degraded/
  -- observed_coverage are NULL when the run failed the field-geometry
  -- pre-check - the particle simulation, which is what would compute them,
  -- never ran.
  environmental_status TEXT NOT NULL
    CHECK (environmental_status IN ('ok', 'insufficient_environmental_data')),
  insufficiency_reason TEXT,
  observed_coverage DOUBLE PRECISION,
  current_max_age_seconds DOUBLE PRECISION NOT NULL,
  nearby_buoy_count INTEGER NOT NULL,
  wind_source TEXT,
  wind_degraded BOOLEAN,
  max_wind_age_seconds DOUBLE PRECISION NOT NULL,

  -- NULL when environmental_status is not 'ok': an insufficient run has no
  -- contour to show, by construction (docs/40 "not a contour inferred from a
  -- synthetic fallback").
  prior_grid JSONB,
  posterior_grid JSONB,

  UNIQUE (incident_id, run_number)
);

CREATE INDEX IF NOT EXISTS idx_drift_runs_incident_latest
  ON drift_runs (incident_id, run_number DESC);
