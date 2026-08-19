-- Vessel-bound handset credentials for Option A in docs/25.
--
-- SOS ingest stays unauthenticated because distress cannot depend on a token.
-- These tables exist to protect normal-operation reads and writes such as SOS
-- acknowledgement polling, fisher replies, and catch-log ownership updates.

CREATE TABLE IF NOT EXISTS vessel_device_pairings (
  id                BIGSERIAL PRIMARY KEY,
  vessel_id         TEXT NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  code_hash         TEXT NOT NULL,
  issued_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  issued_by_email   TEXT NOT NULL DEFAULT '',
  expires_at        TIMESTAMPTZ NOT NULL,
  consumed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vessel_device_pairings_lookup
  ON vessel_device_pairings (vessel_id, created_at DESC);

CREATE TABLE IF NOT EXISTS vessel_devices (
  id                   BIGSERIAL PRIMARY KEY,
  vessel_id            TEXT NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  label                TEXT NOT NULL DEFAULT '',
  paired_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at         TIMESTAMPTZ,
  last_token_issued_at TIMESTAMPTZ,
  revoked_at           TIMESTAMPTZ,
  revoked_by_user_id   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  revoked_reason       TEXT
);

CREATE INDEX IF NOT EXISTS idx_vessel_devices_vessel_recent
  ON vessel_devices (vessel_id, paired_at DESC);
