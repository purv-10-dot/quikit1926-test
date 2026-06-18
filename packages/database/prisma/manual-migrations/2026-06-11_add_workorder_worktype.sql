-- ============================================================================
-- Manual DB migration — add `workType` to Work Orders
-- Schema: app_quikinfra   Table: Work_orders   Model: CnWorkOrder
--
-- Reason: schema.prisma now has CnWorkOrder.workType (String?). Previously the
-- selected Work Type ("Labour Only", "With Material…", "Without Material…")
-- was never persisted — the API hardcoded "Without Material" — so the list
-- always showed that value. This adds the column so the chosen value is stored
-- and shown.
--
-- Run on BOTH local and the central (production) databases. Idempotent.
-- A plain nullable text column — no FK, no index. Existing rows get NULL
-- (the UI shows "—" for them until they're edited).
--
-- NOTE: after deploying the code, `prisma generate` must run (DB-free) so the
-- client knows the new field. This SQL is the actual DB change.
-- ============================================================================

ALTER TABLE "app_quikinfra"."Work_orders"
  ADD COLUMN IF NOT EXISTS "workType" text;
