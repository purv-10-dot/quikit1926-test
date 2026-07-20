-- ============================================================================
-- Muster Roll (app_quikinfra) — Section 2 provisioning migration
-- ----------------------------------------------------------------------------
-- Adds the daily attendance sheet tables:
--   • Muster_rolls       (CnMusterRoll)     — attendance sheet header
--   • Muster_roll_lines  (CnMusterRollLine) — one row per workman
--
-- Lean design: attendance/cost is derived from APPROVED musters (no separate
-- attendance ledger). The one-per-(project,date,engagement,contractor,shift)
-- rule is enforced in the repository (NOT a DB unique) so a REVERSED sheet's
-- key can be reused by a corrected sheet.
--
-- Pure additive. IDEMPOTENT (guarded). Run inside one transaction.
-- After applying, run `npx prisma generate`.
-- ============================================================================

BEGIN;

-- ─── CnMusterRoll → "Muster_rolls" ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "app_quikinfra"."Muster_rolls" (
    "id"             TEXT NOT NULL,
    "orgId"          TEXT NOT NULL,
    "musterNo"       TEXT NOT NULL,
    "projectId"      TEXT NOT NULL,
    "musterDate"     DATE NOT NULL,
    "engagementType" TEXT NOT NULL,
    "contractorId"   TEXT,
    "workOrderId"    TEXT,
    "shift"          TEXT NOT NULL DEFAULT 'DAY',
    "docStatus"      TEXT NOT NULL DEFAULT 'DRAFT',
    "remarks"        TEXT,
    "approvalId"     TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    "createdBy"      TEXT NOT NULL,
    "updatedBy"      TEXT NOT NULL,
    CONSTRAINT "Muster_rolls_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Muster_rolls_orgId_idx"
    ON "app_quikinfra"."Muster_rolls"("orgId");
CREATE INDEX IF NOT EXISTS "Muster_rolls_orgId_projectId_musterDate_idx"
    ON "app_quikinfra"."Muster_rolls"("orgId", "projectId", "musterDate");
CREATE INDEX IF NOT EXISTS "Muster_rolls_orgId_contractorId_musterDate_idx"
    ON "app_quikinfra"."Muster_rolls"("orgId", "contractorId", "musterDate");

DO $$ BEGIN
  ALTER TABLE "app_quikinfra"."Muster_rolls"
    ADD CONSTRAINT "Muster_rolls_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── CnMusterRollLine → "Muster_roll_lines" ────────────────────────────────
CREATE TABLE IF NOT EXISTS "app_quikinfra"."Muster_roll_lines" (
    "id"               TEXT NOT NULL,
    "musterRollId"     TEXT NOT NULL,
    "workmanId"        TEXT NOT NULL,
    "labourCategoryId" TEXT NOT NULL,
    "attendance"       DECIMAL(18,4) NOT NULL,
    "otHours"          DECIMAL(18,4),
    "wageRateApplied"  DECIMAL(18,2),
    "boqItemId"        TEXT,
    "remarks"          TEXT,
    CONSTRAINT "Muster_roll_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Muster_roll_lines_musterRollId_workmanId_key"
    ON "app_quikinfra"."Muster_roll_lines"("musterRollId", "workmanId");
CREATE INDEX IF NOT EXISTS "Muster_roll_lines_musterRollId_idx"
    ON "app_quikinfra"."Muster_roll_lines"("musterRollId");
CREATE INDEX IF NOT EXISTS "Muster_roll_lines_workmanId_idx"
    ON "app_quikinfra"."Muster_roll_lines"("workmanId");

DO $$ BEGIN
  ALTER TABLE "app_quikinfra"."Muster_roll_lines"
    ADD CONSTRAINT "Muster_roll_lines_musterRollId_fkey"
    FOREIGN KEY ("musterRollId") REFERENCES "app_quikinfra"."Muster_rolls"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

COMMIT;
