-- Bayesian search allocation: record which sectors have been searched and
-- what the prior/posterior grids are so the sequence can be replayed or reset.

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS prior_grid JSONB,
  ADD COLUMN IF NOT EXISTS posterior_grid JSONB;

CREATE TABLE IF NOT EXISTS search_sectors (
  id BIGSERIAL PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  x_min_m DOUBLE PRECISION NOT NULL,
  x_max_m DOUBLE PRECISION NOT NULL,
  y_min_m DOUBLE PRECISION NOT NULL,
  y_max_m DOUBLE PRECISION NOT NULL,
  detection_probability DOUBLE PRECISION NOT NULL,
  searched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_synthetic BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_search_sectors_incident
  ON search_sectors (incident_id);
