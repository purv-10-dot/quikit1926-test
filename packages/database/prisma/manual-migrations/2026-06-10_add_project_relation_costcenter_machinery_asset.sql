-- ============================================================================
-- Manual DB migration — add Project relation to Cost Centre / Machinery / Asset
-- Schema: app_quikinfra
-- Reason: schema.prisma now declares
--           CnCostCenter.project / CnMachinery.project / CnAsset.project
--         (CnProject -> @relation on the existing `projectId` column) so the
--         masters lists can show the Project NAME. The `projectId` columns
--         already exist; this migration only adds the supporting indexes and
--         foreign-key constraints to bring the DB in sync with the schema.
--
-- Run this against BOTH the local and the central (production) databases.
-- It is idempotent — safe to run more than once.
--
-- NOTE: `prisma generate` alone (regenerating the client) is enough to make
-- the `include: { project }` reads work, because Prisma joins on the declared
-- relation fields. This file is only needed to add the physical FK + index so
-- the database matches the Prisma schema (referential integrity + perf).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. OPTIONAL PRE-CHECK — find orphan projectId values that would make the
--    FK creation fail (a projectId that points at a non-existent Project).
--    If any rows are returned, clean them (set projectId = NULL) before
--    running the ALTER ... ADD CONSTRAINT statements below.
-- ---------------------------------------------------------------------------
-- SELECT id, "projectId" FROM "app_quikinfra"."Cost_centers" cc
--   WHERE cc."projectId" IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM "app_quikinfra"."Projects" p WHERE p.id = cc."projectId");
-- SELECT id, "projectId" FROM "app_quikinfra"."Machinery" m
--   WHERE m."projectId" IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM "app_quikinfra"."Projects" p WHERE p.id = m."projectId");
-- SELECT id, "projectId" FROM "app_quikinfra"."Assets" a
--   WHERE a."projectId" IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM "app_quikinfra"."Projects" p WHERE p.id = a."projectId");

-- To null-out orphans (uncomment if the pre-check returned rows):
-- UPDATE "app_quikinfra"."Cost_centers" cc SET "projectId" = NULL
--   WHERE cc."projectId" IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM "app_quikinfra"."Projects" p WHERE p.id = cc."projectId");
-- UPDATE "app_quikinfra"."Machinery" m SET "projectId" = NULL
--   WHERE m."projectId" IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM "app_quikinfra"."Projects" p WHERE p.id = m."projectId");
-- UPDATE "app_quikinfra"."Assets" a SET "projectId" = NULL
--   WHERE a."projectId" IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM "app_quikinfra"."Projects" p WHERE p.id = a."projectId");

-- ---------------------------------------------------------------------------
-- 1. Indexes on the FK column (Assets already has one; add the two missing).
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "Cost_centers_projectId_idx"
  ON "app_quikinfra"."Cost_centers" ("projectId");

CREATE INDEX IF NOT EXISTS "Machinery_projectId_idx"
  ON "app_quikinfra"."Machinery" ("projectId");

CREATE INDEX IF NOT EXISTS "Assets_projectId_idx"
  ON "app_quikinfra"."Assets" ("projectId");

-- ---------------------------------------------------------------------------
-- 2. Foreign-key constraints -> Projects(id).
--    Matches Prisma's default for an optional relation:
--      ON DELETE SET NULL  ON UPDATE CASCADE
--    Names match Prisma's convention (<table>_<column>_fkey) so the schema
--    and DB stay aligned. Guarded so re-running is a no-op.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Cost_centers_projectId_fkey'
  ) THEN
    ALTER TABLE "app_quikinfra"."Cost_centers"
      ADD CONSTRAINT "Cost_centers_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "app_quikinfra"."Projects"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Machinery_projectId_fkey'
  ) THEN
    ALTER TABLE "app_quikinfra"."Machinery"
      ADD CONSTRAINT "Machinery_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "app_quikinfra"."Projects"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Assets_projectId_fkey'
  ) THEN
    ALTER TABLE "app_quikinfra"."Assets"
      ADD CONSTRAINT "Assets_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "app_quikinfra"."Projects"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
