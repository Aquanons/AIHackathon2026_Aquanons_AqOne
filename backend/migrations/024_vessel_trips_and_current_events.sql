-- Phase 2 of docs/AI_ACCURACY_IMPLEMENTATION_PLAN.md:
-- 1. Trustworthy physical current observation ingest
-- 2. Explicit vessel trip evidence collection

-- Allow true_u_mps and true_v_mps to be NULL for physical field observations
-- (ground truth is only known in synthetic simulations).
ALTER TABLE current_observations ALTER COLUMN true_u_mps DROP NOT NULL;
ALTER TABLE current_observations ALTER COLUMN true_v_mps DROP NOT NULL;

-- Support upstream gateway event_id for idempotency on network retries
ALTER TABLE current_observations ADD COLUMN IF NOT EXISTS event_id TEXT;

-- Physical measurement attributes
ALTER TABLE current_observations ADD COLUMN IF NOT EXISTS depth_m DOUBLE PRECISION DEFAULT 1.0;
ALTER TABLE current_observations ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'synthetic';
ALTER TABLE current_observations ADD COLUMN IF NOT EXISTS calibration_status TEXT NOT NULL DEFAULT 'uncalibrated';
ALTER TABLE current_observations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE current_observations DROP CONSTRAINT IF EXISTS chk_current_observations_source;
ALTER TABLE current_observations ADD CONSTRAINT chk_current_observations_source CHECK (source IN ('live', 'synthetic'));

ALTER TABLE current_observations DROP CONSTRAINT IF EXISTS chk_current_observations_calibration;
ALTER TABLE current_observations ADD CONSTRAINT chk_current_observations_calibration CHECK (calibration_status IN ('qualified', 'uncalibrated', 'synthetic'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_current_observations_event_id
  ON current_observations (event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_current_observations_source
  ON current_observations (source);

CREATE INDEX IF NOT EXISTS idx_current_observations_created_at
  ON current_observations (created_at);

-- Explicit vessel trips table for open trip monitoring and welfare confirmation
CREATE TABLE IF NOT EXISTS vessel_trips (
  id BIGSERIAL PRIMARY KEY,
  trip_id TEXT NOT NULL UNIQUE,
  vessel_id TEXT NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  departure_at TIMESTAMPTZ,
  expected_return_at TIMESTAMPTZ,
  expected_checkin_interval_minutes INT,
  status TEXT NOT NULL DEFAULT 'open',
  welfare_status TEXT NOT NULL DEFAULT 'unknown',
  reported_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reporter_id TEXT,
  reporter_type TEXT NOT NULL DEFAULT 'handset',
  vessel_type TEXT DEFAULT 'banca',
  vessel_length_m DOUBLE PRECISION DEFAULT 6.0,
  vessel_draft_m DOUBLE PRECISION DEFAULT 0.4,
  amendments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE vessel_trips DROP CONSTRAINT IF EXISTS chk_vessel_trips_status;
ALTER TABLE vessel_trips ADD CONSTRAINT chk_vessel_trips_status CHECK (status IN ('open', 'completed', 'overdue', 'unresolved', 'cancelled'));

ALTER TABLE vessel_trips DROP CONSTRAINT IF EXISTS chk_vessel_trips_welfare;
ALTER TABLE vessel_trips ADD CONSTRAINT chk_vessel_trips_welfare CHECK (welfare_status IN ('normal', 'safe', 'distress', 'unknown'));

ALTER TABLE vessel_trips DROP CONSTRAINT IF EXISTS chk_vessel_trips_reporter_type;
ALTER TABLE vessel_trips ADD CONSTRAINT chk_vessel_trips_reporter_type CHECK (reporter_type IN ('handset', 'gateway', 'responder', 'system'));

CREATE INDEX IF NOT EXISTS idx_vessel_trips_vessel_id
  ON vessel_trips (vessel_id);

CREATE INDEX IF NOT EXISTS idx_vessel_trips_status
  ON vessel_trips (status);

CREATE INDEX IF NOT EXISTS idx_vessel_trips_expected_return
  ON vessel_trips (expected_return_at);

-- Warning delivery state tracking (Task 2.5)
CREATE TABLE IF NOT EXISTS warning_delivery_events (
  id BIGSERIAL PRIMARY KEY,
  warning_id BIGINT NOT NULL REFERENCES advisories(id) ON DELETE CASCADE,
  vessel_id TEXT REFERENCES vessels(id) ON DELETE SET NULL,
  buoy_id TEXT REFERENCES buoys(id) ON DELETE SET NULL,
  delivery_state TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE warning_delivery_events DROP CONSTRAINT IF EXISTS chk_warning_delivery_state;
ALTER TABLE warning_delivery_events ADD CONSTRAINT chk_warning_delivery_state
  CHECK (delivery_state IN ('generated', 'gateway_accepted', 'buoy_received', 'phone_received', 'user_acknowledged'));

CREATE INDEX IF NOT EXISTS idx_warning_delivery_warning
  ON warning_delivery_events (warning_id, delivery_state);
