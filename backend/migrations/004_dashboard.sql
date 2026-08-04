-- Dashboard support tables.
--
-- sea_conditions is append-only: the MDRRMO-declared condition is a decision
-- with an audit trail, so a new declaration inserts a row rather than updating
-- the previous one. The "current" condition is simply the most recent row.

CREATE TABLE IF NOT EXISTS sea_conditions (
  id BIGSERIAL PRIMARY KEY,
  status TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  set_by_user_id TEXT,
  set_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sea_conditions_created_at
  ON sea_conditions (created_at DESC);
