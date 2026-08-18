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
