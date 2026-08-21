ALTER TABLE barometric_readings
  ADD COLUMN IF NOT EXISTS demo_tag TEXT;
CREATE INDEX IF NOT EXISTS idx_barometric_readings_demo_tag
  ON barometric_readings (demo_tag);

ALTER TABLE squall_events
  ADD COLUMN IF NOT EXISTS demo_tag TEXT;
CREATE INDEX IF NOT EXISTS idx_squall_events_demo_tag
  ON squall_events (demo_tag);

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS demo_tag TEXT;
CREATE INDEX IF NOT EXISTS idx_incidents_demo_tag
  ON incidents (demo_tag);

ALTER TABLE search_sectors
  ADD COLUMN IF NOT EXISTS demo_tag TEXT;
CREATE INDEX IF NOT EXISTS idx_search_sectors_demo_tag
  ON search_sectors (demo_tag);

ALTER TABLE buoy_contacts
  ADD COLUMN IF NOT EXISTS demo_tag TEXT;
CREATE INDEX IF NOT EXISTS idx_buoy_contacts_demo_tag
  ON buoy_contacts (demo_tag);

ALTER TABLE sos_events
  ADD COLUMN IF NOT EXISTS demo_tag TEXT;
CREATE INDEX IF NOT EXISTS idx_sos_events_demo_tag
  ON sos_events (demo_tag);

ALTER TABLE vessels
  ADD COLUMN IF NOT EXISTS demo_tag TEXT;
CREATE INDEX IF NOT EXISTS idx_vessels_demo_tag
  ON vessels (demo_tag);

ALTER TABLE advisories
  ADD COLUMN IF NOT EXISTS demo_tag TEXT;
CREATE INDEX IF NOT EXISTS idx_advisories_demo_tag
  ON advisories (demo_tag);
