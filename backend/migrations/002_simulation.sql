ALTER TABLE vessels ADD COLUMN IF NOT EXISTS home_buoy_id TEXT;
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS preferred_heading_deg DOUBLE PRECISION;
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS typical_departure_local TEXT;
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS typical_return_local TEXT;
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS cruising_speed_kph DOUBLE PRECISION;
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS route_buoy_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS is_synthetic BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE buoys ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE buoys ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION;
ALTER TABLE buoys ADD COLUMN IF NOT EXISTS contact_radius_m INTEGER;
ALTER TABLE buoys ADD COLUMN IF NOT EXISTS is_synthetic BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE buoy_contacts ADD COLUMN IF NOT EXISTS vessel_id TEXT;
ALTER TABLE buoy_contacts ADD COLUMN IF NOT EXISTS trip_id TEXT;
ALTER TABLE buoy_contacts ADD COLUMN IF NOT EXISTS sequence_no INTEGER;
ALTER TABLE buoy_contacts ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ;
ALTER TABLE buoy_contacts ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE buoy_contacts ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE buoy_contacts ADD COLUMN IF NOT EXISTS is_synthetic BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE sos_events ADD COLUMN IF NOT EXISTS is_synthetic BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS barometric_readings (
  id BIGSERIAL PRIMARY KEY,
  buoy_id TEXT NOT NULL REFERENCES buoys(id) ON DELETE CASCADE,
  observed_at TIMESTAMPTZ NOT NULL,
  pressure_hpa DOUBLE PRECISION NOT NULL,
  is_synthetic BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_barometric_readings_buoy_time
  ON barometric_readings (buoy_id, observed_at);

CREATE TABLE IF NOT EXISTS squall_events (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL,
  peak_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  center_lat DOUBLE PRECISION NOT NULL,
  center_lon DOUBLE PRECISION NOT NULL,
  front_origin_lat DOUBLE PRECISION NOT NULL,
  front_origin_lon DOUBLE PRECISION NOT NULL,
  bearing_deg DOUBLE PRECISION NOT NULL,
  speed_kph DOUBLE PRECISION NOT NULL,
  pressure_drop_hpa DOUBLE PRECISION NOT NULL,
  rise_minutes INTEGER NOT NULL,
  hold_minutes INTEGER NOT NULL,
  observed_buoy_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_synthetic BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_squall_events_started_at
  ON squall_events (started_at);

CREATE TABLE IF NOT EXISTS current_observations (
  id BIGSERIAL PRIMARY KEY,
  buoy_id TEXT NOT NULL REFERENCES buoys(id) ON DELETE CASCADE,
  observed_at TIMESTAMPTZ NOT NULL,
  true_u_mps DOUBLE PRECISION NOT NULL,
  true_v_mps DOUBLE PRECISION NOT NULL,
  observed_u_mps DOUBLE PRECISION NOT NULL,
  observed_v_mps DOUBLE PRECISION NOT NULL,
  is_synthetic BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_current_observations_buoy_time
  ON current_observations (buoy_id, observed_at);

CREATE TABLE IF NOT EXISTS incidents (
  id BIGSERIAL PRIMARY KEY,
  vessel_id TEXT NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  last_contact_at TIMESTAMPTZ NOT NULL,
  last_contact_buoy_id TEXT REFERENCES buoys(id) ON DELETE SET NULL,
  last_contact_lat DOUBLE PRECISION NOT NULL,
  last_contact_lon DOUBLE PRECISION NOT NULL,
  reported_missing_at TIMESTAMPTZ NOT NULL,
  abnormal_reason TEXT NOT NULL,
  true_track JSONB NOT NULL,
  is_synthetic BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_incidents_vessel_time
  ON incidents (vessel_id, last_contact_at);
