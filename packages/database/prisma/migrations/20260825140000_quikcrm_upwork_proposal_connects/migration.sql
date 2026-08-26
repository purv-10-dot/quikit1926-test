-- QuikCRM: submitted-proposal data on CrmUpworkJob (Upwork Connects capture).
--
-- Captures what the freelancer ACTUALLY spent on their own submitted proposal,
-- which only the /nx/proposals/{id} page exposes. This is deliberately kept
-- distinct from the two job-LISTING columns that already exist and are NOT
-- touched here:
--   "requiredConnects" -- what the listing says a proposal costs to submit
--   "proposals"        -- the listing's proposal-count range ("20 to 50")
-- Neither is a substitute for actual spend, so neither is read, written or
-- backfilled from by this migration.
--
-- BACKWARD COMPATIBLE ON LIVE DATA. Every column is nullable with no default and
-- no constraint, so:
--   * existing rows are not rewritten -- Postgres adds a nullable column without
--     a table rewrite, so this is safe on a large CrmUpworkJob;
--   * existing rows read back NULL, which is the correct meaning: a captured job
--     normally has no proposal at all (most jobs are saved for research), and
--     proposal capture is a separate, optional user action;
--   * every existing query, insert and the (orgId, dedupeKey) duplicate guard
--     behave exactly as before -- nothing here participates in dedupe.
--
-- NULL is meaningful and is never to be defaulted to 0: "we do not know what was
-- spent" must stay distinguishable from "zero Connects were spent". A 0 would
-- read as a real figure in the future Sales Cost calculation.
--
-- "connectsUsed"/"boostConnects" are INTEGER rather than TEXT (unlike the scraped
-- listing columns) because a later Sales Cost phase multiplies them by a
-- cost-per-Connect rate; storing the quantity as a number avoids re-parsing text
-- at read time. Boost is stored SEPARATELY from base spend rather than summed, so
-- the base figure stays recoverable.
--
-- No index: these columns are read per-job on a row already located by id, and
-- proposal identity is resolved through the existing (orgId, dedupeKey) row.
--
-- Idempotent (IF NOT EXISTS) to match the conventions of the other migrations.

ALTER TABLE "app_quikcrm"."CrmUpworkJob"
  ADD COLUMN IF NOT EXISTS "proposalId" TEXT,
  ADD COLUMN IF NOT EXISTS "proposalSubmittedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "connectsUsed" INTEGER,
  ADD COLUMN IF NOT EXISTS "boostConnects" INTEGER;
