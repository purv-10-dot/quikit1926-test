-- Sales Cost Management module — app_quikcrm."CrmSalesRepSalary",
-- "CrmSalesTool", "CrmSalesToolAllocation", "CrmSalesOtherCost".
--
-- Idempotent (CREATE TABLE/INDEX IF NOT EXISTS) so it is safe to apply to the
-- shared DB by hand; the build pipeline does not run `migrate deploy`. Index
-- names match Prisma's generated names for @@unique / @@index so the client
-- stays in sync with the DB.
--
-- Design: every cost row is EFFECTIVE-DATED ("effectiveFrom" inclusive,
-- "effectiveTo" exclusive and nullable = still current). Nothing is ever edited
-- in place — raising a salary closes the current row and opens a new one — so a
-- report for a past month re-derives to the same number no matter what changed
-- since. That is why there is no snapshot table and no month-close step here.
--
-- Lead / prospect / opportunity / won-deal counts are deliberately NOT stored.
-- They are read live from "CrmLead"."ownerId", "CrmProspect"."savedById" and
-- "CrmOpportunity"."ownerId", so this module adds no second ownership system.
--
-- "userId" is plain text with no FK: User lives in schema `auth` and every
-- app_quikcrm table stores user ids as loose strings (see "CrmLead"."ownerId").
-- A denormalised "userName" travels with each row so a historical report still
-- renders a name after the user is removed from the org.
--
-- Range non-overlap per (orgId, userId) is enforced in the service layer, not
-- here: excluding overlapping [effectiveFrom, effectiveTo) ranges needs a
-- Postgres exclusion constraint over a range type, which Prisma cannot model,
-- and adding one only in SQL would drift from the schema. The unique indexes
-- below still block the exact-duplicate case.

-- Effective-dated monthly salary per sales rep.
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmSalesRepSalary" (
  id                text PRIMARY KEY,
  "orgId"           text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "userId"          text NOT NULL,
  "userName"        text,
  "monthlyAmount"   decimal(18,2) NOT NULL,
  currency          text NOT NULL DEFAULT 'INR',
  "effectiveFrom"   timestamp(3) NOT NULL,
  "effectiveTo"     timestamp(3),
  notes             text,
  "createdByUserId" text,
  "createdAt"       timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"       timestamp(3) NOT NULL
);

-- @@unique([orgId, userId, effectiveFrom]) — blocks two salary rows starting in
-- the same month for one rep, which is the only overlap case a unique index can
-- express (full range overlap is checked in the service).
CREATE UNIQUE INDEX IF NOT EXISTS "CrmSalesRepSalary_orgId_userId_effectiveFrom_key"
  ON app_quikcrm."CrmSalesRepSalary" ("orgId", "userId", "effectiveFrom");
-- @@index([orgId]) — org scoping.
CREATE INDEX IF NOT EXISTS "CrmSalesRepSalary_orgId_idx"
  ON app_quikcrm."CrmSalesRepSalary" ("orgId");
-- @@index([orgId, userId]) — "show me this rep's salary history".
CREATE INDEX IF NOT EXISTS "CrmSalesRepSalary_orgId_userId_idx"
  ON app_quikcrm."CrmSalesRepSalary" ("orgId", "userId");
-- @@index([orgId, userId, effectiveFrom]) — the per-rep period lookup.
CREATE INDEX IF NOT EXISTS "CrmSalesRepSalary_orgId_userId_effectiveFrom_idx"
  ON app_quikcrm."CrmSalesRepSalary" ("orgId", "userId", "effectiveFrom");
-- @@index([orgId, effectiveFrom, effectiveTo]) — the all-reps roll-up for one
-- period, which scans by range rather than by user.
CREATE INDEX IF NOT EXISTS "CrmSalesRepSalary_orgId_effectiveFrom_effectiveTo_idx"
  ON app_quikcrm."CrmSalesRepSalary" ("orgId", "effectiveFrom", "effectiveTo");

-- A paid sales tool. Holds the TOTAL cost; who pays is expressed only by its
-- allocation rows, which is what stops a shared tool being double-counted.
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmSalesTool" (
  id                 text PRIMARY KEY,
  "orgId"            text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  name               text NOT NULL,
  vendor             text,
  category           text,
  cost               decimal(18,2) NOT NULL,
  "billingFrequency" text NOT NULL DEFAULT 'monthly',
  currency           text NOT NULL DEFAULT 'INR',
  "startDate"        timestamp(3) NOT NULL,
  "endDate"          timestamp(3),
  active             boolean NOT NULL DEFAULT true,
  notes              text,
  "createdByUserId"  text,
  "createdAt"        timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"        timestamp(3) NOT NULL
);

-- @@unique([orgId, name]) — one tool per name per org, so the same subscription
-- cannot be entered twice and then allocated twice.
CREATE UNIQUE INDEX IF NOT EXISTS "CrmSalesTool_orgId_name_key"
  ON app_quikcrm."CrmSalesTool" ("orgId", "name");
-- @@index([orgId]) — org scoping.
CREATE INDEX IF NOT EXISTS "CrmSalesTool_orgId_idx"
  ON app_quikcrm."CrmSalesTool" ("orgId");
-- @@index([orgId, active]) — the tools list filters on active by default.
CREATE INDEX IF NOT EXISTS "CrmSalesTool_orgId_active_idx"
  ON app_quikcrm."CrmSalesTool" ("orgId", "active");
-- @@index([orgId, startDate, endDate]) — "which tools were live in this month".
CREATE INDEX IF NOT EXISTS "CrmSalesTool_orgId_startDate_endDate_idx"
  ON app_quikcrm."CrmSalesTool" ("orgId", "startDate", "endDate");

-- Share of one tool's cost carried by one rep over a date range. percentage is
-- decimal(6,3) so a three-way split (33.333) is exact and the "sums to <= 100"
-- check does not fail on float drift.
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmSalesToolAllocation" (
  id                text PRIMARY KEY,
  "orgId"           text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "toolId"          text NOT NULL REFERENCES app_quikcrm."CrmSalesTool"(id) ON DELETE CASCADE,
  "userId"          text NOT NULL,
  "userName"        text,
  percentage        decimal(6,3) NOT NULL,
  "effectiveFrom"   timestamp(3) NOT NULL,
  "effectiveTo"     timestamp(3),
  "createdByUserId" text,
  "createdAt"       timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"       timestamp(3) NOT NULL
);

-- @@unique([orgId, toolId, userId, effectiveFrom]) — one allocation per
-- (tool, rep) starting in a given month.
CREATE UNIQUE INDEX IF NOT EXISTS "CrmSalesToolAllocation_orgId_toolId_userId_effectiveFrom_key"
  ON app_quikcrm."CrmSalesToolAllocation" ("orgId", "toolId", "userId", "effectiveFrom");
-- @@index([orgId]) — org scoping.
CREATE INDEX IF NOT EXISTS "CrmSalesToolAllocation_orgId_idx"
  ON app_quikcrm."CrmSalesToolAllocation" ("orgId");
-- @@index([orgId, userId]) — the per-rep cost breakdown.
CREATE INDEX IF NOT EXISTS "CrmSalesToolAllocation_orgId_userId_idx"
  ON app_quikcrm."CrmSalesToolAllocation" ("orgId", "userId");
-- @@index([orgId, toolId]) — "who shares this tool", and the sums-to-100 check.
CREATE INDEX IF NOT EXISTS "CrmSalesToolAllocation_orgId_toolId_idx"
  ON app_quikcrm."CrmSalesToolAllocation" ("orgId", "toolId");
-- @@index([orgId, userId, effectiveFrom, effectiveTo]) — the hot path: this
-- rep's allocations overlapping the selected period.
CREATE INDEX IF NOT EXISTS "CrmSalesToolAllocation_orgId_userId_effectiveFrom_effectiveTo_idx"
  ON app_quikcrm."CrmSalesToolAllocation" ("orgId", "userId", "effectiveFrom", "effectiveTo");

-- Recurring sales cost that is neither salary nor a tool (travel, lead lists,
-- incentive pool). Entered as a monthly figure by design, hence no
-- billingFrequency column.
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmSalesOtherCost" (
  id                text PRIMARY KEY,
  "orgId"           text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "userId"          text NOT NULL,
  "userName"        text,
  label             text NOT NULL,
  "monthlyAmount"   decimal(18,2) NOT NULL,
  currency          text NOT NULL DEFAULT 'INR',
  "effectiveFrom"   timestamp(3) NOT NULL,
  "effectiveTo"     timestamp(3),
  active            boolean NOT NULL DEFAULT true,
  notes             text,
  "createdByUserId" text,
  "createdAt"       timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"       timestamp(3) NOT NULL
);

-- @@index([orgId]) — org scoping.
CREATE INDEX IF NOT EXISTS "CrmSalesOtherCost_orgId_idx"
  ON app_quikcrm."CrmSalesOtherCost" ("orgId");
-- @@index([orgId, userId]) — the per-rep cost breakdown.
CREATE INDEX IF NOT EXISTS "CrmSalesOtherCost_orgId_userId_idx"
  ON app_quikcrm."CrmSalesOtherCost" ("orgId", "userId");
-- @@index([orgId, userId, effectiveFrom, effectiveTo]) — period overlap lookup.
CREATE INDEX IF NOT EXISTS "CrmSalesOtherCost_orgId_userId_effectiveFrom_effectiveTo_idx"
  ON app_quikcrm."CrmSalesOtherCost" ("orgId", "userId", "effectiveFrom", "effectiveTo");
-- @@index([orgId, active]) — the "other costs" list filters on active.
CREATE INDEX IF NOT EXISTS "CrmSalesOtherCost_orgId_active_idx"
  ON app_quikcrm."CrmSalesOtherCost" ("orgId", "active");
