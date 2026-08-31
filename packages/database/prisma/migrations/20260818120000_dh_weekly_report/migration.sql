-- Daily Huddle Weekly Report (Phase 1).
--
-- One persisted rollup per client per ISO week, matching the client's
-- reference format (§4.1 Meeting Details … §4.6 Facilitator Observations).
--
-- `metrics` is stored FLAT and separate from `report` on purpose: the
-- requirement doc mandates that weekly results be kept in a structured,
-- comparable form so the Monthly Report can trend four weeks. Keeping the
-- numbers out of the big report blob makes that a cheap row read rather than
-- a JSON parse of every week.
--
-- `validatedAt`/`validatedBy` back the human sign-off gate — a report reads as
-- Draft until someone confirms the AI prose against the underlying data.
--
-- Idempotent (IF NOT EXISTS) so it is safe to re-run on a database where it
-- was applied out-of-band. Purely additive: no existing table is touched.

-- CreateTable
CREATE TABLE IF NOT EXISTS "app_quikscale"."ClientDailyHuddleWeeklyReport" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "report" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "validation" JSONB,
    "reportConfidence" DOUBLE PRECISION,
    "sourceHuddleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceTranscriptIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "validatedAt" TIMESTAMP(3),
    "validatedBy" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ClientDailyHuddleWeeklyReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ClientDailyHuddleWeeklyReport_orgId_clientId_weekStart_key"
    ON "app_quikscale"."ClientDailyHuddleWeeklyReport"("orgId", "clientId", "weekStart");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClientDailyHuddleWeeklyReport_orgId_idx"
    ON "app_quikscale"."ClientDailyHuddleWeeklyReport"("orgId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClientDailyHuddleWeeklyReport_orgId_clientId_weekStart_idx"
    ON "app_quikscale"."ClientDailyHuddleWeeklyReport"("orgId", "clientId", "weekStart");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClientDailyHuddleWeeklyReport_orgId_deletedAt_idx"
    ON "app_quikscale"."ClientDailyHuddleWeeklyReport"("orgId", "deletedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClientDailyHuddleWeeklyReport_clientId_idx"
    ON "app_quikscale"."ClientDailyHuddleWeeklyReport"("clientId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClientDailyHuddleWeeklyReport_deletedAt_idx"
    ON "app_quikscale"."ClientDailyHuddleWeeklyReport"("deletedAt");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "app_quikscale"."ClientDailyHuddleWeeklyReport"
        ADD CONSTRAINT "ClientDailyHuddleWeeklyReport_clientId_fkey"
        FOREIGN KEY ("clientId") REFERENCES "app_quikscale"."Client"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "app_quikscale"."ClientDailyHuddleWeeklyReport"
        ADD CONSTRAINT "ClientDailyHuddleWeeklyReport_orgId_fkey"
        FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
