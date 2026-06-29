-- ============================================================================
-- Machinery & Equipment module — combined manual migration
-- ============================================================================
-- Single command file consolidating all 10 migrations that were moved out of
-- prisma/migrations into manual-migrations. Apply top-to-bottom in one psql
-- session against the target database (schema: app_quikinfra, references quikit).
--
-- Source migrations, in chronological (apply) order:
--   1. 20260619120000_equipment_log_book
--   2. 20260619130000_maintenance_job_cards
--   3. 20260619140000_equipment_deployment
--   4. 20260619150000_machinery_ownership_depr
--   5. 20260619160000_hire_rent
--   6. 20260619170000_fixed_assets
--   7. 20260622120000_equipment_log_workflow
--   8. 20260622140000_equipment_table_consolidation
--   9. 20260622150000_fleet_dashboard_table
--  10. 20260623120000_drop_cn_approval_rule_request
--
-- NOTE: order matters — migrations 02/05/06 create tables that migration 08
-- consolidates and then DROPs. Do not reorder.
-- ============================================================================

BEGIN;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 01. 20260619120000_equipment_log_book                                      ║
-- ║     Equipment Log Book — daily machine logs + machinery meter fields       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

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


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 02. 20260619130000_maintenance_job_cards                                   ║
-- ║     Maintenance job cards + spares + machinery service interval fields     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

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


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 03. 20260619140000_equipment_deployment                                    ║
-- ║     Equipment transfers + compliance documents                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

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


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 04. 20260619150000_machinery_ownership_depr                                ║
-- ║     Machinery ownership & depreciation fields for fleet cost sheet         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE "app_quikinfra"."Machinery"
  ADD COLUMN IF NOT EXISTS "ownershipType" TEXT NOT NULL DEFAULT 'owned',
  ADD COLUMN IF NOT EXISTS "capitalisationCost" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "deprRate" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "deprMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "capitalisationDate" TIMESTAMP(3);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 05. 20260619160000_hire_rent                                               ║
-- ║     Hire & Rent — rate master, hire-in verification, rent-out billing      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS "app_quikinfra"."Hire_rates" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "rateBasis" TEXT NOT NULL DEFAULT 'hour',
  "equipmentId" TEXT,
  "equipmentType" TEXT,
  "vendorId" TEXT,
  "customerId" TEXT,
  "rate" DECIMAL(18,2) NOT NULL,
  "sacCode" TEXT,
  "gstPercent" DECIMAL(5,2) NOT NULL DEFAULT 18,
  "minGuaranteedQty" DECIMAL(18,4),
  "effectiveFrom" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  CONSTRAINT "Hire_rates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikinfra"."Hire_in_verifications" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "verificationNumber" TEXT NOT NULL,
  "equipmentId" TEXT NOT NULL,
  "vendorId" TEXT,
  "periodFrom" TIMESTAMP(3) NOT NULL,
  "periodTo" TIMESTAMP(3) NOT NULL,
  "rate" DECIMAL(18,2) NOT NULL,
  "rateBasis" TEXT NOT NULL DEFAULT 'hour',
  "vendorClaimedQty" DECIMAL(18,4),
  "minGuaranteedQty" DECIMAL(18,4),
  "gstPercent" DECIMAL(5,2) NOT NULL DEFAULT 18,
  "loggedQty" DECIMAL(18,4),
  "billableQty" DECIMAL(18,4),
  "varianceQty" DECIMAL(18,4),
  "payableAmount" DECIMAL(18,2),
  "gstAmount" DECIMAL(18,2),
  "totalAmount" DECIMAL(18,2),
  "status" TEXT NOT NULL DEFAULT 'draft',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  CONSTRAINT "Hire_in_verifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikinfra"."Rent_out_bills" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "billNumber" TEXT NOT NULL,
  "equipmentId" TEXT NOT NULL,
  "customerId" TEXT,
  "projectId" TEXT,
  "periodFrom" TIMESTAMP(3) NOT NULL,
  "periodTo" TIMESTAMP(3) NOT NULL,
  "rateBasis" TEXT NOT NULL DEFAULT 'hour',
  "rate" DECIMAL(18,2) NOT NULL,
  "minGuaranteedQty" DECIMAL(18,4),
  "sacCode" TEXT,
  "gstPercent" DECIMAL(5,2) NOT NULL DEFAULT 18,
  "billableQty" DECIMAL(18,4),
  "amount" DECIMAL(18,2),
  "gstAmount" DECIMAL(18,2),
  "totalAmount" DECIMAL(18,2),
  "status" TEXT NOT NULL DEFAULT 'draft',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  CONSTRAINT "Rent_out_bills_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Hire_in_verifications_orgId_verificationNumber_key"
  ON "app_quikinfra"."Hire_in_verifications"("orgId", "verificationNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Rent_out_bills_orgId_billNumber_key"
  ON "app_quikinfra"."Rent_out_bills"("orgId", "billNumber");

CREATE INDEX IF NOT EXISTS "Hire_rates_orgId_idx" ON "app_quikinfra"."Hire_rates"("orgId");
CREATE INDEX IF NOT EXISTS "Hire_rates_direction_idx" ON "app_quikinfra"."Hire_rates"("direction");
CREATE INDEX IF NOT EXISTS "Hire_rates_equipmentId_idx" ON "app_quikinfra"."Hire_rates"("equipmentId");
CREATE INDEX IF NOT EXISTS "Hire_rates_status_idx" ON "app_quikinfra"."Hire_rates"("status");

CREATE INDEX IF NOT EXISTS "Hire_in_verifications_orgId_idx" ON "app_quikinfra"."Hire_in_verifications"("orgId");
CREATE INDEX IF NOT EXISTS "Hire_in_verifications_equipmentId_idx" ON "app_quikinfra"."Hire_in_verifications"("equipmentId");
CREATE INDEX IF NOT EXISTS "Hire_in_verifications_status_idx" ON "app_quikinfra"."Hire_in_verifications"("status");
CREATE INDEX IF NOT EXISTS "Hire_in_verifications_periodFrom_idx" ON "app_quikinfra"."Hire_in_verifications"("periodFrom");

CREATE INDEX IF NOT EXISTS "Rent_out_bills_orgId_idx" ON "app_quikinfra"."Rent_out_bills"("orgId");
CREATE INDEX IF NOT EXISTS "Rent_out_bills_equipmentId_idx" ON "app_quikinfra"."Rent_out_bills"("equipmentId");
CREATE INDEX IF NOT EXISTS "Rent_out_bills_status_idx" ON "app_quikinfra"."Rent_out_bills"("status");
CREATE INDEX IF NOT EXISTS "Rent_out_bills_periodFrom_idx" ON "app_quikinfra"."Rent_out_bills"("periodFrom");

-- NOTE: original migration added these FKs unconditionally (no IF NOT EXISTS guard).
ALTER TABLE "app_quikinfra"."Hire_rates"
  ADD CONSTRAINT "Hire_rates_equipmentId_fkey"
  FOREIGN KEY ("equipmentId") REFERENCES "app_quikinfra"."Machinery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app_quikinfra"."Hire_rates"
  ADD CONSTRAINT "Hire_rates_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "app_quikinfra"."Vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app_quikinfra"."Hire_rates"
  ADD CONSTRAINT "Hire_rates_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "app_quikinfra"."Customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app_quikinfra"."Hire_rates"
  ADD CONSTRAINT "Hire_rates_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikinfra"."Hire_in_verifications"
  ADD CONSTRAINT "Hire_in_verifications_equipmentId_fkey"
  FOREIGN KEY ("equipmentId") REFERENCES "app_quikinfra"."Machinery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app_quikinfra"."Hire_in_verifications"
  ADD CONSTRAINT "Hire_in_verifications_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "app_quikinfra"."Vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app_quikinfra"."Hire_in_verifications"
  ADD CONSTRAINT "Hire_in_verifications_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikinfra"."Rent_out_bills"
  ADD CONSTRAINT "Rent_out_bills_equipmentId_fkey"
  FOREIGN KEY ("equipmentId") REFERENCES "app_quikinfra"."Machinery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app_quikinfra"."Rent_out_bills"
  ADD CONSTRAINT "Rent_out_bills_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "app_quikinfra"."Customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app_quikinfra"."Rent_out_bills"
  ADD CONSTRAINT "Rent_out_bills_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "app_quikinfra"."Projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app_quikinfra"."Rent_out_bills"
  ADD CONSTRAINT "Rent_out_bills_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 06. 20260619170000_fixed_assets                                            ║
-- ║     Fixed Asset / Tools — depreciation fields + transactional tables       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE "app_quikinfra"."Assets"
  ADD COLUMN IF NOT EXISTS "lostQty" DECIMAL(18,4),
  ADD COLUMN IF NOT EXISTS "deprMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "deprRate" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "accumulatedDepr" DECIMAL(18,2);

CREATE TABLE IF NOT EXISTS "app_quikinfra"."Fixed_asset_issuances" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "issuanceNumber" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "issuedToType" TEXT NOT NULL DEFAULT 'user',
  "issuedTo" TEXT NOT NULL,
  "projectId" TEXT,
  "quantity" DECIMAL(18,4) NOT NULL,
  "pendingQty" DECIMAL(18,4) NOT NULL,
  "gatePassNo" TEXT,
  "expectedReturnDate" TIMESTAMP(3),
  "returnable" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'issued',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  CONSTRAINT "Fixed_asset_issuances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikinfra"."Fixed_asset_transfers" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "transferNumber" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "sourceProjectId" TEXT,
  "destinationProjectId" TEXT NOT NULL,
  "destinationLocation" TEXT,
  "quantity" DECIMAL(18,4) NOT NULL,
  "transferDate" TIMESTAMP(3) NOT NULL,
  "gatePassNo" TEXT,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'in_transit',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  CONSTRAINT "Fixed_asset_transfers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikinfra"."Fixed_asset_repairs" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "repairNumber" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL,
  "problem" TEXT,
  "repairCost" DECIMAL(18,2),
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  CONSTRAINT "Fixed_asset_repairs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikinfra"."Fixed_asset_audits" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "auditNumber" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "bookQty" DECIMAL(18,4) NOT NULL,
  "countedQty" DECIMAL(18,4) NOT NULL,
  "varianceQty" DECIMAL(18,4) NOT NULL,
  "auditDate" TIMESTAMP(3) NOT NULL,
  "remarks" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  CONSTRAINT "Fixed_asset_audits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Fixed_asset_issuances_orgId_issuanceNumber_key"
  ON "app_quikinfra"."Fixed_asset_issuances"("orgId", "issuanceNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Fixed_asset_transfers_orgId_transferNumber_key"
  ON "app_quikinfra"."Fixed_asset_transfers"("orgId", "transferNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Fixed_asset_repairs_orgId_repairNumber_key"
  ON "app_quikinfra"."Fixed_asset_repairs"("orgId", "repairNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Fixed_asset_audits_orgId_auditNumber_key"
  ON "app_quikinfra"."Fixed_asset_audits"("orgId", "auditNumber");

CREATE INDEX IF NOT EXISTS "Fixed_asset_issuances_orgId_idx" ON "app_quikinfra"."Fixed_asset_issuances"("orgId");
CREATE INDEX IF NOT EXISTS "Fixed_asset_issuances_assetId_idx" ON "app_quikinfra"."Fixed_asset_issuances"("assetId");
CREATE INDEX IF NOT EXISTS "Fixed_asset_transfers_orgId_idx" ON "app_quikinfra"."Fixed_asset_transfers"("orgId");
CREATE INDEX IF NOT EXISTS "Fixed_asset_transfers_assetId_idx" ON "app_quikinfra"."Fixed_asset_transfers"("assetId");
CREATE INDEX IF NOT EXISTS "Fixed_asset_repairs_orgId_idx" ON "app_quikinfra"."Fixed_asset_repairs"("orgId");
CREATE INDEX IF NOT EXISTS "Fixed_asset_audits_orgId_idx" ON "app_quikinfra"."Fixed_asset_audits"("orgId");

-- NOTE: original migration added these FKs unconditionally (no IF NOT EXISTS guard).
ALTER TABLE "app_quikinfra"."Fixed_asset_issuances"
  ADD CONSTRAINT "Fixed_asset_issuances_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "app_quikinfra"."Assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app_quikinfra"."Fixed_asset_issuances"
  ADD CONSTRAINT "Fixed_asset_issuances_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "app_quikinfra"."Projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app_quikinfra"."Fixed_asset_issuances"
  ADD CONSTRAINT "Fixed_asset_issuances_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikinfra"."Fixed_asset_transfers"
  ADD CONSTRAINT "Fixed_asset_transfers_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "app_quikinfra"."Assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app_quikinfra"."Fixed_asset_transfers"
  ADD CONSTRAINT "Fixed_asset_transfers_sourceProjectId_fkey"
  FOREIGN KEY ("sourceProjectId") REFERENCES "app_quikinfra"."Projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app_quikinfra"."Fixed_asset_transfers"
  ADD CONSTRAINT "Fixed_asset_transfers_destinationProjectId_fkey"
  FOREIGN KEY ("destinationProjectId") REFERENCES "app_quikinfra"."Projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app_quikinfra"."Fixed_asset_transfers"
  ADD CONSTRAINT "Fixed_asset_transfers_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikinfra"."Fixed_asset_repairs"
  ADD CONSTRAINT "Fixed_asset_repairs_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "app_quikinfra"."Assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app_quikinfra"."Fixed_asset_repairs"
  ADD CONSTRAINT "Fixed_asset_repairs_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikinfra"."Fixed_asset_audits"
  ADD CONSTRAINT "Fixed_asset_audits_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "app_quikinfra"."Assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app_quikinfra"."Fixed_asset_audits"
  ADD CONSTRAINT "Fixed_asset_audits_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 07. 20260622120000_equipment_log_workflow                                  ║
-- ║     Equipment Log Book — workflow approval linkage                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE "app_quikinfra"."Equipment_logs"
  ADD COLUMN IF NOT EXISTS "approvalId" TEXT,
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "submittedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "returnedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "returnedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "returnReason" TEXT;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 08. 20260622140000_equipment_table_consolidation                           ║
-- ║     Consolidate Machinery & Equipment tables (11 → 4 + maintenance JSON)   ║
-- ║     NOTE: this migrates data from and DROPs the tables created in 02/05/06 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 1. Maintenance: spares JSON on job cards ─────────────────────────────
ALTER TABLE "app_quikinfra"."Maintenance_job_cards"
  ADD COLUMN IF NOT EXISTS "spares" JSONB NOT NULL DEFAULT '[]';

UPDATE "app_quikinfra"."Maintenance_job_cards" j
SET "spares" = COALESCE(
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'description', s.description,
        'qty', s.qty,
        'rate', s.rate,
        'amount', s.amount
      ) ORDER BY s.id
    )
    FROM "app_quikinfra"."Job_card_spares" s
    WHERE s."jobCardId" = j.id
  ),
  '[]'::jsonb
);

DROP TABLE IF EXISTS "app_quikinfra"."Job_card_spares";

-- ── 2. Deployment: transfers + documents → Equipment_deployment ────────────
CREATE TABLE IF NOT EXISTS "app_quikinfra"."Equipment_deployment" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "recordType" TEXT NOT NULL,
  "referenceNumber" TEXT,
  "equipmentId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "sourceProjectId" TEXT,
  "destinationProjectId" TEXT,
  "transferType" TEXT,
  "transferDate" TIMESTAMP(3),
  "reason" TEXT,
  "remarks" TEXT,
  "gatePassNo" TEXT,
  "docType" TEXT,
  "docNumber" TEXT,
  "issueDate" TIMESTAMP(3),
  "expiryDate" TIMESTAMP(3),
  "alertDays" INTEGER,
  "fileUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  CONSTRAINT "Equipment_deployment_pkey" PRIMARY KEY ("id")
);

INSERT INTO "app_quikinfra"."Equipment_deployment" (
  "id", "orgId", "recordType", "referenceNumber", "equipmentId", "status",
  "sourceProjectId", "destinationProjectId", "transferType", "transferDate",
  "reason", "remarks", "gatePassNo",
  "createdAt", "updatedAt", "createdBy", "updatedBy"
)
SELECT
  "id", "orgId", 'transfer', "transferNumber", "equipmentId", "status",
  "sourceProjectId", "destinationProjectId", "transferType", "transferDate",
  "reason", "remarks", "gatePassNo",
  "createdAt", "updatedAt", "createdBy", "updatedBy"
FROM "app_quikinfra"."Equipment_transfers"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "app_quikinfra"."Equipment_deployment" (
  "id", "orgId", "recordType", "referenceNumber", "equipmentId", "status",
  "docType", "docNumber", "issueDate", "expiryDate", "alertDays", "fileUrl",
  "createdAt", "updatedAt", "createdBy", "updatedBy"
)
SELECT
  "id", "orgId", 'document', COALESCE("docNumber", 'DOC-' || "id"), "equipmentId", "status",
  "docType", "docNumber", "issueDate", "expiryDate", "alertDays", "fileUrl",
  "createdAt", "updatedAt", "createdBy", "updatedBy"
FROM "app_quikinfra"."Equipment_documents"
ON CONFLICT ("id") DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS "Equipment_deployment_orgId_referenceNumber_key"
  ON "app_quikinfra"."Equipment_deployment"("orgId", "referenceNumber");
CREATE INDEX IF NOT EXISTS "Equipment_deployment_orgId_idx" ON "app_quikinfra"."Equipment_deployment"("orgId");
CREATE INDEX IF NOT EXISTS "Equipment_deployment_recordType_idx" ON "app_quikinfra"."Equipment_deployment"("recordType");
CREATE INDEX IF NOT EXISTS "Equipment_deployment_equipmentId_idx" ON "app_quikinfra"."Equipment_deployment"("equipmentId");
CREATE INDEX IF NOT EXISTS "Equipment_deployment_status_idx" ON "app_quikinfra"."Equipment_deployment"("status");
CREATE INDEX IF NOT EXISTS "Equipment_deployment_transferDate_idx" ON "app_quikinfra"."Equipment_deployment"("transferDate");
CREATE INDEX IF NOT EXISTS "Equipment_deployment_expiryDate_idx" ON "app_quikinfra"."Equipment_deployment"("expiryDate");

DROP TABLE IF EXISTS "app_quikinfra"."Equipment_transfers";
DROP TABLE IF EXISTS "app_quikinfra"."Equipment_documents";

-- ── 3. Hire & Rent: 3 tables → Hire_rent_records ───────────────────────────
CREATE TABLE IF NOT EXISTS "app_quikinfra"."Hire_rent_records" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "recordType" TEXT NOT NULL,
  "referenceNumber" TEXT,
  "direction" TEXT,
  "rateBasis" TEXT,
  "equipmentId" TEXT,
  "equipmentType" TEXT,
  "vendorId" TEXT,
  "customerId" TEXT,
  "projectId" TEXT,
  "rate" DECIMAL(18,2),
  "sacCode" TEXT,
  "gstPercent" DECIMAL(5,2),
  "minGuaranteedQty" DECIMAL(18,4),
  "effectiveFrom" TIMESTAMP(3),
  "periodFrom" TIMESTAMP(3),
  "periodTo" TIMESTAMP(3),
  "vendorClaimedQty" DECIMAL(18,4),
  "loggedQty" DECIMAL(18,4),
  "billableQty" DECIMAL(18,4),
  "varianceQty" DECIMAL(18,4),
  "payableAmount" DECIMAL(18,2),
  "gstAmount" DECIMAL(18,2),
  "totalAmount" DECIMAL(18,2),
  "amount" DECIMAL(18,2),
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  CONSTRAINT "Hire_rent_records_pkey" PRIMARY KEY ("id")
);

INSERT INTO "app_quikinfra"."Hire_rent_records" (
  "id", "orgId", "recordType", "direction", "rateBasis", "equipmentId", "equipmentType",
  "vendorId", "customerId", "rate", "sacCode", "gstPercent", "minGuaranteedQty",
  "effectiveFrom", "status", "createdAt", "updatedAt", "createdBy", "updatedBy"
)
SELECT
  "id", "orgId", 'rate', "direction", "rateBasis", "equipmentId", "equipmentType",
  "vendorId", "customerId", "rate", "sacCode", "gstPercent", "minGuaranteedQty",
  "effectiveFrom", "status", "createdAt", "updatedAt", "createdBy", "updatedBy"
FROM "app_quikinfra"."Hire_rates"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "app_quikinfra"."Hire_rent_records" (
  "id", "orgId", "recordType", "referenceNumber", "equipmentId", "vendorId",
  "periodFrom", "periodTo", "rate", "rateBasis", "vendorClaimedQty", "minGuaranteedQty",
  "gstPercent", "loggedQty", "billableQty", "varianceQty", "payableAmount", "gstAmount",
  "totalAmount", "status", "createdAt", "updatedAt", "createdBy", "updatedBy"
)
SELECT
  "id", "orgId", 'hire_in', "verificationNumber", "equipmentId", "vendorId",
  "periodFrom", "periodTo", "rate", "rateBasis", "vendorClaimedQty", "minGuaranteedQty",
  "gstPercent", "loggedQty", "billableQty", "varianceQty", "payableAmount", "gstAmount",
  "totalAmount", "status", "createdAt", "updatedAt", "createdBy", "updatedBy"
FROM "app_quikinfra"."Hire_in_verifications"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "app_quikinfra"."Hire_rent_records" (
  "id", "orgId", "recordType", "referenceNumber", "equipmentId", "customerId", "projectId",
  "periodFrom", "periodTo", "rateBasis", "rate", "minGuaranteedQty", "sacCode", "gstPercent",
  "billableQty", "amount", "gstAmount", "totalAmount", "status",
  "createdAt", "updatedAt", "createdBy", "updatedBy"
)
SELECT
  "id", "orgId", 'rent_out', "billNumber", "equipmentId", "customerId", "projectId",
  "periodFrom", "periodTo", "rateBasis", "rate", "minGuaranteedQty", "sacCode", "gstPercent",
  "billableQty", "amount", "gstAmount", "totalAmount", "status",
  "createdAt", "updatedAt", "createdBy", "updatedBy"
FROM "app_quikinfra"."Rent_out_bills"
ON CONFLICT ("id") DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS "Hire_rent_records_orgId_referenceNumber_key"
  ON "app_quikinfra"."Hire_rent_records"("orgId", "referenceNumber");
CREATE INDEX IF NOT EXISTS "Hire_rent_records_orgId_idx" ON "app_quikinfra"."Hire_rent_records"("orgId");
CREATE INDEX IF NOT EXISTS "Hire_rent_records_recordType_idx" ON "app_quikinfra"."Hire_rent_records"("recordType");
CREATE INDEX IF NOT EXISTS "Hire_rent_records_direction_idx" ON "app_quikinfra"."Hire_rent_records"("direction");
CREATE INDEX IF NOT EXISTS "Hire_rent_records_equipmentId_idx" ON "app_quikinfra"."Hire_rent_records"("equipmentId");
CREATE INDEX IF NOT EXISTS "Hire_rent_records_status_idx" ON "app_quikinfra"."Hire_rent_records"("status");
CREATE INDEX IF NOT EXISTS "Hire_rent_records_periodFrom_idx" ON "app_quikinfra"."Hire_rent_records"("periodFrom");

DROP TABLE IF EXISTS "app_quikinfra"."Hire_rates";
DROP TABLE IF EXISTS "app_quikinfra"."Hire_in_verifications";
DROP TABLE IF EXISTS "app_quikinfra"."Rent_out_bills";

-- ── 4. Fixed assets: 4 tables → Fixed_asset_transactions ───────────────────
CREATE TABLE IF NOT EXISTS "app_quikinfra"."Fixed_asset_transactions" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "recordType" TEXT NOT NULL,
  "referenceNumber" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "issuedToType" TEXT,
  "issuedTo" TEXT,
  "projectId" TEXT,
  "quantity" DECIMAL(18,4),
  "pendingQty" DECIMAL(18,4),
  "gatePassNo" TEXT,
  "expectedReturnDate" TIMESTAMP(3),
  "returnable" BOOLEAN,
  "notes" TEXT,
  "sourceProjectId" TEXT,
  "destinationProjectId" TEXT,
  "destinationLocation" TEXT,
  "transferDate" TIMESTAMP(3),
  "reason" TEXT,
  "problem" TEXT,
  "repairCost" DECIMAL(18,2),
  "bookQty" DECIMAL(18,4),
  "countedQty" DECIMAL(18,4),
  "varianceQty" DECIMAL(18,4),
  "auditDate" TIMESTAMP(3),
  "remarks" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  CONSTRAINT "Fixed_asset_transactions_pkey" PRIMARY KEY ("id")
);

INSERT INTO "app_quikinfra"."Fixed_asset_transactions" (
  "id", "orgId", "recordType", "referenceNumber", "assetId", "status",
  "issuedToType", "issuedTo", "projectId", "quantity", "pendingQty", "gatePassNo",
  "expectedReturnDate", "returnable", "notes",
  "createdAt", "updatedAt", "createdBy", "updatedBy"
)
SELECT
  "id", "orgId", 'issuance', "issuanceNumber", "assetId", "status",
  "issuedToType", "issuedTo", "projectId", "quantity", "pendingQty", "gatePassNo",
  "expectedReturnDate", "returnable", "notes",
  "createdAt", "updatedAt", "createdBy", "updatedBy"
FROM "app_quikinfra"."Fixed_asset_issuances"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "app_quikinfra"."Fixed_asset_transactions" (
  "id", "orgId", "recordType", "referenceNumber", "assetId", "status",
  "sourceProjectId", "destinationProjectId", "destinationLocation", "quantity",
  "transferDate", "gatePassNo", "reason",
  "createdAt", "updatedAt", "createdBy", "updatedBy"
)
SELECT
  "id", "orgId", 'transfer', "transferNumber", "assetId", "status",
  "sourceProjectId", "destinationProjectId", "destinationLocation", "quantity",
  "transferDate", "gatePassNo", "reason",
  "createdAt", "updatedAt", "createdBy", "updatedBy"
FROM "app_quikinfra"."Fixed_asset_transfers"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "app_quikinfra"."Fixed_asset_transactions" (
  "id", "orgId", "recordType", "referenceNumber", "assetId", "status",
  "quantity", "problem", "repairCost",
  "createdAt", "updatedAt", "createdBy", "updatedBy"
)
SELECT
  "id", "orgId", 'repair', "repairNumber", "assetId", "status",
  "quantity", "problem", "repairCost",
  "createdAt", "updatedAt", "createdBy", "updatedBy"
FROM "app_quikinfra"."Fixed_asset_repairs"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "app_quikinfra"."Fixed_asset_transactions" (
  "id", "orgId", "recordType", "referenceNumber", "assetId", "status",
  "bookQty", "countedQty", "varianceQty", "auditDate", "remarks",
  "createdAt", "updatedAt", "createdBy", "updatedBy"
)
SELECT
  "id", "orgId", 'audit', "auditNumber", "assetId", "status",
  "bookQty", "countedQty", "varianceQty", "auditDate", "remarks",
  "createdAt", "updatedAt", "createdBy", "updatedBy"
FROM "app_quikinfra"."Fixed_asset_audits"
ON CONFLICT ("id") DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS "Fixed_asset_transactions_orgId_referenceNumber_key"
  ON "app_quikinfra"."Fixed_asset_transactions"("orgId", "referenceNumber");
CREATE INDEX IF NOT EXISTS "Fixed_asset_transactions_orgId_idx" ON "app_quikinfra"."Fixed_asset_transactions"("orgId");
CREATE INDEX IF NOT EXISTS "Fixed_asset_transactions_recordType_idx" ON "app_quikinfra"."Fixed_asset_transactions"("recordType");
CREATE INDEX IF NOT EXISTS "Fixed_asset_transactions_assetId_idx" ON "app_quikinfra"."Fixed_asset_transactions"("assetId");
CREATE INDEX IF NOT EXISTS "Fixed_asset_transactions_status_idx" ON "app_quikinfra"."Fixed_asset_transactions"("status");

DROP TABLE IF EXISTS "app_quikinfra"."Fixed_asset_issuances";
DROP TABLE IF EXISTS "app_quikinfra"."Fixed_asset_transfers";
DROP TABLE IF EXISTS "app_quikinfra"."Fixed_asset_repairs";
DROP TABLE IF EXISTS "app_quikinfra"."Fixed_asset_audits";


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 09. 20260622150000_fleet_dashboard_table                                   ║
-- ║     Fleet Dashboard — 6th Machinery & Equipment module table              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS "app_quikinfra"."Fleet_dashboard" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "cacheKey" TEXT NOT NULL,
  "projectId" TEXT,
  "periodFrom" TIMESTAMP(3),
  "periodTo" TIMESTAMP(3),
  "payload" JSONB NOT NULL,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Fleet_dashboard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Fleet_dashboard_orgId_cacheKey_key"
  ON "app_quikinfra"."Fleet_dashboard"("orgId", "cacheKey");
CREATE INDEX IF NOT EXISTS "Fleet_dashboard_orgId_idx" ON "app_quikinfra"."Fleet_dashboard"("orgId");
CREATE INDEX IF NOT EXISTS "Fleet_dashboard_projectId_idx" ON "app_quikinfra"."Fleet_dashboard"("projectId");
CREATE INDEX IF NOT EXISTS "Fleet_dashboard_computedAt_idx" ON "app_quikinfra"."Fleet_dashboard"("computedAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Fleet_dashboard_orgId_fkey') THEN
    ALTER TABLE "app_quikinfra"."Fleet_dashboard"
      ADD CONSTRAINT "Fleet_dashboard_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Fleet_dashboard_projectId_fkey') THEN
    ALTER TABLE "app_quikinfra"."Fleet_dashboard"
      ADD CONSTRAINT "Fleet_dashboard_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "app_quikinfra"."Projects"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 10. 20260623120000_drop_cn_approval_rule_request                           ║
-- ║     Drop orphaned threshold-based approval system                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- These were never wired into any document flow (checkApprovalGate was never
-- called); live approvals run on the workflow engine (CnApprovalInstance /
-- CnApprovalHistory).

DROP TABLE IF EXISTS "app_quikinfra"."CnApprovalRequest";
DROP TABLE IF EXISTS "app_quikinfra"."CnApprovalRule";


COMMIT;

-- ============================================================================
-- End of combined migration.
-- ============================================================================
