-- Responder loop: the dashboard answers back.
--
-- Until now an SOS was one-way. A fisher pressed the button and heard nothing,
-- with no way to tell whether anyone had seen it - so no way to decide whether
-- to stay with the boat or start swimming.
--
-- eta_at is an absolute timestamp, not a duration, and that is deliberate.
-- The dispatcher types "15 minutes" but the system stores the arrival time. A
-- duration decays in transit: four minutes spent traversing a store-and-forward
-- mesh and a handset told "15 minutes" counts down from 15 when 11 remain, with
-- the error growing at every relay hop. A timestamp stays correct however slow
-- delivery is, and the handset derives its own countdown.

ALTER TABLE sos_events ADD COLUMN IF NOT EXISTS eta_at TIMESTAMPTZ;

-- One-byte code rather than free text: cheap enough for a 64-byte LoRa frame in
-- phase 2, consistent under pressure, and translatable into Aklanon on the
-- handset. See docs/13_RESPONDER_LOOP.md for the table.
--   1 RECEIVED  2 DISPATCHED  3 COAST_GUARD  4 NEAREST_VESSEL  5 DELAYED
ALTER TABLE sos_events ADD COLUMN IF NOT EXISTS responder_status SMALLINT;

-- Optional and direct-path only; will not fit in a LoRa frame.
ALTER TABLE sos_events ADD COLUMN IF NOT EXISTS responder_note TEXT;

-- The fisher's one-tap answer. Confirms they are alive and conscious after the
-- acknowledgement, which the acknowledgement itself cannot tell us.
--   1 STILL_IN_DANGER   2 SAFE_NOW
ALTER TABLE sos_events ADD COLUMN IF NOT EXISTS fisher_reply SMALLINT;
ALTER TABLE sos_events ADD COLUMN IF NOT EXISTS fisher_replied_at TIMESTAMPTZ;

-- Set when the incident is closed, by a SAFE_NOW reply or by a dispatcher.
ALTER TABLE sos_events ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- The handset polls by vessel, so index that path.
CREATE INDEX IF NOT EXISTS idx_sos_events_vessel_recent
  ON sos_events (vessel_id, created_at DESC);

-- Dispatcher view: unresolved incidents with an ETA that has already passed.
CREATE INDEX IF NOT EXISTS idx_sos_events_eta_open
  ON sos_events (eta_at)
  WHERE resolved_at IS NULL AND eta_at IS NOT NULL;
