-- ============================================================================
-- Manual DB migration — add returnable period to equipment transfers
-- Schema: app_quikinfra   Table: Equipment_deployment   Model: CnEquipmentDeployment
--
-- Reason: equipment transfers of type "returnable" need a return window —
-- the dates from/to which the machine is on loan to the destination project.
-- The "New Equipment Transfer" form now shows "Returnable From" / "Returnable
-- Until" date inputs only when Transfer Type = Returnable, and the create API
-- requires them for returnable transfers.
--
-- This adds:
--   returnableFrom  (nullable)  — first day of the returnable window
--   returnableTo    (nullable)  — last day of the returnable window
--
-- Both columns are nullable: reassignment transfers and existing rows keep NULL.
--
-- Run on BOTH local and the central (production) databases. Idempotent.
--
-- NOTE: after deploying the code, `prisma generate` must run (DB-free) so the
-- client knows the new fields. This SQL is the actual DB change.
-- ============================================================================

ALTER TABLE "app_quikinfra"."Equipment_deployment"
  ADD COLUMN IF NOT EXISTS "returnableFrom" timestamp(3),
  ADD COLUMN IF NOT EXISTS "returnableTo"   timestamp(3);
