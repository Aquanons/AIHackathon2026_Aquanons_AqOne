ALTER TABLE catch_logs
  ADD COLUMN IF NOT EXISTS share_for_hotspots BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_catch_logs_hotspot_source
  ON catch_logs (catch_date DESC)
  WHERE share_for_hotspots = TRUE
    AND latitude IS NOT NULL
    AND longitude IS NOT NULL;
