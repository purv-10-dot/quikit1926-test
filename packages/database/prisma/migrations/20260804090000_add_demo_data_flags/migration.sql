-- Adds an isDemoData flag to every QuikScale content model that participates
-- in org-specific demo/sample data seeding, plus a DemoDataState tracker.
-- Scoped narrowly to app_quikscale to avoid touching unrelated schema drift
-- from other apps sharing this database.

ALTER TABLE "app_quikscale"."Team" ADD COLUMN IF NOT EXISTS "isDemoData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_quikscale"."AccountabilityFunction" ADD COLUMN IF NOT EXISTS "isDemoData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_quikscale"."KPI" ADD COLUMN IF NOT EXISTS "isDemoData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_quikscale"."Priority" ADD COLUMN IF NOT EXISTS "isDemoData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_quikscale"."WWWItem" ADD COLUMN IF NOT EXISTS "isDemoData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_quikscale"."UnitMaster" ADD COLUMN IF NOT EXISTS "isDemoData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_quikscale"."Client" ADD COLUMN IF NOT EXISTS "isDemoData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_quikscale"."ClientMember" ADD COLUMN IF NOT EXISTS "isDemoData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_quikscale"."ClientDailyHuddle" ADD COLUMN IF NOT EXISTS "isDemoData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_quikscale"."ClientWeeklyMeeting" ADD COLUMN IF NOT EXISTS "isDemoData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_quikscale"."OPSPData" ADD COLUMN IF NOT EXISTS "isDemoData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_quikscale"."OPSPUserSection" ADD COLUMN IF NOT EXISTS "isDemoData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_quikscale"."OPSPPlan" ADD COLUMN IF NOT EXISTS "isDemoData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_quikscale"."HabitAssessment" ADD COLUMN IF NOT EXISTS "isDemoData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_quikscale"."SWTEntry" ADD COLUMN IF NOT EXISTS "isDemoData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_quikscale"."Goal" ADD COLUMN IF NOT EXISTS "isDemoData" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "app_quikscale"."DemoDataState" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "seededAt" TIMESTAMP(3),
    "clearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoDataState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DemoDataState_orgId_key" ON "app_quikscale"."DemoDataState"("orgId");

ALTER TABLE "app_quikscale"."DemoDataState"
    ADD CONSTRAINT "DemoDataState_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
