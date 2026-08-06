-- CreateEnum
CREATE TYPE "app_quikcrm"."CrmAccountSegment" AS ENUM ('Enterprise', 'MidMarket', 'SMB');

-- AlterTable: Phase 1 + Phase 2 columns on CrmAccount
ALTER TABLE "app_quikcrm"."CrmAccount"
  ADD COLUMN "ownerName"             TEXT,
  ADD COLUMN "annualRevenueAmount"   DECIMAL(18,2),
  ADD COLUMN "annualRevenueCurrency" TEXT DEFAULT 'INR',
  ADD COLUMN "segmentEnum"           "app_quikcrm"."CrmAccountSegment",
  ADD COLUMN "industryKey"           TEXT,
  ADD COLUMN "countryCode"           TEXT,
  ADD COLUMN "state"                 TEXT,
  ADD COLUMN "postalCode"            TEXT,
  ADD COLUMN "parentAccountId"       TEXT,
  ADD COLUMN "healthScore"           INTEGER,
  ADD COLUMN "contractStart"         TIMESTAMP(3),
  ADD COLUMN "contractEnd"           TIMESTAMP(3),
  ADD COLUMN "renewalDate"           TIMESTAMP(3),
  ADD COLUMN "npsScore"              INTEGER,
  ADD COLUMN "deletedAt"             TIMESTAMP(3),
  ADD COLUMN "createdByUserId"       TEXT;

-- Phase 1: status defaults to 'Active' for newly created rows
ALTER TABLE "app_quikcrm"."CrmAccount"
  ALTER COLUMN "status" SET DEFAULT 'Active';

-- Backfill: rows missing status get the new default.
UPDATE "app_quikcrm"."CrmAccount" SET "status" = 'Active' WHERE "status" IS NULL OR "status" = '';

-- Self-referencing FK for parent/child hierarchy
ALTER TABLE "app_quikcrm"."CrmAccount"
  ADD CONSTRAINT "CrmAccount_parentAccountId_fkey"
  FOREIGN KEY ("parentAccountId") REFERENCES "app_quikcrm"."CrmAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "CrmAccount_tenantId_status_idx"          ON "app_quikcrm"."CrmAccount"("tenantId", "status");
CREATE INDEX "CrmAccount_tenantId_deletedAt_idx"       ON "app_quikcrm"."CrmAccount"("tenantId", "deletedAt");
CREATE INDEX "CrmAccount_tenantId_parentAccountId_idx" ON "app_quikcrm"."CrmAccount"("tenantId", "parentAccountId");
CREATE INDEX "CrmAccount_tenantId_industryKey_idx"     ON "app_quikcrm"."CrmAccount"("tenantId", "industryKey");
CREATE INDEX "CrmAccount_tenantId_segmentEnum_idx"     ON "app_quikcrm"."CrmAccount"("tenantId", "segmentEnum");

-- Phase 2.1 backfill: parse annualRevenueDisplay into amount + currency
-- Patterns recognised (case-insensitive, signs and commas tolerated):
--   "₹2.1Cr ARR"  → amount = 2.1 * 1e7 = 21_000_000      currency INR
--   "₹58L ARR"    → amount = 58  * 1e5 = 5_800_000        currency INR
--   "$21.0M ARR"  → amount = 21.0 * 1e6 = 21_000_000      currency USD
--   "$3.5B"       → amount = 3.5  * 1e9 = 3_500_000_000   currency USD
--   "€500K"       → amount = 500  * 1e3 = 500_000         currency EUR
--   "£2.4M"       → amount = 2.4  * 1e6 = 2_400_000       currency GBP
-- Leaves NULL when the string doesn't match (intentional best-effort).

WITH parsed AS (
  SELECT
    a.id,
    LOWER(SUBSTRING(a."annualRevenueDisplay" FROM '([₹$€£])')) AS sym,
    SUBSTRING(a."annualRevenueDisplay" FROM '([0-9]+(?:\.[0-9]+)?)\s*([KkLlMmCcBb][Rr]?)')        AS amt_match,
    SUBSTRING(a."annualRevenueDisplay" FROM '[0-9]+(?:\.[0-9]+)?\s*([KkLlMmCcBb][Rr]?)')          AS unit_raw,
    SUBSTRING(a."annualRevenueDisplay" FROM '([0-9]+(?:\.[0-9]+)?)\s*[KkLlMmCcBb][Rr]?')          AS num_raw
  FROM "app_quikcrm"."CrmAccount" a
  WHERE a."annualRevenueDisplay" IS NOT NULL
    AND a."annualRevenueDisplay" <> ''
    AND a."annualRevenueAmount" IS NULL
)
UPDATE "app_quikcrm"."CrmAccount" c
SET
  "annualRevenueCurrency" = COALESCE(
    CASE p.sym
      WHEN '₹' THEN 'INR'
      WHEN '$' THEN 'USD'
      WHEN '€' THEN 'EUR'
      WHEN '£' THEN 'GBP'
      ELSE NULL
    END,
    c."annualRevenueCurrency",
    'INR'
  ),
  "annualRevenueAmount" = (p.num_raw)::numeric * (
    CASE LOWER(p.unit_raw)
      WHEN 'k'  THEN 1000
      WHEN 'l'  THEN 100000
      WHEN 'lr' THEN 100000
      WHEN 'm'  THEN 1000000
      WHEN 'cr' THEN 10000000
      WHEN 'c'  THEN 10000000
      WHEN 'b'  THEN 1000000000
      ELSE 1
    END
  )
FROM parsed p
WHERE c.id = p.id
  AND p.num_raw IS NOT NULL
  AND p.unit_raw IS NOT NULL;
