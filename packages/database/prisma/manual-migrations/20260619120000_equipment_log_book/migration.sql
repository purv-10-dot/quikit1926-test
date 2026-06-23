-- Equipment Log Book — daily machine logs + machinery meter fields

ALTER TABLE "app_quikinfra"."Machinery"
  ADD COLUMN IF NOT EXISTS "meterType" TEXT NOT NULL DEFAULT 'hour',
  ADD COLUMN IF NOT EXISTS "currentMeter" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "fuelNorm" DECIMAL(18,4);

CREATE TABLE IF NOT EXISTS "app_quikinfra"."Equipment_logs" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "equipmentId" TEXT NOT NULL,
  "projectId" TEXT,
  "logDate" TIMESTAMP(3) NOT NULL,
  "shift" TEXT NOT NULL DEFAULT 'Day',
  "openingMeter" DECIMAL(18,2),
  "closingMeter" DECIMAL(18,2),
  "meterReset" BOOLEAN NOT NULL DEFAULT false,
  "run" DECIMAL(18,4),
  "idleHours" DECIMAL(18,4),
  "breakdownHours" DECIMAL(18,4),
  "dieselIssued" DECIMAL(18,4),
  "fuelRate" DECIMAL(18,4),
  "operatorName" TEXT,
  "productivityQty" DECIMAL(18,4),
  "outputUom" TEXT,
  "remarks" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "rejectReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  CONSTRAINT "Equipment_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Equipment_logs_orgId_idx" ON "app_quikinfra"."Equipment_logs"("orgId");
CREATE INDEX IF NOT EXISTS "Equipment_logs_equipmentId_idx" ON "app_quikinfra"."Equipment_logs"("equipmentId");
CREATE INDEX IF NOT EXISTS "Equipment_logs_projectId_idx" ON "app_quikinfra"."Equipment_logs"("projectId");
CREATE INDEX IF NOT EXISTS "Equipment_logs_logDate_idx" ON "app_quikinfra"."Equipment_logs"("logDate");
CREATE INDEX IF NOT EXISTS "Equipment_logs_status_idx" ON "app_quikinfra"."Equipment_logs"("status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Equipment_logs_equipmentId_fkey'
  ) THEN
    ALTER TABLE "app_quikinfra"."Equipment_logs"
      ADD CONSTRAINT "Equipment_logs_equipmentId_fkey"
      FOREIGN KEY ("equipmentId") REFERENCES "app_quikinfra"."Machinery"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Equipment_logs_projectId_fkey'
  ) THEN
    ALTER TABLE "app_quikinfra"."Equipment_logs"
      ADD CONSTRAINT "Equipment_logs_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "app_quikinfra"."Projects"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Equipment_logs_orgId_fkey'
  ) THEN
    ALTER TABLE "app_quikinfra"."Equipment_logs"
      ADD CONSTRAINT "Equipment_logs_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
