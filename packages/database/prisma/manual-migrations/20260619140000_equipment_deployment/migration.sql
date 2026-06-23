-- Equipment transfers + compliance documents

CREATE TABLE IF NOT EXISTS "app_quikinfra"."Equipment_transfers" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "transferNumber" TEXT NOT NULL,
  "equipmentId" TEXT NOT NULL,
  "sourceProjectId" TEXT,
  "destinationProjectId" TEXT NOT NULL,
  "transferType" TEXT NOT NULL DEFAULT 'reassignment',
  "transferDate" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "remarks" TEXT,
  "gatePassNo" TEXT,
  "status" TEXT NOT NULL DEFAULT 'in_transit',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  CONSTRAINT "Equipment_transfers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikinfra"."Equipment_documents" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "equipmentId" TEXT NOT NULL,
  "docType" TEXT NOT NULL,
  "docNumber" TEXT,
  "issueDate" TIMESTAMP(3),
  "expiryDate" TIMESTAMP(3),
  "alertDays" INTEGER NOT NULL DEFAULT 30,
  "fileUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  CONSTRAINT "Equipment_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Equipment_transfers_orgId_transferNumber_key"
  ON "app_quikinfra"."Equipment_transfers"("orgId", "transferNumber");
CREATE INDEX IF NOT EXISTS "Equipment_transfers_orgId_idx" ON "app_quikinfra"."Equipment_transfers"("orgId");
CREATE INDEX IF NOT EXISTS "Equipment_transfers_equipmentId_idx" ON "app_quikinfra"."Equipment_transfers"("equipmentId");
CREATE INDEX IF NOT EXISTS "Equipment_transfers_status_idx" ON "app_quikinfra"."Equipment_transfers"("status");
CREATE INDEX IF NOT EXISTS "Equipment_transfers_transferDate_idx" ON "app_quikinfra"."Equipment_transfers"("transferDate");
CREATE INDEX IF NOT EXISTS "Equipment_documents_orgId_idx" ON "app_quikinfra"."Equipment_documents"("orgId");
CREATE INDEX IF NOT EXISTS "Equipment_documents_equipmentId_idx" ON "app_quikinfra"."Equipment_documents"("equipmentId");
CREATE INDEX IF NOT EXISTS "Equipment_documents_expiryDate_idx" ON "app_quikinfra"."Equipment_documents"("expiryDate");
CREATE INDEX IF NOT EXISTS "Equipment_documents_status_idx" ON "app_quikinfra"."Equipment_documents"("status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Equipment_transfers_equipmentId_fkey') THEN
    ALTER TABLE "app_quikinfra"."Equipment_transfers"
      ADD CONSTRAINT "Equipment_transfers_equipmentId_fkey"
      FOREIGN KEY ("equipmentId") REFERENCES "app_quikinfra"."Machinery"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Equipment_transfers_sourceProjectId_fkey') THEN
    ALTER TABLE "app_quikinfra"."Equipment_transfers"
      ADD CONSTRAINT "Equipment_transfers_sourceProjectId_fkey"
      FOREIGN KEY ("sourceProjectId") REFERENCES "app_quikinfra"."Projects"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Equipment_transfers_destinationProjectId_fkey') THEN
    ALTER TABLE "app_quikinfra"."Equipment_transfers"
      ADD CONSTRAINT "Equipment_transfers_destinationProjectId_fkey"
      FOREIGN KEY ("destinationProjectId") REFERENCES "app_quikinfra"."Projects"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Equipment_transfers_orgId_fkey') THEN
    ALTER TABLE "app_quikinfra"."Equipment_transfers"
      ADD CONSTRAINT "Equipment_transfers_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Equipment_documents_equipmentId_fkey') THEN
    ALTER TABLE "app_quikinfra"."Equipment_documents"
      ADD CONSTRAINT "Equipment_documents_equipmentId_fkey"
      FOREIGN KEY ("equipmentId") REFERENCES "app_quikinfra"."Machinery"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Equipment_documents_orgId_fkey') THEN
    ALTER TABLE "app_quikinfra"."Equipment_documents"
      ADD CONSTRAINT "Equipment_documents_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
