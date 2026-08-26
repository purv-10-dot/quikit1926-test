-- Sales Cost — version tool prices: app_quikcrm."CrmSalesToolPrice".
--
-- Moves price off CrmSalesTool into an effective-dated child table, mirroring
-- CrmSalesRepSalary. Before this, editing a tool's cost rewrote every month the
-- tool covered; now a price change closes the open version and opens a new one,
-- so August keeps reading ₹8,000 after September becomes ₹10,000.
--
-- Idempotent (CREATE ... IF NOT EXISTS, plus guarded backfill/DROP) so it is
-- safe to apply to the shared DB by hand; the build pipeline does not run
-- `migrate deploy`. Index names match Prisma's generated names for @@unique /
-- @@index so the client stays in sync with the DB.
--
-- This migration is separate from 20260812120000_quikcrm_sales_cost_module
-- rather than an edit to it, because that migration has already been applied to
-- live databases. Editing an applied migration would leave those DBs with a
-- checksum mismatch and no path to the new shape.

-- Effective-dated price versions for a tool. billingFrequency and currency live
-- here, not on the tool: switching a seat from monthly to annual billing is a
-- price change, and past months must keep their original basis.
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmSalesToolPrice" (
  id                 text PRIMARY KEY,
  "orgId"            text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "toolId"           text NOT NULL REFERENCES app_quikcrm."CrmSalesTool"(id) ON DELETE CASCADE,
  cost               decimal(18,2) NOT NULL,
  "billingFrequency" text NOT NULL DEFAULT 'monthly',
  currency           text NOT NULL DEFAULT 'INR',
  "effectiveFrom"    timestamp(3) NOT NULL,
  "effectiveTo"      timestamp(3),
  notes              text,
  "createdByUserId"  text,
  "createdAt"        timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"        timestamp(3) NOT NULL
);

-- @@unique([orgId, toolId, effectiveFrom]) — one price version per tool per
-- starting month; full range non-overlap is enforced in the service.
CREATE UNIQUE INDEX IF NOT EXISTS "CrmSalesToolPrice_orgId_toolId_effectiveFrom_key"
  ON app_quikcrm."CrmSalesToolPrice" ("orgId", "toolId", "effectiveFrom");
-- @@index([orgId]) — org scoping.
CREATE INDEX IF NOT EXISTS "CrmSalesToolPrice_orgId_idx"
  ON app_quikcrm."CrmSalesToolPrice" ("orgId");
-- @@index([orgId, toolId]) — a tool's price history.
CREATE INDEX IF NOT EXISTS "CrmSalesToolPrice_orgId_toolId_idx"
  ON app_quikcrm."CrmSalesToolPrice" ("orgId", "toolId");
-- @@index([orgId, toolId, effectiveFrom, effectiveTo]) — the hot path: resolve
-- the version in force for a period.
CREATE INDEX IF NOT EXISTS "CrmSalesToolPrice_orgId_toolId_effectiveFrom_effectiveTo_idx"
  ON app_quikcrm."CrmSalesToolPrice" ("orgId", "toolId", "effectiveFrom", "effectiveTo");

-- Backfill: every existing tool becomes one open-ended price version carrying
-- its current cost, effective from the tool's own startDate. That is the only
-- reading consistent with what those tools have been billing so far, so already
-- computed months keep the same numbers after this migration.
--
-- Guarded on the old column still existing (so a re-run after the DROP below is
-- a no-op) and on NOT EXISTS (so a partial run does not duplicate versions).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app_quikcrm'
      AND table_name   = 'CrmSalesTool'
      AND column_name  = 'cost'
  ) THEN
    INSERT INTO app_quikcrm."CrmSalesToolPrice" (
      id, "orgId", "toolId", cost, "billingFrequency", currency,
      "effectiveFrom", "effectiveTo", notes, "createdByUserId",
      "createdAt", "updatedAt"
    )
    SELECT
      -- gen_random_uuid() is available from pgcrypto/PG13+. These ids are only
      -- ever read back by Prisma, which does not require cuid format.
      gen_random_uuid()::text,
      t."orgId",
      t.id,
      t.cost,
      t."billingFrequency",
      t.currency,
      t."startDate",
      NULL,
      'Backfilled from the tool''s original price on price versioning.',
      t."createdByUserId",
      now(),
      now()
    FROM app_quikcrm."CrmSalesTool" t
    WHERE NOT EXISTS (
      SELECT 1 FROM app_quikcrm."CrmSalesToolPrice" p WHERE p."toolId" = t.id
    );
  END IF;
END $$;

-- Drop the now-superseded columns. Done only after the backfill above, so no
-- price data is lost. IF EXISTS keeps the whole migration re-runnable.
ALTER TABLE app_quikcrm."CrmSalesTool" DROP COLUMN IF EXISTS cost;
ALTER TABLE app_quikcrm."CrmSalesTool" DROP COLUMN IF EXISTS "billingFrequency";
ALTER TABLE app_quikcrm."CrmSalesTool" DROP COLUMN IF EXISTS currency;
