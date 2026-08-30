-- Phase 3 of docs/41_OPERATIONS_CONSOLE_AUDITABILITY_IMPLEMENTATION_PLAN.md:
-- resolving an SOS previously reused `acked_by` for the resolver too,
-- conflating "who acknowledged" with "who resolved" and recording no
-- reason at all. anomaly_cases and incidents already have distinct
-- resolved_by/cancelled_by/cancelled_reason columns - sos_events was the
-- one table missing this.

ALTER TABLE sos_events
  ADD COLUMN IF NOT EXISTS resolved_by TEXT,
  ADD COLUMN IF NOT EXISTS resolved_reason TEXT;
