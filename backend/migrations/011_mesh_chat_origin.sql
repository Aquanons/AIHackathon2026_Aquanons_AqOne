-- Records which leg of the relay a chat message arrived on: "app" (a handset
-- posting straight to the cloud), "hub" (forwarded by the Heltec from the
-- Aquan mesh) or "shore" (typed into the dashboard).
--
-- The hub polls /api/mesh/chat for downlink traffic and needs to skip the
-- messages it uplinked itself, otherwise every message it relays comes
-- straight back and is rebroadcast to the boats that just sent it.

ALTER TABLE mesh_chat ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'app';
