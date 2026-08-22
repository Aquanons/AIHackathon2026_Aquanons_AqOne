-- Mesh chat relay — stores messages forwarded from the Heltec WiFi hub
-- so the dashboard can display them when accessed via the cloud.

CREATE TABLE IF NOT EXISTS mesh_chat (
  id         BIGSERIAL PRIMARY KEY,
  sender     TEXT NOT NULL,
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mesh_chat_created_at ON mesh_chat (created_at DESC);
