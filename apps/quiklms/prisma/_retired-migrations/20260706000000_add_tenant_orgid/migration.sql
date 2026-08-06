-- Phase-3 fold: link each LMS Tenant to its platform quikit Org.
-- Nullable so existing rows are valid; UNIQUE is sparse in Postgres (NULLs are
-- distinct), so many un-backfilled tenants can coexist until the backfill runs.
-- Backfill: prisma/backfill-tenant-orgid.ts (matches Org.slug === Tenant.subdomain).

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "orgId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tenants_orgId_key" ON "tenants"("orgId");
