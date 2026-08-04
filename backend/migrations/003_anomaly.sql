CREATE TABLE IF NOT EXISTS vessel_profiles (
  vessel_id TEXT PRIMARY KEY REFERENCES vessels(id) ON DELETE CASCADE,
  profile_json JSONB NOT NULL,
  trip_count INTEGER NOT NULL,
  low_confidence BOOLEAN NOT NULL DEFAULT FALSE,
  rebuilt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_synthetic BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS vessel_anomaly_scores (
  vessel_id TEXT NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  trip_id TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  last_contact_at TIMESTAMPTZ NOT NULL,
  score DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL,
  factors JSONB NOT NULL,
  expected_next_buoy_id TEXT,
  expected_window_start TIMESTAMPTZ,
  expected_window_end TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  low_confidence BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_synthetic BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (vessel_id, trip_id)
);

CREATE INDEX IF NOT EXISTS idx_vessel_anomaly_scores_active
  ON vessel_anomaly_scores (is_active, score DESC, observed_at DESC);
