-- Splits catch weight into a quick estimate (set immediately, from a preset
-- the fisherman tapped at the moment of catching) and a real, reweighed
-- figure that is confirmed separately and may arrive much later, once the
-- boat is back on land. See mobile/lib/models/catch_record.dart's doc
-- comment for the full reasoning: typing an exact weight is the slowest
-- part of logging a catch, and it is rarely accurate at sea anyway.
--
-- quantity_kg was NOT NULL as of migration 011. It becomes nullable here -
-- species and the estimate sync immediately; the confirmed weight starts
-- empty and is filled in by a separate call
-- (POST /api/catch-logs/{id}/confirm-weight) whenever it is known.

ALTER TABLE catch_logs ALTER COLUMN quantity_kg DROP NOT NULL;

ALTER TABLE catch_logs ADD COLUMN IF NOT EXISTS estimated_quantity_kg DOUBLE PRECISION;
ALTER TABLE catch_logs ADD COLUMN IF NOT EXISTS quantity_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE catch_logs ADD COLUMN IF NOT EXISTS quantity_confirmed_at TIMESTAMPTZ;

-- Backfill: every row that existed before this migration had a firm
-- quantity_kg (it was NOT NULL) with no separate estimate concept, so it is
-- both the estimate and an already-confirmed figure.
UPDATE catch_logs
   SET estimated_quantity_kg = quantity_kg,
       quantity_confirmed    = TRUE,
       quantity_confirmed_at = created_at
 WHERE estimated_quantity_kg IS NULL
   AND quantity_kg IS NOT NULL;

ALTER TABLE catch_logs ALTER COLUMN estimated_quantity_kg SET NOT NULL;
