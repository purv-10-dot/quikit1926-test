-- =============================================================================
-- QuikCRM — Recent schema changes, consolidated
-- =============================================================================
-- Continues packages/database/prisma/manual-migrations/quikcrm_all_schema_changes.sql,
-- which stops at 20260803120000_quikcrm_activity_type_targets.
--
-- Every statement is idempotent (IF NOT EXISTS / DO-block enum guards), applied
-- in chronological, dependency-safe order. Safe to re-run.
--
-- Source migrations (packages/database/prisma/migrations/):
--   1. 20260806120000_quikcrm_icp_module
--   2. 20260806140000_quikcrm_prospect_lead_icp
--   3. 20260810120000_quikcrm_prospect_company_fields
--   4. 20260812000000_quikcrm_upwork_module
--   5. 20260812120000_quikcrm_sales_cost_module
--   6. 20260812130000_quikcrm_upwork_prospect_link
--   7. 20260812140000_quikcrm_sales_tool_price_versioning
--   8. 20260813000000_quikcrm_prospect_linkedin_conversation
--   9. 20260813120000_quikcrm_prospect_email_discovery
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. 20260806120000_quikcrm_icp_module
-- =============================================================================
-- ICP (Ideal Customer Profile) module — app_quikcrm.
--
-- Idempotent (CREATE TABLE/INDEX/TYPE IF NOT EXISTS) so it is safe to apply to
-- the shared DB by hand; the build pipeline does not run `migrate deploy`. Index
-- names match Prisma's generated names for @@unique / @@index so the client
-- stays in sync with the DB.
--
-- Reuses existing masters rather than duplicating them:
--   * products AND services  -> app_quikcrm."CrmProduct" (a service is
--                               productType = 'Service'; no CrmService table)
--   * companies              -> app_quikcrm."CrmAccount"
-- Only the three dimensions with no prior master (Industry / Vertical /
-- Technology) get a new table, and they share one polymorphic table keyed by
-- `kind`, following the existing CrmProductTaxonomy precedent.

-- ── Enum ─────────────────────────────────────────────────────────────────────
-- CREATE TYPE has no IF NOT EXISTS in Postgres; guard with a DO block.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'CrmIcpTaxonomyKind' AND n.nspname = 'app_quikcrm'
  ) THEN
    CREATE TYPE app_quikcrm."CrmIcpTaxonomyKind" AS ENUM ('Industry', 'Vertical', 'Technology');
  END IF;
END
$$;

-- ── CrmIcpProfile ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmIcpProfile" (
  id                 text PRIMARY KEY,
  "orgId"            text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  name               text NOT NULL,
  description        text,
  "personaNotes"     text,
  segment            app_quikcrm."CrmAccountSegment",
  "employeeCountMin" integer,
  "employeeCountMax" integer,
  "annualRevenueMin" numeric(18, 2),
  "annualRevenueMax" numeric(18, 2),
  "revenueCurrency"  text DEFAULT 'INR',
  "countryCodes"     text[] NOT NULL DEFAULT ARRAY[]::text[],
  regions            text[] NOT NULL DEFAULT ARRAY[]::text[],
  "isActive"         boolean NOT NULL DEFAULT true,
  "deletedAt"        timestamp(3),
  "createdByUserId"  text,
  "updatedByUserId"  text,
  "createdAt"        timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"        timestamp(3) NOT NULL
);

-- @@unique([orgId, name]) — one ICP name per org.
CREATE UNIQUE INDEX IF NOT EXISTS "CrmIcpProfile_orgId_name_key"
  ON app_quikcrm."CrmIcpProfile" ("orgId", name);
-- @@index([orgId]) — org scoping.
CREATE INDEX IF NOT EXISTS "CrmIcpProfile_orgId_idx"
  ON app_quikcrm."CrmIcpProfile" ("orgId");
-- @@index([orgId, deletedAt]) — active-vs-trash list queries.
CREATE INDEX IF NOT EXISTS "CrmIcpProfile_orgId_deletedAt_idx"
  ON app_quikcrm."CrmIcpProfile" ("orgId", "deletedAt");
-- @@index([orgId, isActive]) — status filter.
CREATE INDEX IF NOT EXISTS "CrmIcpProfile_orgId_isActive_idx"
  ON app_quikcrm."CrmIcpProfile" ("orgId", "isActive");
-- @@index([orgId, segment]) — segment filter.
CREATE INDEX IF NOT EXISTS "CrmIcpProfile_orgId_segment_idx"
  ON app_quikcrm."CrmIcpProfile" ("orgId", segment);

-- ── CrmIcpTaxonomy ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmIcpTaxonomy" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  kind        app_quikcrm."CrmIcpTaxonomyKind" NOT NULL,
  name        text NOT NULL,
  code        text,
  "parentId"  text REFERENCES app_quikcrm."CrmIcpTaxonomy"(id) ON DELETE SET NULL,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "isActive"  boolean NOT NULL DEFAULT true,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL
);

-- @@unique([orgId, kind, name, parentId]) — no duplicate sibling names per kind.
CREATE UNIQUE INDEX IF NOT EXISTS "CrmIcpTaxonomy_orgId_kind_name_parentId_key"
  ON app_quikcrm."CrmIcpTaxonomy" ("orgId", kind, name, "parentId");
CREATE INDEX IF NOT EXISTS "CrmIcpTaxonomy_orgId_idx"
  ON app_quikcrm."CrmIcpTaxonomy" ("orgId");
CREATE INDEX IF NOT EXISTS "CrmIcpTaxonomy_orgId_kind_idx"
  ON app_quikcrm."CrmIcpTaxonomy" ("orgId", kind);
CREATE INDEX IF NOT EXISTS "CrmIcpTaxonomy_orgId_kind_isActive_idx"
  ON app_quikcrm."CrmIcpTaxonomy" ("orgId", kind, "isActive");
CREATE INDEX IF NOT EXISTS "CrmIcpTaxonomy_orgId_parentId_idx"
  ON app_quikcrm."CrmIcpTaxonomy" ("orgId", "parentId");

-- Root-level uniqueness. The @@unique above includes "parentId", and in Postgres
-- NULL != NULL — so it does NOT constrain top-level entries (parentId IS NULL),
-- which is the common case for a flat industry/technology list. Without this
-- partial index two identical root entries insert cleanly and the API's P2002
-- duplicate handling never fires.
--
-- Prisma cannot express a partial unique index, so it lives only here; the
-- taxonomy service also does a pre-insert existence check to return a friendly
-- 409 rather than relying on the DB error alone.
CREATE UNIQUE INDEX IF NOT EXISTS "CrmIcpTaxonomy_orgId_kind_name_root_key"
  ON app_quikcrm."CrmIcpTaxonomy" ("orgId", kind, name)
  WHERE "parentId" IS NULL;

-- ── CrmIcpProfileTaxonomy (ICP <-> industry/vertical/technology) ──────────────
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmIcpProfileTaxonomy" (
  id             text PRIMARY KEY,
  "orgId"        text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "icpProfileId" text NOT NULL REFERENCES app_quikcrm."CrmIcpProfile"(id) ON DELETE CASCADE,
  "taxonomyId"   text NOT NULL REFERENCES app_quikcrm."CrmIcpTaxonomy"(id) ON DELETE CASCADE,
  kind           app_quikcrm."CrmIcpTaxonomyKind" NOT NULL,
  "createdAt"    timestamp(3) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmIcpProfileTaxonomy_orgId_icpProfileId_taxonomyId_key"
  ON app_quikcrm."CrmIcpProfileTaxonomy" ("orgId", "icpProfileId", "taxonomyId");
CREATE INDEX IF NOT EXISTS "CrmIcpProfileTaxonomy_orgId_idx"
  ON app_quikcrm."CrmIcpProfileTaxonomy" ("orgId");
CREATE INDEX IF NOT EXISTS "CrmIcpProfileTaxonomy_orgId_icpProfileId_idx"
  ON app_quikcrm."CrmIcpProfileTaxonomy" ("orgId", "icpProfileId");
CREATE INDEX IF NOT EXISTS "CrmIcpProfileTaxonomy_orgId_icpProfileId_kind_idx"
  ON app_quikcrm."CrmIcpProfileTaxonomy" ("orgId", "icpProfileId", kind);
CREATE INDEX IF NOT EXISTS "CrmIcpProfileTaxonomy_taxonomyId_idx"
  ON app_quikcrm."CrmIcpProfileTaxonomy" ("taxonomyId");

-- ── CrmIcpProfileProduct (ICP <-> product/service) ───────────────────────────
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmIcpProfileProduct" (
  id             text PRIMARY KEY,
  "orgId"        text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "icpProfileId" text NOT NULL REFERENCES app_quikcrm."CrmIcpProfile"(id) ON DELETE CASCADE,
  "productId"    text NOT NULL REFERENCES app_quikcrm."CrmProduct"(id) ON DELETE CASCADE,
  "createdAt"    timestamp(3) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmIcpProfileProduct_orgId_icpProfileId_productId_key"
  ON app_quikcrm."CrmIcpProfileProduct" ("orgId", "icpProfileId", "productId");
CREATE INDEX IF NOT EXISTS "CrmIcpProfileProduct_orgId_idx"
  ON app_quikcrm."CrmIcpProfileProduct" ("orgId");
CREATE INDEX IF NOT EXISTS "CrmIcpProfileProduct_orgId_icpProfileId_idx"
  ON app_quikcrm."CrmIcpProfileProduct" ("orgId", "icpProfileId");
CREATE INDEX IF NOT EXISTS "CrmIcpProfileProduct_productId_idx"
  ON app_quikcrm."CrmIcpProfileProduct" ("productId");

-- ── CrmIcpProfileAccount (ICP <-> example company) ───────────────────────────
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmIcpProfileAccount" (
  id             text PRIMARY KEY,
  "orgId"        text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "icpProfileId" text NOT NULL REFERENCES app_quikcrm."CrmIcpProfile"(id) ON DELETE CASCADE,
  "accountId"    text NOT NULL REFERENCES app_quikcrm."CrmAccount"(id) ON DELETE CASCADE,
  note           text,
  "createdAt"    timestamp(3) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmIcpProfileAccount_orgId_icpProfileId_accountId_key"
  ON app_quikcrm."CrmIcpProfileAccount" ("orgId", "icpProfileId", "accountId");
CREATE INDEX IF NOT EXISTS "CrmIcpProfileAccount_orgId_idx"
  ON app_quikcrm."CrmIcpProfileAccount" ("orgId");
CREATE INDEX IF NOT EXISTS "CrmIcpProfileAccount_orgId_icpProfileId_idx"
  ON app_quikcrm."CrmIcpProfileAccount" ("orgId", "icpProfileId");
CREATE INDEX IF NOT EXISTS "CrmIcpProfileAccount_accountId_idx"
  ON app_quikcrm."CrmIcpProfileAccount" ("accountId");


-- =============================================================================
-- 2. 20260806140000_quikcrm_prospect_lead_icp
-- =============================================================================
-- ICP reference on prospects and leads — app_quikcrm.
--
-- Adds CrmProspect."icpId" and CrmLead."icpId": the ICP selected in the LinkedIn
-- extension before saving a prospect, carried through to the lead on
-- Convert-to-Lead. Reference ONLY — no ICP fields are copied.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS, FK guarded
-- by a catalog check) so it is safe to apply to the shared DB by hand; the build
-- pipeline does not run `migrate deploy`. Index names match Prisma's generated
-- names for @@index so the client stays in sync with the DB.
--
-- Backward compatible: both columns are NULLABLE with no default, so every
-- existing prospect and lead remains valid and untouched. ON DELETE SET NULL
-- means removing an ICP clears the reference instead of deleting the record.

-- ── CrmProspect.icpId ────────────────────────────────────────────────────────
ALTER TABLE app_quikcrm."CrmProspect"
  ADD COLUMN IF NOT EXISTS "icpId" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'app_quikcrm'
      AND constraint_name = 'CrmProspect_icpId_fkey'
  ) THEN
    ALTER TABLE app_quikcrm."CrmProspect"
      ADD CONSTRAINT "CrmProspect_icpId_fkey"
      FOREIGN KEY ("icpId") REFERENCES app_quikcrm."CrmIcpProfile"(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- @@index([orgId, icpId]) — "prospects for this ICP" lookups + the Prospects list.
CREATE INDEX IF NOT EXISTS "CrmProspect_orgId_icpId_idx"
  ON app_quikcrm."CrmProspect" ("orgId", "icpId");

-- ── CrmLead.icpId ────────────────────────────────────────────────────────────
ALTER TABLE app_quikcrm."CrmLead"
  ADD COLUMN IF NOT EXISTS "icpId" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'app_quikcrm'
      AND constraint_name = 'CrmLead_icpId_fkey'
  ) THEN
    ALTER TABLE app_quikcrm."CrmLead"
      ADD CONSTRAINT "CrmLead_icpId_fkey"
      FOREIGN KEY ("icpId") REFERENCES app_quikcrm."CrmIcpProfile"(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- @@index([orgId, icpId]) — "leads for this ICP" lookups.
CREATE INDEX IF NOT EXISTS "CrmLead_orgId_icpId_idx"
  ON app_quikcrm."CrmLead" ("orgId", "icpId");


-- =============================================================================
-- 3. 20260810120000_quikcrm_prospect_company_fields
-- =============================================================================
-- Promoted company fields on prospects — app_quikcrm.
--
-- The LinkedIn extension's company scraper already stores its full result in
-- CrmProspect."companyData" (jsonb). These columns denormalise the FILTERABLE
-- subset out of that blob so it can be queried, grouped and indexed in SQL —
-- e.g. "prospects at 1,000+ employee software companies in Washington" becomes
-- a real query instead of a JSON scan.
--
-- "companyData" remains the complete record. These columns are a PROJECTION of
-- it, never a replacement, so nothing is lost and the blob stays the source of
-- truth. Long-form / binary-ish content (about, tagline, specialties, logo,
-- banner, posts) is deliberately NOT promoted: widening the table for text
-- nobody filters on buys nothing.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS) so it is
-- safe to apply to the shared DB by hand; the build pipeline does not run
-- `migrate deploy`. Index names match Prisma's generated names for @@index so
-- the client stays in sync with the DB.
--
-- Backward compatible: every column is NULLABLE with no default, so all
-- existing prospects remain valid and no backfill is required. Prospects saved
-- from a profile page (without visiting the company page) simply leave these
-- null, and the API omits absent fields on update rather than nulling them.

-- ── Columns ─────────────────────────────────────────────────────────────────
ALTER TABLE app_quikcrm."CrmProspect"
  ADD COLUMN IF NOT EXISTS "companyIndustry" text;

ALTER TABLE app_quikcrm."CrmProspect"
  ADD COLUMN IF NOT EXISTS "companyWebsite" text;

ALTER TABLE app_quikcrm."CrmProspect"
  ADD COLUMN IF NOT EXISTS "companyHeadquarters" text;

-- Human-readable band exactly as LinkedIn presents it, e.g. "11-50 employees".
ALTER TABLE app_quikcrm."CrmProspect"
  ADD COLUMN IF NOT EXISTS "companySize" text;

-- Numeric headcount when LinkedIn exposes an exact figure. integer (not text)
-- so range queries work; NULL when only the banded string above is available
-- (LinkedIn renders "10K+ employees" for large companies, which has no exact
-- value to store).
ALTER TABLE app_quikcrm."CrmProspect"
  ADD COLUMN IF NOT EXISTS "companyEmployeeCount" integer;

-- Canonical /company/<slug>/ URL, for grouping prospects by employer.
ALTER TABLE app_quikcrm."CrmProspect"
  ADD COLUMN IF NOT EXISTS "companyLinkedinUrl" text;

-- ── Indexes ─────────────────────────────────────────────────────────────────
-- Org-scoped, matching every other index on this table: these support
-- "prospects in this industry / at this employer" filters, which are always
-- tenant-scoped. The remaining promoted columns are display/detail fields and
-- are deliberately left unindexed.
CREATE INDEX IF NOT EXISTS "CrmProspect_orgId_companyIndustry_idx"
  ON app_quikcrm."CrmProspect" ("orgId", "companyIndustry");

CREATE INDEX IF NOT EXISTS "CrmProspect_orgId_companyLinkedinUrl_idx"
  ON app_quikcrm."CrmProspect" ("orgId", "companyLinkedinUrl");


-- =============================================================================
-- 4. 20260812000000_quikcrm_upwork_module
-- =============================================================================
-- Upwork module — app_quikcrm."CrmUpworkJob".
--
-- Idempotent (CREATE TABLE/INDEX IF NOT EXISTS) so it is safe to apply to the
-- shared DB by hand; the build pipeline does not run `migrate deploy`. Index
-- names match Prisma's generated names for @@unique / @@index so the client
-- stays in sync with the DB.
--
-- Standalone by design: no FK to CrmLead / CrmProspect / CrmAccount /
-- CrmContact / CrmOpportunity. An Upwork job is a market signal, not a party we
-- have a relationship with. Nothing here auto-converts a row into those
-- entities.
--
-- Scraped values are stored as free text exactly as Upwork rendered them
-- ("$25.00 Hourly", "20 to 50"). Upwork publishes no stable schema for these and
-- the raw strings are what a human reads when triaging.

CREATE TABLE IF NOT EXISTS app_quikcrm."CrmUpworkJob" (
  id                 text PRIMARY KEY,
  "orgId"            text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "jobUrl"           text,
  "upworkJobId"      text,
  "dedupeKey"        text NOT NULL,
  "jobTitle"         text NOT NULL,
  "jobDescription"   text,
  "projectType"      text,
  skills             text,
  "clientLocation"   text,
  proposals          text,
  reviews            text,
  "projectPrice"     text,
  "projectTime"      text,
  "requiredConnects" text,
  "rawData"          jsonb,
  -- Output of the existing Upwork AI chain, written by a follow-up PATCH after
  -- the row exists. All nullable: the AI step is optional and skippable.
  "aiAnalysis"       jsonb,
  "aiScore"          integer,
  "aiConfidence"     text,
  "clientMessage"    text,
  "aiAnalyzedAt"     timestamp(3),
  "createdByUserId"  text,
  "updatedByUserId"  text,
  "deletedAt"        timestamp(3),
  "createdAt"        timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"        timestamp(3) NOT NULL
);

-- @@unique([orgId, dedupeKey]) — THE duplicate guard. This constraint, not the
-- service-layer pre-check, is what holds under two concurrent "Add to CRM"
-- clicks for the same job.
CREATE UNIQUE INDEX IF NOT EXISTS "CrmUpworkJob_orgId_dedupeKey_key"
  ON app_quikcrm."CrmUpworkJob" ("orgId", "dedupeKey");
-- @@index([orgId]) — org scoping.
CREATE INDEX IF NOT EXISTS "CrmUpworkJob_orgId_idx"
  ON app_quikcrm."CrmUpworkJob" ("orgId");
-- @@index([orgId, deletedAt]) — active-vs-trash list queries.
CREATE INDEX IF NOT EXISTS "CrmUpworkJob_orgId_deletedAt_idx"
  ON app_quikcrm."CrmUpworkJob" ("orgId", "deletedAt");
-- @@index([orgId, createdByUserId]) — owner-scoped list for non-admin users.
CREATE INDEX IF NOT EXISTS "CrmUpworkJob_orgId_createdByUserId_idx"
  ON app_quikcrm."CrmUpworkJob" ("orgId", "createdByUserId");
-- @@index([orgId, createdAt]) — default newest-first ordering.
CREATE INDEX IF NOT EXISTS "CrmUpworkJob_orgId_createdAt_idx"
  ON app_quikcrm."CrmUpworkJob" ("orgId", "createdAt");


-- =============================================================================
-- 5. 20260812120000_quikcrm_sales_cost_module
-- =============================================================================
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


-- =============================================================================
-- 6. 20260812130000_quikcrm_upwork_prospect_link
-- =============================================================================
-- Upwork → Prospect conversion link.
--
-- Idempotent (IF NOT EXISTS / guarded DO blocks) so it is safe to apply to the
-- shared DB by hand; the build pipeline does not run `migrate deploy`.
--
-- A REFERENCE ONLY. The Upwork job keeps every one of its own fields; nothing
-- is copied into CrmProspect and nothing is deleted on conversion. Adding a
-- nullable column plus a NULLS-distinct unique index is why this needs no
-- backfill: every existing prospect stays valid with upworkJobId = NULL.

-- Reference from the prospect back to the originating Upwork job.
ALTER TABLE app_quikcrm."CrmProspect"
  ADD COLUMN IF NOT EXISTS "upworkJobId" text;

-- SetNull, not Cascade: deleting an Upwork job must never delete a prospect the
-- user has since worked on — it only clears the back-reference.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'CrmProspect_upworkJobId_fkey'
      AND conrelid = 'app_quikcrm."CrmProspect"'::regclass
  ) THEN
    ALTER TABLE app_quikcrm."CrmProspect"
      ADD CONSTRAINT "CrmProspect_upworkJobId_fkey"
      FOREIGN KEY ("upworkJobId")
      REFERENCES app_quikcrm."CrmUpworkJob"(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- @@unique([orgId, upworkJobId]) — THE duplicate-conversion guard. The API
-- pre-checks for a friendly message; this constraint is what holds under two
-- concurrent "Convert to Prospect" clicks. Postgres treats NULLs as distinct,
-- so prospects with no Upwork origin are unaffected by it.
CREATE UNIQUE INDEX IF NOT EXISTS "CrmProspect_orgId_upworkJobId_key"
  ON app_quikcrm."CrmProspect" ("orgId", "upworkJobId");

-- Lookup support for "which prospect came from this job".
CREATE INDEX IF NOT EXISTS "CrmProspect_upworkJobId_idx"
  ON app_quikcrm."CrmProspect" ("upworkJobId");


-- =============================================================================
-- 7. 20260812140000_quikcrm_sales_tool_price_versioning
-- =============================================================================
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


-- =============================================================================
-- 8. 20260813000000_quikcrm_prospect_linkedin_conversation
-- =============================================================================
-- LinkedIn conversation capture on CrmProspect.
--
-- Idempotent (IF NOT EXISTS) so it is safe to apply to the shared DB by hand;
-- the build pipeline does not run `migrate deploy`.
--
-- A single additive, nullable JSONB column. No backfill is needed: every
-- existing prospect stays valid with linkedinConversation = NULL, which the UI
-- renders as "no conversation" rather than a misleading zero count.
--
-- Stores the complete message thread captured by the extension's conversation
-- extractor, in the same opaque-JSON pattern already used by `posts`,
-- `companyData` and `experiences` on this table. Shape:
--
--   { participant: { name, profileUrl }, threadId, capturedAt, messageCount,
--     messages: [ { messageId, senderName, senderProfileUrl, receiverName,
--                   text, timestamp, date, time, direction, messageOrder,
--                   source, attachments[] } ] }
--
-- `messageOrder` is the authoritative chronological key. Messages are NEVER
-- deduplicated: a thread legitimately repeats identical text from different
-- senders ("Well", "No problem"), so identical entries are distinct messages
-- separated only by their order.
--
-- No columns are promoted out of this blob and no index is added: unlike
-- `companyData`, nothing in a chat thread is filtered on, so widening the table
-- or indexing the JSON would buy nothing.
ALTER TABLE app_quikcrm."CrmProspect"
  ADD COLUMN IF NOT EXISTS "linkedinConversation" jsonb;


-- =============================================================================
-- 9. 20260813120000_quikcrm_prospect_email_discovery
-- =============================================================================
-- Prospect email discovery.
--
-- Idempotent (IF NOT EXISTS) so it is safe to apply to the shared DB by hand;
-- the build pipeline does not run `migrate deploy`. Matches the convention of
-- 20260813000000_quikcrm_prospect_linkedin_conversation.
--
-- PURELY ADDITIVE. Two new tables, no change to any existing column, so every
-- existing row stays valid and no backfill is required. A prospect with no
-- discovery row simply means the cascade has never been run for it.
--
-- ── Why a separate table rather than columns on CrmProspect ────────────────
-- A discovered address is not the same thing as a known address.
-- CrmProspect.email is what the CRM will actually mail; CrmProspectEmailDiscovery
-- is the audit trail of how (and how confidently) a value was arrived at, plus
-- the holding pen for suggestions too weak to promote. Only high-confidence
-- provider hits (Hunter/Apollo at >= 0.8) are copied onto the prospect — see
-- lib/services/prospects/email-discovery/cascade.ts::shouldPromote.
--
-- Most prospects arrive with an email already, so these columns would be mostly
-- NULL if widened onto CrmProspect.

-- ── One discovery result per prospect ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "app_quikcrm"."CrmProspectEmailDiscovery" (
    "id"         TEXT NOT NULL,
    "orgId"      TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    -- verified | guessed | not_found | domain_not_found | company_invalid
    -- NOTE: "verified" means a data provider returned the address with a score
    -- above threshold, NOT that mail was ever delivered to it. There is no SMTP
    -- verification in the cascade (Vercel blocks outbound port 25), so no
    -- stronger claim is available.
    "status"     TEXT NOT NULL,
    "email"      TEXT,
    -- 0..1. Provider score where one exists, else a fixed per-source value.
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "domain"     TEXT,
    -- One of: firstname.lastname | firstname | firstinitiallastname |
    --         firstlast | firstname_lastname
    "pattern"    TEXT,
    -- hunter | apollo | pattern_memory | public_inference | guess
    "source"     TEXT,
    -- Incremented on every run so a prospect that repeatedly fails can be
    -- excluded from re-runs instead of burning provider credits forever.
    "attempts"   INTEGER NOT NULL DEFAULT 0,
    "lastError"  TEXT,
    "lastRunAt"  TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmProspectEmailDiscovery_pkey" PRIMARY KEY ("id")
);

-- One discovery record per prospect: re-running overwrites in place and
-- increments `attempts` rather than accumulating history rows.
CREATE UNIQUE INDEX IF NOT EXISTS "CrmProspectEmailDiscovery_prospectId_key"
    ON "app_quikcrm"."CrmProspectEmailDiscovery"("prospectId");

CREATE INDEX IF NOT EXISTS "CrmProspectEmailDiscovery_orgId_idx"
    ON "app_quikcrm"."CrmProspectEmailDiscovery"("orgId");

CREATE INDEX IF NOT EXISTS "CrmProspectEmailDiscovery_orgId_status_idx"
    ON "app_quikcrm"."CrmProspectEmailDiscovery"("orgId", "status");

-- CASCADE: the discovery result is meaningless without its prospect, and unlike
-- the Upwork/ICP references on CrmProspect there is nothing here a user has
-- worked on independently that deleting a prospect should preserve.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'CrmProspectEmailDiscovery_prospectId_fkey'
    ) THEN
        ALTER TABLE "app_quikcrm"."CrmProspectEmailDiscovery"
            ADD CONSTRAINT "CrmProspectEmailDiscovery_prospectId_fkey"
            FOREIGN KEY ("prospectId")
            REFERENCES "app_quikcrm"."CrmProspect"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ── Learned email pattern per company domain ───────────────────────────────
-- The Postgres replacement for the source implementation's in-process Map
-- cache. Persisted because the discovery route is serverless: a Map dies with
-- the instance, so every cold start would re-pay for a provider lookup it had
-- already made. The second prospect at the same company then costs no credits.
--
-- Scoped per org, not globally: one tenant's data must never inform another's,
-- consistent with every other table in this schema.
CREATE TABLE IF NOT EXISTS "app_quikcrm"."CrmOrgEmailPattern" (
    "id"        TEXT NOT NULL,
    "orgId"     TEXT NOT NULL,
    "domain"    TEXT NOT NULL,
    "pattern"   TEXT NOT NULL,
    -- hunter | apollo | inferred
    "source"    TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmOrgEmailPattern_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmOrgEmailPattern_orgId_domain_key"
    ON "app_quikcrm"."CrmOrgEmailPattern"("orgId", "domain");

CREATE INDEX IF NOT EXISTS "CrmOrgEmailPattern_orgId_idx"
    ON "app_quikcrm"."CrmOrgEmailPattern"("orgId");

COMMIT;
