-- Phase 2 of docs/41_OPERATIONS_CONSOLE_AUDITABILITY_IMPLEMENTATION_PLAN.md:
-- one shared, append-only record of who did what to a responder-facing
-- resource. Deliberately narrow - no whole-row duplication of the domain
-- tables, no per-feature history table, no event sourcing for the app.
--
-- metadata is a small, caller-built whitelist (see app/audit.py) - never raw
-- credentials, free-text SOS/responder/advisory content, exact coordinates,
-- or request headers.

CREATE TABLE IF NOT EXISTS operations_audit_events (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_user_id TEXT,
  actor_email TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  outcome TEXT NOT NULL,
  correlation_key TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_operations_audit_events_resource
  ON operations_audit_events (resource_type, resource_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_operations_audit_events_actor
  ON operations_audit_events (actor_user_id, occurred_at DESC);

-- Append-only: block ordinary UPDATE/DELETE from any role, including the
-- app's own connection - a plain REVOKE has no effect on a table's own
-- owner, which the app's single DB role is here. This is administrative
-- protection, not cryptographic or legally attested immutability: a
-- database admin can still run
--   ALTER TABLE operations_audit_events DISABLE TRIGGER trg_operations_audit_events_append_only;
-- to intervene directly.
CREATE OR REPLACE FUNCTION _operations_audit_events_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'operations_audit_events is append-only: % not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_operations_audit_events_append_only ON operations_audit_events;
CREATE TRIGGER trg_operations_audit_events_append_only
  BEFORE UPDATE OR DELETE ON operations_audit_events
  FOR EACH ROW EXECUTE FUNCTION _operations_audit_events_append_only();
