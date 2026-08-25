-- QuikFlow Roles & Permissions v2 (RBAC): AppRole / UserAppRole /
-- RolePermission for app_quikflow.
--
-- Mirrors the shape used by QuikScale / QuikTrack / QuikSocial etc., trimmed
-- to what QuikFlow needs: one role per user per org (via UserAppRole),
-- grants stored as flat (resource, action) pairs on RolePermission. No
-- RoleNavigation (sidebar visibility is derived from `view` grants) and no
-- UserPermissionExtra (no per-user additive overrides) — everything is
-- managed through the role's RolePermission grants. Mapped from the
-- Wf-prefixed Prisma models (WfAppRole, WfUserAppRole, WfRolePermission)
-- via @@map.
--
-- Idempotent (IF NOT EXISTS everywhere) — safe to re-run.

-- ──────────────── AppRole ────────────────
CREATE TABLE IF NOT EXISTS app_quikflow."AppRole" (
    id          TEXT PRIMARY KEY,
    "orgId"     TEXT NOT NULL,
    "appId"     TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    "isSystem"  BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppRole_orgId_appId_name_key"
    ON app_quikflow."AppRole"("orgId", "appId", name);
CREATE INDEX IF NOT EXISTS "AppRole_orgId_appId_idx"
    ON app_quikflow."AppRole"("orgId", "appId");

ALTER TABLE app_quikflow."AppRole"
    ADD CONSTRAINT "AppRole_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES quikit."Org"(id)
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE app_quikflow."AppRole"
    ADD CONSTRAINT "AppRole_appId_fkey"
    FOREIGN KEY ("appId") REFERENCES quikit."App"(id)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────── UserAppRole ────────────────
CREATE TABLE IF NOT EXISTS app_quikflow."UserAppRole" (
    id           TEXT PRIMARY KEY,
    "userId"     TEXT NOT NULL,
    "orgId"      TEXT NOT NULL,
    "roleId"     TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserAppRole_userId_orgId_roleId_key"
    ON app_quikflow."UserAppRole"("userId", "orgId", "roleId");
CREATE INDEX IF NOT EXISTS "UserAppRole_roleId_idx"
    ON app_quikflow."UserAppRole"("roleId");
CREATE INDEX IF NOT EXISTS "UserAppRole_userId_orgId_idx"
    ON app_quikflow."UserAppRole"("userId", "orgId");

ALTER TABLE app_quikflow."UserAppRole"
    ADD CONSTRAINT "UserAppRole_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES auth."User"(id)
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE app_quikflow."UserAppRole"
    ADD CONSTRAINT "UserAppRole_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES quikit."Org"(id)
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE app_quikflow."UserAppRole"
    ADD CONSTRAINT "UserAppRole_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES app_quikflow."AppRole"(id)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────── RolePermission ────────────────
CREATE TABLE IF NOT EXISTS app_quikflow."RolePermission" (
    id       TEXT PRIMARY KEY,
    "roleId" TEXT NOT NULL,
    resource TEXT NOT NULL,
    action   TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "RolePermission_roleId_resource_action_key"
    ON app_quikflow."RolePermission"("roleId", resource, action);
CREATE INDEX IF NOT EXISTS "RolePermission_roleId_idx"
    ON app_quikflow."RolePermission"("roleId");

ALTER TABLE app_quikflow."RolePermission"
    ADD CONSTRAINT "RolePermission_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES app_quikflow."AppRole"(id)
    ON DELETE CASCADE ON UPDATE CASCADE;
