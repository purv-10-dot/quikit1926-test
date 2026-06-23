-- Maintenance job cards + spares + machinery service interval fields

ALTER TABLE "app_quikinfra"."Machinery"
  ADD COLUMN IF NOT EXISTS "serviceIntervalValue" DECIMAL(18,4),
  ADD COLUMN IF NOT EXISTS "serviceIntervalUnit" TEXT,
  ADD COLUMN IF NOT EXISTS "lastServiceMeter" DECIMAL(18,2);

CREATE TABLE IF NOT EXISTS "app_quikinfra"."Maintenance_job_cards" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "jobNumber" TEXT NOT NULL,
  "equipmentId" TEXT NOT NULL,
  "projectId" TEXT,
  "jobType" TEXT NOT NULL DEFAULT 'breakdown',
  "serviceDate" TIMESTAMP(3) NOT NULL,
  "meterAtService" DECIMAL(18,2),
  "downtimeHours" DECIMAL(18,4),
  "reportedProblem" TEXT,
  "labourCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "serviceCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "totalCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "remarks" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  CONSTRAINT "Maintenance_job_cards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikinfra"."Job_card_spares" (
  "id" TEXT NOT NULL,
  "jobCardId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "qty" DECIMAL(18,4) NOT NULL,
  "rate" DECIMAL(18,2) NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  CONSTRAINT "Job_card_spares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Maintenance_job_cards_orgId_jobNumber_key"
  ON "app_quikinfra"."Maintenance_job_cards"("orgId", "jobNumber");
CREATE INDEX IF NOT EXISTS "Maintenance_job_cards_orgId_idx" ON "app_quikinfra"."Maintenance_job_cards"("orgId");
CREATE INDEX IF NOT EXISTS "Maintenance_job_cards_equipmentId_idx" ON "app_quikinfra"."Maintenance_job_cards"("equipmentId");
CREATE INDEX IF NOT EXISTS "Maintenance_job_cards_projectId_idx" ON "app_quikinfra"."Maintenance_job_cards"("projectId");
CREATE INDEX IF NOT EXISTS "Maintenance_job_cards_status_idx" ON "app_quikinfra"."Maintenance_job_cards"("status");
CREATE INDEX IF NOT EXISTS "Maintenance_job_cards_serviceDate_idx" ON "app_quikinfra"."Maintenance_job_cards"("serviceDate");
CREATE INDEX IF NOT EXISTS "Job_card_spares_jobCardId_idx" ON "app_quikinfra"."Job_card_spares"("jobCardId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Maintenance_job_cards_equipmentId_fkey') THEN
    ALTER TABLE "app_quikinfra"."Maintenance_job_cards"
      ADD CONSTRAINT "Maintenance_job_cards_equipmentId_fkey"
      FOREIGN KEY ("equipmentId") REFERENCES "app_quikinfra"."Machinery"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Maintenance_job_cards_projectId_fkey') THEN
    ALTER TABLE "app_quikinfra"."Maintenance_job_cards"
      ADD CONSTRAINT "Maintenance_job_cards_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "app_quikinfra"."Projects"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Maintenance_job_cards_orgId_fkey') THEN
    ALTER TABLE "app_quikinfra"."Maintenance_job_cards"
      ADD CONSTRAINT "Maintenance_job_cards_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Job_card_spares_jobCardId_fkey') THEN
    ALTER TABLE "app_quikinfra"."Job_card_spares"
      ADD CONSTRAINT "Job_card_spares_jobCardId_fkey"
      FOREIGN KEY ("jobCardId") REFERENCES "app_quikinfra"."Maintenance_job_cards"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
