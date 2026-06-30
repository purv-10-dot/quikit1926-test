-- Consolidate Machinery & Equipment module tables (11 → 4 + maintenance JSON spares)

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
