-- ============================================================================
-- crm_opportunities_phase_overhaul
--
-- Phase 1: rename `title` → `name`, promote `amount` to Decimal(18,2), bump
--   default probability to 10, add ownerName denormalisation.
-- Phase 2: weightedAmount, closeReason{,Category}, competitorName, last*At
--   timestamps, deletedAt soft-delete, createdByUserId, two new tables for
--   line-items (CrmOpportunityProduct) and stage audit history
--   (CrmOpportunityStageTransition), plus extra columns on
--   CrmOpportunityClientMeeting (meetingType, competitorName, outcome).
-- ============================================================================

-- 1. Rename title → name (data preserved).
ALTER TABLE "app_quikcrm"."CrmOpportunity" RENAME COLUMN "title" TO "name";

-- 2. Promote amount Float → Decimal(18,2). Postgres `double precision` casts
--    cleanly to NUMERIC.
ALTER TABLE "app_quikcrm"."CrmOpportunity"
  ALTER COLUMN "amount" TYPE DECIMAL(18,2) USING "amount"::numeric;

-- 3. New default probability 10 (was 0). Existing rows are NOT touched —
--    only newly inserted rows pick up the default.
ALTER TABLE "app_quikcrm"."CrmOpportunity"
  ALTER COLUMN "probability" SET DEFAULT 10;

-- 4. New columns (Phase 1 + Phase 2).
ALTER TABLE "app_quikcrm"."CrmOpportunity"
  ADD COLUMN "ownerName"           TEXT,
  ADD COLUMN "weightedAmount"      DECIMAL(18,2),
  ADD COLUMN "closeReason"         TEXT,
  ADD COLUMN "closeReasonCategory" TEXT,
  ADD COLUMN "competitorName"      TEXT,
  ADD COLUMN "lastStageChangeAt"   TIMESTAMP(3),
  ADD COLUMN "lastActivityAt"      TIMESTAMP(3),
  ADD COLUMN "deletedAt"           TIMESTAMP(3),
  ADD COLUMN "createdByUserId"     TEXT;

-- 5. Backfill weightedAmount = amount * probability / 100 for existing rows
--    so dashboards don't show empty cells right after deploy.
UPDATE "app_quikcrm"."CrmOpportunity"
   SET "weightedAmount" = ROUND("amount" * "probability" / 100.0, 2)
 WHERE "amount" IS NOT NULL;

-- 6. Backfill lastStageChangeAt = updatedAt (best approximation we have).
UPDATE "app_quikcrm"."CrmOpportunity"
   SET "lastStageChangeAt" = "updatedAt"
 WHERE "lastStageChangeAt" IS NULL;

-- 7. Indexes for new query shapes.
CREATE INDEX "CrmOpportunity_tenantId_accountId_idx"
   ON "app_quikcrm"."CrmOpportunity"("tenantId", "accountId");
CREATE INDEX "CrmOpportunity_tenantId_deletedAt_idx"
   ON "app_quikcrm"."CrmOpportunity"("tenantId", "deletedAt");

-- 8. CrmOpportunityClientMeeting — add fields that align with the legacy
--    Mongo schema's qualification record (competitor, meeting type, outcome).
ALTER TABLE "app_quikcrm"."CrmOpportunityClientMeeting"
  ADD COLUMN "meetingType"    TEXT,
  ADD COLUMN "competitorName" TEXT,
  ADD COLUMN "outcome"        TEXT;

-- 9. CrmOpportunityProduct — opportunity line items.
CREATE TABLE "app_quikcrm"."CrmOpportunityProduct" (
  "id"            TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "productName"   TEXT NOT NULL,
  "quantity"      INTEGER NOT NULL DEFAULT 1,
  "unitPrice"     DECIMAL(18,2) NOT NULL,
  "discountPct"   INTEGER NOT NULL DEFAULT 0,
  "lineTotal"     DECIMAL(18,2) NOT NULL,
  "notes"         TEXT,
  "sortOrder"     INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CrmOpportunityProduct_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CrmOpportunityProduct_tenantId_opportunityId_idx"
   ON "app_quikcrm"."CrmOpportunityProduct"("tenantId", "opportunityId");

ALTER TABLE "app_quikcrm"."CrmOpportunityProduct"
  ADD CONSTRAINT "CrmOpportunityProduct_opportunityId_fkey"
  FOREIGN KEY ("opportunityId")
  REFERENCES "app_quikcrm"."CrmOpportunity"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 10. CrmOpportunityStageTransition — audit log of stage moves.
CREATE TABLE "app_quikcrm"."CrmOpportunityStageTransition" (
  "id"                  TEXT NOT NULL,
  "tenantId"            TEXT NOT NULL,
  "opportunityId"       TEXT NOT NULL,
  "fromStage"           "app_quikcrm"."CrmOpportunityStage" NOT NULL,
  "toStage"             "app_quikcrm"."CrmOpportunityStage" NOT NULL,
  "changedByUserId"     TEXT,
  "changedByName"       TEXT,
  "closeReason"         TEXT,
  "closeReasonCategory" TEXT,
  "notes"               TEXT,
  "occurredAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CrmOpportunityStageTransition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CrmOpportunityStageTransition_tenantId_opportunityId_occurredAt_idx"
   ON "app_quikcrm"."CrmOpportunityStageTransition"("tenantId", "opportunityId", "occurredAt");

ALTER TABLE "app_quikcrm"."CrmOpportunityStageTransition"
  ADD CONSTRAINT "CrmOpportunityStageTransition_opportunityId_fkey"
  FOREIGN KEY ("opportunityId")
  REFERENCES "app_quikcrm"."CrmOpportunity"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
