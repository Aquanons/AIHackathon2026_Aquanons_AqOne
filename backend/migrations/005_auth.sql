-- Dashboard operator accounts.
--
-- Accounts are created only through /api/admin-signup, which requires a
-- server-side setup key. There is no public registration: the dashboard is an
-- MDRRMO/LGU operations tool, not a consumer product.

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'mdrrmo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email_normalized
  ON users (email_normalized);
