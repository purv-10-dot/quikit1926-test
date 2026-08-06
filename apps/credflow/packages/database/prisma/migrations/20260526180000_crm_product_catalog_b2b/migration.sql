-- Product catalog B2B: taxonomy, variants, inventory, GST split, custom fields

-- Enums
DO $$ BEGIN
  CREATE TYPE "app_quikcrm"."CrmProductTaxonomyKind" AS ENUM (
    'Category',
    'Subcategory',
    'Brand',
    'Family'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "app_quikcrm"."CrmStockMovementType" AS ENUM (
    'Receipt',
    'Issue',
    'Adjustment',
    'Reserve',
    'Release',
    'Transfer'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Taxonomy
CREATE TABLE IF NOT EXISTS "app_quikcrm"."CrmProductTaxonomy" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "kind" "app_quikcrm"."CrmProductTaxonomyKind" NOT NULL,
  "name" TEXT NOT NULL,
  "parentId" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmProductTaxonomy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmProductTaxonomy_tenantId_kind_name_parentId_key"
  ON "app_quikcrm"."CrmProductTaxonomy"("tenantId", "kind", "name", "parentId");
CREATE INDEX IF NOT EXISTS "CrmProductTaxonomy_tenantId_kind_idx"
  ON "app_quikcrm"."CrmProductTaxonomy"("tenantId", "kind");
CREATE INDEX IF NOT EXISTS "CrmProductTaxonomy_tenantId_parentId_idx"
  ON "app_quikcrm"."CrmProductTaxonomy"("tenantId", "parentId");

ALTER TABLE "app_quikcrm"."CrmProductTaxonomy"
  ADD CONSTRAINT "CrmProductTaxonomy_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "app_quikcrm"."CrmProductTaxonomy"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CrmProduct extensions
ALTER TABLE "app_quikcrm"."CrmProduct" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
ALTER TABLE "app_quikcrm"."CrmProduct" ADD COLUMN IF NOT EXISTS "subcategoryId" TEXT;
ALTER TABLE "app_quikcrm"."CrmProduct" ADD COLUMN IF NOT EXISTS "brandId" TEXT;
ALTER TABLE "app_quikcrm"."CrmProduct" ADD COLUMN IF NOT EXISTS "familyId" TEXT;
ALTER TABLE "app_quikcrm"."CrmProduct" ADD COLUMN IF NOT EXISTS "barcode" TEXT;
ALTER TABLE "app_quikcrm"."CrmProduct" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "app_quikcrm"."CrmProduct" ADD COLUMN IF NOT EXISTS "sacCode" TEXT;
ALTER TABLE "app_quikcrm"."CrmProduct" ADD COLUMN IF NOT EXISTS "cgstRate" DECIMAL(5,2);
ALTER TABLE "app_quikcrm"."CrmProduct" ADD COLUMN IF NOT EXISTS "sgstRate" DECIMAL(5,2);
ALTER TABLE "app_quikcrm"."CrmProduct" ADD COLUMN IF NOT EXISTS "igstRate" DECIMAL(5,2);
ALTER TABLE "app_quikcrm"."CrmProduct" ADD COLUMN IF NOT EXISTS "manufacturer" TEXT;
ALTER TABLE "app_quikcrm"."CrmProduct" ADD COLUMN IF NOT EXISTS "warrantyMonths" INTEGER;
ALTER TABLE "app_quikcrm"."CrmProduct" ADD COLUMN IF NOT EXISTS "weightKg" DECIMAL(10,3);
ALTER TABLE "app_quikcrm"."CrmProduct" ADD COLUMN IF NOT EXISTS "lengthCm" DECIMAL(10,2);
ALTER TABLE "app_quikcrm"."CrmProduct" ADD COLUMN IF NOT EXISTS "widthCm" DECIMAL(10,2);
ALTER TABLE "app_quikcrm"."CrmProduct" ADD COLUMN IF NOT EXISTS "heightCm" DECIMAL(10,2);
ALTER TABLE "app_quikcrm"."CrmProduct" ADD COLUMN IF NOT EXISTS "serialTracked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_quikcrm"."CrmProduct" ADD COLUMN IF NOT EXISTS "dynamicFields" JSONB;

CREATE INDEX IF NOT EXISTS "CrmProduct_tenantId_categoryId_idx"
  ON "app_quikcrm"."CrmProduct"("tenantId", "categoryId");
CREATE INDEX IF NOT EXISTS "CrmProduct_tenantId_brandId_idx"
  ON "app_quikcrm"."CrmProduct"("tenantId", "brandId");
CREATE INDEX IF NOT EXISTS "CrmProduct_tenantId_barcode_idx"
  ON "app_quikcrm"."CrmProduct"("tenantId", "barcode");

ALTER TABLE "app_quikcrm"."CrmProduct" DROP CONSTRAINT IF EXISTS "CrmProduct_categoryId_fkey";
ALTER TABLE "app_quikcrm"."CrmProduct" ADD CONSTRAINT "CrmProduct_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "app_quikcrm"."CrmProductTaxonomy"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app_quikcrm"."CrmProduct" DROP CONSTRAINT IF EXISTS "CrmProduct_subcategoryId_fkey";
ALTER TABLE "app_quikcrm"."CrmProduct" ADD CONSTRAINT "CrmProduct_subcategoryId_fkey"
  FOREIGN KEY ("subcategoryId") REFERENCES "app_quikcrm"."CrmProductTaxonomy"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app_quikcrm"."CrmProduct" DROP CONSTRAINT IF EXISTS "CrmProduct_brandId_fkey";
ALTER TABLE "app_quikcrm"."CrmProduct" ADD CONSTRAINT "CrmProduct_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "app_quikcrm"."CrmProductTaxonomy"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app_quikcrm"."CrmProduct" DROP CONSTRAINT IF EXISTS "CrmProduct_familyId_fkey";
ALTER TABLE "app_quikcrm"."CrmProduct" ADD CONSTRAINT "CrmProduct_familyId_fkey"
  FOREIGN KEY ("familyId") REFERENCES "app_quikcrm"."CrmProductTaxonomy"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Variants
CREATE TABLE IF NOT EXISTS "app_quikcrm"."CrmProductVariant" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT,
  "attributes" JSONB,
  "barcode" TEXT,
  "listPrice" DECIMAL(18,2),
  "standardCost" DECIMAL(18,2),
  "gstRate" DECIMAL(5,2),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmProductVariant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmProductVariant_tenantId_sku_key"
  ON "app_quikcrm"."CrmProductVariant"("tenantId", "sku");
CREATE INDEX IF NOT EXISTS "CrmProductVariant_tenantId_productId_idx"
  ON "app_quikcrm"."CrmProductVariant"("tenantId", "productId");

ALTER TABLE "app_quikcrm"."CrmProductVariant" DROP CONSTRAINT IF EXISTS "CrmProductVariant_productId_fkey";
ALTER TABLE "app_quikcrm"."CrmProductVariant" ADD CONSTRAINT "CrmProductVariant_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "app_quikcrm"."CrmProduct"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Warehouses
CREATE TABLE IF NOT EXISTS "app_quikcrm"."CrmWarehouse" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmWarehouse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmWarehouse_tenantId_code_key"
  ON "app_quikcrm"."CrmWarehouse"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "CrmWarehouse_tenantId_idx"
  ON "app_quikcrm"."CrmWarehouse"("tenantId");

-- Inventory
CREATE TABLE IF NOT EXISTS "app_quikcrm"."CrmProductInventory" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT,
  "warehouseId" TEXT NOT NULL,
  "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
  "quantityReserved" INTEGER NOT NULL DEFAULT 0,
  "lowStockThreshold" INTEGER,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmProductInventory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmProductInventory_tenantId_productId_variantId_warehouseId_key"
  ON "app_quikcrm"."CrmProductInventory"("tenantId", "productId", "variantId", "warehouseId");
CREATE INDEX IF NOT EXISTS "CrmProductInventory_tenantId_productId_idx"
  ON "app_quikcrm"."CrmProductInventory"("tenantId", "productId");
CREATE INDEX IF NOT EXISTS "CrmProductInventory_tenantId_warehouseId_idx"
  ON "app_quikcrm"."CrmProductInventory"("tenantId", "warehouseId");

ALTER TABLE "app_quikcrm"."CrmProductInventory" DROP CONSTRAINT IF EXISTS "CrmProductInventory_productId_fkey";
ALTER TABLE "app_quikcrm"."CrmProductInventory" ADD CONSTRAINT "CrmProductInventory_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "app_quikcrm"."CrmProduct"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikcrm"."CrmProductInventory" DROP CONSTRAINT IF EXISTS "CrmProductInventory_variantId_fkey";
ALTER TABLE "app_quikcrm"."CrmProductInventory" ADD CONSTRAINT "CrmProductInventory_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "app_quikcrm"."CrmProductVariant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikcrm"."CrmProductInventory" DROP CONSTRAINT IF EXISTS "CrmProductInventory_warehouseId_fkey";
ALTER TABLE "app_quikcrm"."CrmProductInventory" ADD CONSTRAINT "CrmProductInventory_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "app_quikcrm"."CrmWarehouse"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Stock movements
CREATE TABLE IF NOT EXISTS "app_quikcrm"."CrmStockMovement" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT,
  "warehouseId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "movementType" "app_quikcrm"."CrmStockMovementType" NOT NULL,
  "reference" TEXT,
  "notes" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmStockMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CrmStockMovement_tenantId_productId_createdAt_idx"
  ON "app_quikcrm"."CrmStockMovement"("tenantId", "productId", "createdAt");
CREATE INDEX IF NOT EXISTS "CrmStockMovement_tenantId_warehouseId_idx"
  ON "app_quikcrm"."CrmStockMovement"("tenantId", "warehouseId");

ALTER TABLE "app_quikcrm"."CrmStockMovement" DROP CONSTRAINT IF EXISTS "CrmStockMovement_productId_fkey";
ALTER TABLE "app_quikcrm"."CrmStockMovement" ADD CONSTRAINT "CrmStockMovement_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "app_quikcrm"."CrmProduct"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikcrm"."CrmStockMovement" DROP CONSTRAINT IF EXISTS "CrmStockMovement_variantId_fkey";
ALTER TABLE "app_quikcrm"."CrmStockMovement" ADD CONSTRAINT "CrmStockMovement_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "app_quikcrm"."CrmProductVariant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikcrm"."CrmStockMovement" DROP CONSTRAINT IF EXISTS "CrmStockMovement_warehouseId_fkey";
ALTER TABLE "app_quikcrm"."CrmStockMovement" ADD CONSTRAINT "CrmStockMovement_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "app_quikcrm"."CrmWarehouse"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Product images
CREATE TABLE IF NOT EXISTS "app_quikcrm"."CrmProductImage" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "label" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmProductImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CrmProductImage_tenantId_productId_idx"
  ON "app_quikcrm"."CrmProductImage"("tenantId", "productId");

ALTER TABLE "app_quikcrm"."CrmProductImage" DROP CONSTRAINT IF EXISTS "CrmProductImage_productId_fkey";
ALTER TABLE "app_quikcrm"."CrmProductImage" ADD CONSTRAINT "CrmProductImage_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "app_quikcrm"."CrmProduct"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
