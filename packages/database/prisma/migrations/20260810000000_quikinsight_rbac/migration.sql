-- QuikInsight: add the per-app RBAC v2 tables the app was missing entirely.
--
-- WHY: the Admin Portal's role dropdown (apps/admin/app/api/roles/route.ts)
-- reads `app_<slug>."AppRole"` with raw SQL and, per its documented contract,
-- returns an EMPTY array when that table does not exist. QuikInsight shipped
-- with only `QiUserRole` (a free-text role column) and no AppRole family, so
-- every super-admin who tried to grant a user access to QuikInsight saw
-- "No roles available" and could not complete the assignment.
--
-- The same five tables back `assignAppRoles()` /`mirrorAppRoleToCentral()` in
-- packages/auth, so without them a central invitation carrying QuikInsight in
-- `inviteAppIds` could never seed a QuikInsight role either.
--
-- The catalogue is exactly two roles — ADMIN and VIEWER. See the backfill at the
-- bottom of this file.
--
-- SAFETY: purely additive. Creates one enum type and five new tables in the
-- app_quikinsight schema; touches no existing table, column, row or
-- constraint. `QiUserRole` is deliberately left in place and still drives
-- authorization in apps/quikinsight/lib/rbac.ts — the seed helper keeps the
-- two in sync. Safe to apply before, during or after the code deploy.
--
-- No cross-schema FK is created: `orgId` and `appId` stay scalars referencing
-- quikit.Org / quikit.App by value, matching every other Qi* table here.

CREATE SCHEMA IF NOT EXISTS "app_quikinsight";

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "app_quikinsight"."QiPermissionGrantKind" AS ENUM ('GRANT', 'DENY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "app_quikinsight"."AppRole" (
    "id"          TEXT NOT NULL,
    "orgId"       TEXT NOT NULL,
    "appId"       TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "isSystem"    BOOLEAN NOT NULL DEFAULT false,
    "isDefault"   BOOLEAN NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy"   TEXT,

    CONSTRAINT "AppRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "app_quikinsight"."RolePermission" (
    "id"       TEXT NOT NULL,
    "roleId"   TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action"   TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "app_quikinsight"."RoleNavigation" (
    "id"     TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "navKey" TEXT NOT NULL,

    CONSTRAINT "RoleNavigation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "app_quikinsight"."UserAppRole" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "orgId"      TEXT NOT NULL,
    "roleId"     TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,
    "expiresAt"  TIMESTAMP(3),

    CONSTRAINT "UserAppRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "app_quikinsight"."UserPermissionExtra" (
    "id"        TEXT NOT NULL,
    "orgId"     TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "resource"  TEXT NOT NULL,
    "action"    TEXT NOT NULL,
    "kind"      "app_quikinsight"."QiPermissionGrantKind" NOT NULL DEFAULT 'GRANT',
    "grantedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermissionExtra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppRole_orgId_appId_idx" ON "app_quikinsight"."AppRole"("orgId", "appId");
CREATE UNIQUE INDEX IF NOT EXISTS "AppRole_orgId_appId_name_key" ON "app_quikinsight"."AppRole"("orgId", "appId", "name");
CREATE INDEX IF NOT EXISTS "RolePermission_roleId_idx" ON "app_quikinsight"."RolePermission"("roleId");
CREATE UNIQUE INDEX IF NOT EXISTS "RolePermission_roleId_resource_action_key" ON "app_quikinsight"."RolePermission"("roleId", "resource", "action");
CREATE INDEX IF NOT EXISTS "RoleNavigation_roleId_idx" ON "app_quikinsight"."RoleNavigation"("roleId");
CREATE UNIQUE INDEX IF NOT EXISTS "RoleNavigation_roleId_navKey_key" ON "app_quikinsight"."RoleNavigation"("roleId", "navKey");
CREATE INDEX IF NOT EXISTS "UserAppRole_roleId_idx" ON "app_quikinsight"."UserAppRole"("roleId");
CREATE INDEX IF NOT EXISTS "UserAppRole_userId_orgId_idx" ON "app_quikinsight"."UserAppRole"("userId", "orgId");
CREATE INDEX IF NOT EXISTS "UserAppRole_expiresAt_idx" ON "app_quikinsight"."UserAppRole"("expiresAt");
CREATE UNIQUE INDEX IF NOT EXISTS "UserAppRole_userId_orgId_roleId_key" ON "app_quikinsight"."UserAppRole"("userId", "orgId", "roleId");
CREATE INDEX IF NOT EXISTS "UserPermissionExtra_userId_orgId_idx" ON "app_quikinsight"."UserPermissionExtra"("userId", "orgId");
CREATE UNIQUE INDEX IF NOT EXISTS "UserPermissionExtra_orgId_userId_resource_action_key" ON "app_quikinsight"."UserPermissionExtra"("orgId", "userId", "resource", "action");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "app_quikinsight"."RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey"
        FOREIGN KEY ("roleId") REFERENCES "app_quikinsight"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "app_quikinsight"."RoleNavigation" ADD CONSTRAINT "RoleNavigation_roleId_fkey"
        FOREIGN KEY ("roleId") REFERENCES "app_quikinsight"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "app_quikinsight"."UserAppRole" ADD CONSTRAINT "UserAppRole_roleId_fkey"
        FOREIGN KEY ("roleId") REFERENCES "app_quikinsight"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Backfill ────────────────────────────────────────────────────────────────
-- Every org that ALREADY has QuikInsight access is broken right now: the
-- dropdown is empty and there is no re-grant flow a super-admin can trigger to
-- fix it. Seed the five system roles for those orgs here so the panel works the
-- moment this migration lands, without waiting for a provision-roles call.
--
-- QuikInsight offers exactly two roles: ADMIN and VIEWER. The names match the
-- `Role` union in apps/quikinsight/lib/rbac.ts exactly — that union is what
-- `session.user.role` is checked against, so a name that drifts from it grants
-- nothing. VIEWER is the default, so an assignment that arrives without an
-- explicit role lands on the least-privileged option.
INSERT INTO "app_quikinsight"."AppRole"
    ("id", "orgId", "appId", "name", "description", "isSystem", "isDefault", "createdAt", "updatedAt")
SELECT
    md5(oaa."orgId" || ':' || oaa."appId" || ':' || r.name),
    oaa."orgId",
    oaa."appId",
    r.name,
    r.description,
    true,
    r.name = 'VIEWER',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "quikit"."OrgAppAccess" oaa
JOIN "quikit"."App" a ON a."id" = oaa."appId"
CROSS JOIN (VALUES
    ('ADMIN',  'Full access, including connecting accounts and managing roles'),
    ('VIEWER', 'Read-only access to analytics')
) AS r(name, description)
WHERE a."slug" = 'quikinsight'
  AND oaa."enabled" = true
ON CONFLICT ("orgId", "appId", "name") DO NOTHING;

-- The permission grants behind those two roles. Without them the org has a role
-- catalogue that authorises nothing and every request from its members is
-- refused. Mirrors ROLE_PERMISSIONS in apps/quikinsight/lib/seedAppRoles.ts.
INSERT INTO "app_quikinsight"."RolePermission" ("id", "roleId", "resource", "action")
SELECT
    md5(ar."id" || ':' || p.resource || '.' || p.action),
    ar."id",
    p.resource,
    p.action
FROM "app_quikinsight"."AppRole" ar
JOIN "quikit"."App" a ON a."id" = ar."appId"
JOIN (VALUES
    ('ADMIN',  'analytics', 'view_own_team'),
    ('ADMIN',  'analytics', 'view_all_teams'),
    ('ADMIN',  'account',   'connect'),
    ('ADMIN',  'org',       'manage_roles'),
    ('VIEWER', 'analytics', 'view_own_team'),
    ('VIEWER', 'analytics', 'view_all_teams')
) AS p(role_name, resource, action) ON p.role_name = ar."name"
WHERE a."slug" = 'quikinsight'
ON CONFLICT ("roleId", "resource", "action") DO NOTHING;
