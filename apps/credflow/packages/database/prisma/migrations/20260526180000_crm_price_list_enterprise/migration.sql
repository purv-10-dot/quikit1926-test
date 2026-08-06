-- Enterprise price list: audit, account/opp defaults, item metadata, soft-delete items

ALTER TABLE "app_quikcrm"."CrmPriceList"
  ADD COLUMN IF NOT EXISTS "updatedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "regionCode" TEXT,
  ADD COLUMN IF NOT EXISTS "customerTier" TEXT,
  ADD COLUMN IF NOT EXISTS "versionNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "sourcePriceListId" TEXT;

ALTER TABLE "app_quikcrm"."CrmPriceListItem"
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "floorPrice" DECIMAL(18, 2),
  ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "updatedByUserId" TEXT;

ALTER TABLE "app_quikcrm"."CrmAccount"
  ADD COLUMN IF NOT EXISTS "defaultPriceListId" TEXT;

ALTER TABLE "app_quikcrm"."CrmOpportunity"
  ADD COLUMN IF NOT EXISTS "priceListId" TEXT;

CREATE TABLE IF NOT EXISTS "app_quikcrm"."CrmPriceListAuditLog" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "priceListId" TEXT NOT NULL,
  "itemId" TEXT,
  "action" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "changes" JSONB,
  "userId" TEXT,
  "userName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmPriceListAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CrmPriceListAuditLog_tenantId_priceListId_createdAt_idx"
  ON "app_quikcrm"."CrmPriceListAuditLog"("tenantId", "priceListId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "CrmPriceListItem_tenantId_priceListId_deletedAt_idx"
  ON "app_quikcrm"."CrmPriceListItem"("tenantId", "priceListId", "deletedAt");

CREATE INDEX IF NOT EXISTS "CrmAccount_tenantId_defaultPriceListId_idx"
  ON "app_quikcrm"."CrmAccount"("tenantId", "defaultPriceListId");

CREATE INDEX IF NOT EXISTS "CrmOpportunity_tenantId_priceListId_idx"
  ON "app_quikcrm"."CrmOpportunity"("tenantId", "priceListId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmPriceListItem_tenantId_priceListId_productId_minQuantity_key"
  ON "app_quikcrm"."CrmPriceListItem"("tenantId", "priceListId", "productId", "minQuantity")
  WHERE "deletedAt" IS NULL;
