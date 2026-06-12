-- ============================================================================
-- Manual DB migration — align DPR machinery entry to the form
-- Schema: app_quikinfra   Table: Dpr_machinery_entries   Model: CnDPRMachineryEntry
--
-- Reason: the DPR form captures machinery as description / condition /
-- requiredQty / actualQty / remarks, but the old model stored machineryId /
-- hoursWorked / fuelConsumed / operatorName — a complete shape mismatch, so
-- everything except `remarks` was silently dropped on save. We realigned the
-- model to the form (option A). This migration adds the new columns and drops
-- the old, never-populated ones.
--
-- Run on BOTH local and the central (production) databases. Idempotent.
-- Existing rows held no meaningful machinery data (machineryId was always "",
-- hoursWorked 0), so dropping the old columns loses nothing real.
--
-- NOTE: after deploying the code, `prisma generate` must run (DB-free) so the
-- client matches. This SQL is the actual DB change.
-- ============================================================================

ALTER TABLE "app_quikinfra"."Dpr_machinery_entries"
  ADD COLUMN IF NOT EXISTS "description" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "condition" text,
  ADD COLUMN IF NOT EXISTS "requiredQty" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "actualQty" integer NOT NULL DEFAULT 0;

ALTER TABLE "app_quikinfra"."Dpr_machinery_entries"
  DROP COLUMN IF EXISTS "machineryId",
  DROP COLUMN IF EXISTS "hoursWorked",
  DROP COLUMN IF EXISTS "fuelConsumed",
  DROP COLUMN IF EXISTS "operatorName";
