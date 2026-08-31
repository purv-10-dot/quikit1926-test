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
