-- ============================================================================
-- COMBINED MANUAL DB MIGRATION — production run
-- Schema: app_quikinfra
-- Date assembled: 2026-06-18
--
-- This single file consolidates, in chronological order, the following manual
-- migrations so they can be applied to the central (production) database in one
-- pass:
--   1. 2026-06-10_add_project_relation_costcenter_machinery_asset.sql
--   2. 2026-06-11_add_dpr_staff_entries.sql
--   3. 2026-06-11_add_dpr_workitem_images.sql
--   4. 2026-06-11_add_workorder_worktype.sql
--   5. 2026-06-11_align_dpr_machinery_entry.sql
--   6. 2026-06-12_add_rab_deduction_tax_fields.sql
--   7. 20260618120000_dpr_manpower_trade_grid/migration.sql
--   8. 20260618130000_dpr_manpower_operator/migration.sql
--
-- Every statement is idempotent (IF [NOT] EXISTS / constraint guards), so the
-- file is safe to re-run. It is wrapped in a single transaction — if any
-- statement fails, nothing is committed.
--
-- After deploying the code, run `prisma generate` (DB-free) so the client
-- matches the new schema.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Project relation -> Cost Centre / Machinery / Asset
--    (FK + supporting indexes; projectId columns already exist)
-- ============================================================================

-- Indexes on the FK column.
CREATE INDEX IF NOT EXISTS "Cost_centers_projectId_idx"
  ON "app_quikinfra"."Cost_centers" ("projectId");

CREATE INDEX IF NOT EXISTS "Machinery_projectId_idx"
  ON "app_quikinfra"."Machinery" ("projectId");

CREATE INDEX IF NOT EXISTS "Assets_projectId_idx"
  ON "app_quikinfra"."Assets" ("projectId");

-- Foreign-key constraints -> Projects(id): ON DELETE SET NULL, ON UPDATE CASCADE.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Cost_centers_projectId_fkey'
  ) THEN
    ALTER TABLE "app_quikinfra"."Cost_centers"
      ADD CONSTRAINT "Cost_centers_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "app_quikinfra"."Projects"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Machinery_projectId_fkey'
  ) THEN
    ALTER TABLE "app_quikinfra"."Machinery"
      ADD CONSTRAINT "Machinery_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "app_quikinfra"."Projects"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Assets_projectId_fkey'
  ) THEN
    ALTER TABLE "app_quikinfra"."Assets"
      ADD CONSTRAINT "Assets_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "app_quikinfra"."Projects"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- 2. DPR Staff entries (Dpr_staff_entries / CnDPRStaff)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "app_quikinfra"."Dpr_staff_entries" (
  "id"          text PRIMARY KEY,
  "dprId"       text    NOT NULL,
  "name"        text    NOT NULL,
  "designation" text,
  "present"     boolean NOT NULL DEFAULT true,
  "reason"      text
);

CREATE INDEX IF NOT EXISTS "Dpr_staff_entries_dprId_idx"
  ON "app_quikinfra"."Dpr_staff_entries" ("dprId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Dpr_staff_entries_dprId_fkey'
  ) THEN
    ALTER TABLE "app_quikinfra"."Dpr_staff_entries"
      ADD CONSTRAINT "Dpr_staff_entries_dprId_fkey"
      FOREIGN KEY ("dprId") REFERENCES "app_quikinfra"."Daily_progress_reports"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- 3. DPR work-item images (Dpr_work_items.images — S3 object keys)
-- ============================================================================
ALTER TABLE "app_quikinfra"."Dpr_work_items"
  ADD COLUMN IF NOT EXISTS "images" text[] NOT NULL DEFAULT '{}';

-- ============================================================================
-- 4. Work Order workType (Work_orders.workType)
-- ============================================================================
ALTER TABLE "app_quikinfra"."Work_orders"
  ADD COLUMN IF NOT EXISTS "workType" text;

-- ============================================================================
-- 5. Align DPR machinery entry to the form (Dpr_machinery_entries)
--    Add the new form-shaped columns, drop the old never-populated ones.
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

-- ============================================================================
-- 6. RA Bill deduction / tax / lifecycle fields (Running_account_bills)
-- ============================================================================
ALTER TABLE "app_quikinfra"."Running_account_bills"
  ADD COLUMN IF NOT EXISTS "billType"             text           NOT NULL DEFAULT 'ra_bill',
  ADD COLUMN IF NOT EXISTS "grossBillAmount"      numeric(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tdsRate"              numeric(5, 2),
  ADD COLUMN IF NOT EXISTS "tdsAmount"            numeric(18, 2),
  ADD COLUMN IF NOT EXISTS "cgstRate"             numeric(5, 2),
  ADD COLUMN IF NOT EXISTS "cgstAmount"           numeric(18, 2),
  ADD COLUMN IF NOT EXISTS "sgstRate"             numeric(5, 2),
  ADD COLUMN IF NOT EXISTS "sgstAmount"           numeric(18, 2),
  ADD COLUMN IF NOT EXISTS "igstRate"             numeric(5, 2),
  ADD COLUMN IF NOT EXISTS "igstAmount"           numeric(18, 2),
  ADD COLUMN IF NOT EXISTS "mobilisationRecovery" numeric(18, 2),
  ADD COLUMN IF NOT EXISTS "liquidatedDamages"    numeric(18, 2),
  ADD COLUMN IF NOT EXISTS "labourCess"           numeric(18, 2),
  ADD COLUMN IF NOT EXISTS "otherDeductions"      numeric(18, 2),
  ADD COLUMN IF NOT EXISTS "paymentStatus"        text           NOT NULL DEFAULT 'unpaid';

-- ============================================================================
-- 7. DPR manpower trade-grid columns (Dpr_labour_entries)
--    (made idempotent vs. the original plain ADD COLUMN statements)
-- ============================================================================
ALTER TABLE "app_quikinfra"."Dpr_labour_entries" ADD COLUMN IF NOT EXISTS "workingArea"  TEXT;
ALTER TABLE "app_quikinfra"."Dpr_labour_entries" ADD COLUMN IF NOT EXISTS "messan"       DECIMAL(18,4);
ALTER TABLE "app_quikinfra"."Dpr_labour_entries" ADD COLUMN IF NOT EXISTS "maleHelper"   DECIMAL(18,4);
ALTER TABLE "app_quikinfra"."Dpr_labour_entries" ADD COLUMN IF NOT EXISTS "femaleHelper" DECIMAL(18,4);
ALTER TABLE "app_quikinfra"."Dpr_labour_entries" ADD COLUMN IF NOT EXISTS "carpenter"    DECIMAL(18,4);
ALTER TABLE "app_quikinfra"."Dpr_labour_entries" ADD COLUMN IF NOT EXISTS "fitter"       DECIMAL(18,4);
ALTER TABLE "app_quikinfra"."Dpr_labour_entries" ADD COLUMN IF NOT EXISTS "painter"      DECIMAL(18,4);
ALTER TABLE "app_quikinfra"."Dpr_labour_entries" ADD COLUMN IF NOT EXISTS "plumber"      DECIMAL(18,4);
ALTER TABLE "app_quikinfra"."Dpr_labour_entries" ADD COLUMN IF NOT EXISTS "electrician"  DECIMAL(18,4);

-- ============================================================================
-- 8. DPR manpower operator trade column (Dpr_labour_entries)
--    (made idempotent vs. the original plain ADD COLUMN statement)
-- ============================================================================
ALTER TABLE "app_quikinfra"."Dpr_labour_entries" ADD COLUMN IF NOT EXISTS "operator" DECIMAL(18,4);

COMMIT;
