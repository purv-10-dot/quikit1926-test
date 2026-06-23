-- Hire & Rent — rate master, hire-in verification, rent-out billing

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
