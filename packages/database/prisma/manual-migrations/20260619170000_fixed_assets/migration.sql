-- Fixed Asset / Tools — depreciation fields + transactional tables

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
