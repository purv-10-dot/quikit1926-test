-- Critical Numbers (v1) — a lightweight metric tracker under Execution.
--
-- Two tables:
--   CriticalNumber       — one tracked metric, scoped to an org + team.
--   CriticalNumberUpdate — append-only value history (never updated in place);
--                          this is what the trend chart plots.
--
-- Purely additive: no existing table, column, index or constraint is touched,
-- so this is safe to apply to a populated database and trivially reversible
-- (drop both tables).
--
-- SQL generated with `prisma migrate diff` and then narrowed to just these two
-- tables — the raw diff also emits ~360 statements of PRE-EXISTING drift
-- between schema.prisma and the live database (index renames, dropped tables,
-- FK churn) that has nothing to do with this feature and must not ride along.

-- CreateTable
CREATE TABLE "app_quikscale"."CriticalNumber" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'custom_targets',
    "thresholdGreat" DOUBLE PRECISION,
    "thresholdGood" DOUBLE PRECISION,
    "thresholdConcerned" DOUBLE PRECISION,
    "thresholdBad" DOUBLE PRECISION,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "targetValue" DOUBLE PRECISION,
    "currentValue" DOUBLE PRECISION,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CriticalNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikscale"."CriticalNumberUpdate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "criticalNumberId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "comment" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CriticalNumberUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CriticalNumber_orgId_idx" ON "app_quikscale"."CriticalNumber"("orgId");

-- CreateIndex: backs the server-side "max 5 per team" cap check.
CREATE INDEX "CriticalNumber_orgId_teamId_idx" ON "app_quikscale"."CriticalNumber"("orgId", "teamId");

-- CreateIndex
CREATE INDEX "CriticalNumber_ownerId_idx" ON "app_quikscale"."CriticalNumber"("ownerId");

-- CreateIndex
CREATE INDEX "CriticalNumberUpdate_orgId_idx" ON "app_quikscale"."CriticalNumberUpdate"("orgId");

-- CreateIndex: backs the trend chart (history for one metric, by date).
CREATE INDEX "CriticalNumberUpdate_criticalNumberId_date_idx" ON "app_quikscale"."CriticalNumberUpdate"("criticalNumberId", "date");

-- AddForeignKey
ALTER TABLE "app_quikscale"."CriticalNumber" ADD CONSTRAINT "CriticalNumber_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: app_quikscale."Team" is the physical table behind the QsTeam model.
ALTER TABLE "app_quikscale"."CriticalNumber" ADD CONSTRAINT "CriticalNumber_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "app_quikscale"."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: RESTRICT, not CASCADE — deleting a user must not silently
-- delete the metrics they own.
ALTER TABLE "app_quikscale"."CriticalNumber" ADD CONSTRAINT "CriticalNumber_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "auth"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikscale"."CriticalNumberUpdate" ADD CONSTRAINT "CriticalNumberUpdate_criticalNumberId_fkey" FOREIGN KEY ("criticalNumberId") REFERENCES "app_quikscale"."CriticalNumber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikscale"."CriticalNumberUpdate" ADD CONSTRAINT "CriticalNumberUpdate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
