CREATE TABLE IF NOT EXISTS advisories (
  id BIGSERIAL PRIMARY KEY,
  source_key TEXT UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Weather Advisory',
  description TEXT NOT NULL,
  municipality TEXT NOT NULL DEFAULT 'All',
  priority TEXT NOT NULL DEFAULT 'Information',
  publish_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expiration_date DATE,
  cover_image TEXT,
  status TEXT NOT NULL DEFAULT 'Published',
  source TEXT NOT NULL DEFAULT 'LGU',
  score INTEGER,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advisories_visible
  ON advisories (status, publish_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_advisories_municipality
  ON advisories (municipality);
