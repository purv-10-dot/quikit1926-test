-- CreateTable: personal analytics workspace
CREATE TABLE IF NOT EXISTS "app_quikinsight"."QiWorkspace" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "orgId"       TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QiWorkspace_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "QiWorkspace_userId_name_key"
    ON "app_quikinsight"."QiWorkspace"("userId", "name");

CREATE INDEX IF NOT EXISTS "QiWorkspace_userId_idx"
    ON "app_quikinsight"."QiWorkspace"("userId");

-- Seed a "Default" workspace for every existing user that has a platform connection.
INSERT INTO "app_quikinsight"."QiWorkspace" ("id", "userId", "orgId", "name", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    pc."userId",
    pc."orgId",
    'Default',
    NOW(),
    NOW()
FROM (
    SELECT DISTINCT "userId", "orgId" FROM "app_quikinsight"."QiPlatformConnection"
) pc
ON CONFLICT DO NOTHING;

-- AddColumn workspaceId to QiPlatformConnection (nullable first so existing rows survive)
ALTER TABLE "app_quikinsight"."QiPlatformConnection"
    ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;

-- Backfill: point existing connections to the user's Default workspace
UPDATE "app_quikinsight"."QiPlatformConnection" pc
SET "workspaceId" = w."id"
FROM "app_quikinsight"."QiWorkspace" w
WHERE w."userId" = pc."userId"
  AND w."name"   = 'Default'
  AND pc."workspaceId" IS NULL;

-- Now make it non-nullable
ALTER TABLE "app_quikinsight"."QiPlatformConnection"
    ALTER COLUMN "workspaceId" SET NOT NULL;

-- Drop old per-user-platform unique (Prisma creates unique indexes, not constraints)
SET search_path TO "app_quikinsight";
DROP INDEX IF EXISTS "QiPlatformConnection_userId_platform_key";
DROP INDEX IF EXISTS "userId_platform";
ALTER TABLE "app_quikinsight"."QiPlatformConnection"
    DROP CONSTRAINT IF EXISTS "userId_platform";

CREATE UNIQUE INDEX IF NOT EXISTS "workspaceId_platform"
    ON "app_quikinsight"."QiPlatformConnection"("workspaceId", "platform");

CREATE INDEX IF NOT EXISTS "QiPlatformConnection_workspaceId_idx"
    ON "app_quikinsight"."QiPlatformConnection"("workspaceId");

-- AddForeignKey
ALTER TABLE "app_quikinsight"."QiPlatformConnection"
    ADD CONSTRAINT "QiPlatformConnection_workspaceId_fkey"
    FOREIGN KEY ("workspaceId")
    REFERENCES "app_quikinsight"."QiWorkspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
