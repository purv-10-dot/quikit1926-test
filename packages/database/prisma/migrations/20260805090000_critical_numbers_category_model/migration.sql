-- Critical Numbers v2 — replace the two-mode model with a single
-- category/unit/frequency model scored on KPI's percentage bands.
--
-- Removes: mode, thresholdGreat/Good/Concerned/Bad, startDate, endDate
-- Adds:    categoryId (FK, required), subCategoryId (FK, optional),
--          measurementUnit (required), unit (optional), frequency (required)
-- New:     SubCategory — one flat level under CategoryMaster.
--
-- CategoryMaster's TABLE is deliberately untouched. The Prisma model gained
-- two back-relation fields (`criticalNumbers`, `subCategories`), but those are
-- virtual — `prisma migrate diff` emits no ALTER against it, and OPSP's use of
-- categories is unaffected.
--
-- ── DESTRUCTIVE: existing CriticalNumber rows are deleted ──
-- `categoryId` is NOT NULL with no default, so it cannot be added to a table
-- that already has rows unless every row can be backfilled. There is no
-- backfill source: the only org holding CriticalNumbers (the E2E test tenant)
-- has zero CategoryMaster rows to point at. The feature is unreleased and
-- every existing row is test data, so the rows are cleared instead.
-- CriticalNumberUpdate rows cascade away via the existing FK.
-- If any environment holds Critical Numbers worth keeping, STOP and backfill
-- a category per row before applying this.
DELETE FROM "app_quikscale"."CriticalNumber";

-- CreateTable
CREATE TABLE "app_quikscale"."SubCategory" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubCategory_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "app_quikscale"."CriticalNumber" DROP COLUMN "endDate",
DROP COLUMN "mode",
DROP COLUMN "startDate",
DROP COLUMN "thresholdBad",
DROP COLUMN "thresholdConcerned",
DROP COLUMN "thresholdGood",
DROP COLUMN "thresholdGreat",
ADD COLUMN     "categoryId" TEXT NOT NULL,
ADD COLUMN     "frequency" TEXT NOT NULL,
ADD COLUMN     "measurementUnit" TEXT NOT NULL,
ADD COLUMN     "subCategoryId" TEXT,
ADD COLUMN     "unit" TEXT;

-- CreateIndex
CREATE INDEX "SubCategory_orgId_idx" ON "app_quikscale"."SubCategory"("orgId");

-- CreateIndex
CREATE INDEX "SubCategory_categoryId_idx" ON "app_quikscale"."SubCategory"("categoryId");

-- CreateIndex: a sub-category name is unique within its category, not org-wide,
-- so "Retention" can live under both Sales and Support.
CREATE UNIQUE INDEX "SubCategory_orgId_categoryId_name_key" ON "app_quikscale"."SubCategory"("orgId", "categoryId", "name");

-- CreateIndex
CREATE INDEX "CriticalNumber_categoryId_idx" ON "app_quikscale"."CriticalNumber"("categoryId");

-- CreateIndex
CREATE INDEX "CriticalNumber_subCategoryId_idx" ON "app_quikscale"."CriticalNumber"("subCategoryId");

-- AddForeignKey: RESTRICT — deleting a category must not silently delete the
-- metrics filed under it.
ALTER TABLE "app_quikscale"."CriticalNumber" ADD CONSTRAINT "CriticalNumber_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "app_quikscale"."CategoryMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: SET NULL — a sub-category is an optional refinement, so losing
-- it should downgrade the record, not delete it.
ALTER TABLE "app_quikscale"."CriticalNumber" ADD CONSTRAINT "CriticalNumber_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "app_quikscale"."SubCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikscale"."SubCategory" ADD CONSTRAINT "SubCategory_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: CASCADE — a sub-category has no meaning without its parent.
ALTER TABLE "app_quikscale"."SubCategory" ADD CONSTRAINT "SubCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "app_quikscale"."CategoryMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
