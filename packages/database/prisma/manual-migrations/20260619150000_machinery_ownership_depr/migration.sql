-- Machinery ownership & depreciation fields for fleet cost sheet

ALTER TABLE "app_quikinfra"."Machinery"
  ADD COLUMN IF NOT EXISTS "ownershipType" TEXT NOT NULL DEFAULT 'owned',
  ADD COLUMN IF NOT EXISTS "capitalisationCost" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "deprRate" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "deprMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "capitalisationDate" TIMESTAMP(3);
