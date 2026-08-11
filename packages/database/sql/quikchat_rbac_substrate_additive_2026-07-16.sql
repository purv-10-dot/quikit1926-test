-- ============================================================================
-- QuikChat — RBAC v2 substrate (reproducibility backfill, NOT a pending change)
-- ============================================================================
-- Baseline : any app_quikchat schema
-- Target   : packages/database/prisma/schema.prisma @ HEAD — models QcAppRole,
--            QcUserAppRole, QcRolePermission, QcUserPermissionExtra
-- Scope    : the `app_quikchat` Postgres schema ONLY, plus foreign keys that
--            REFERENCE (never alter) quikit."Org", quikit."App", auth."User".
--            Purely additive — no drops, no type changes, no data rewrites.
--
-- Source commit: 37651305 "feat(quikchat): RBAC v2 substrate — Qc* role tables,
--                permission tree, seeders (no enforcement)" (2026-07-16)
--
-- ── PROVENANCE — read before trusting this file ─────────────────────────────
-- RECONSTRUCTED from `schema.prisma` plus a LOCAL, Prisma-built dev database
-- (columns, defaults, all 13 indexes and all 8 foreign keys were dumped from
-- that DB). It has NEVER been diffed against UAT. This is not the SQL that was
-- applied anywhere; it is what the schema says the applied SQL should have been.
--
-- ── READ THIS BEFORE APPLYING: what "no-op" means here ──────────────────────
-- These four tables ALREADY EXIST on UAT. They are among the 21 tables that
-- quikchat_presence_callsounds_additive_2026-07-31.sql names as its verified
-- baseline (22 models today minus QcUserPresence, which that script creates,
-- equals exactly 21). They entered schema.prisma on 2026-07-16 — fifteen days
-- BEFORE that script.
--
-- So on UAT this file MUST be a complete no-op: every CREATE ... IF NOT EXISTS
-- should find its object already present and do nothing.
--
-- If it is NOT a no-op — if any table, index or constraint is actually created
-- — that is NOT a success. It means UAT has diverged from schema.prisma, and
-- something has been running against a schema nobody has verified. STOP, do not
-- COMMIT, and take it to Pravin. Creating the missing object may be the right
-- answer, but that is his call once the divergence is understood, not a side
-- effect of running this file.
--
-- The value of this file is on a FRESH database, where these tables do not
-- exist and nothing else in the repo would create them. See the backlog row:
-- QuikChat has never had committed DDL at all — there is no
-- create_app_quikchat.sql, unlike create_app_quikasset.sql /
-- create_app_quikfinance.sql. This file covers 4 of the 22 tables. The
-- remaining 18 are a separate, larger artifact.
--
-- ── Table naming (easy to get wrong) ────────────────────────────────────────
-- The Prisma models are prefixed but the TABLES ARE NOT — QcAppRole maps to
-- "AppRole", QcUserAppRole to "UserAppRole", and so on. This is deliberate and
-- load-bearing: the Admin Portal reads app_<slug>."AppRole" by raw SQL across
-- every app (apps/admin/app/api/roles/route.ts), so the unprefixed name is a
-- cross-app contract. Do not "fix" it to match the sibling Qc* tables.
--
-- ── Foreign-key actions ─────────────────────────────────────────────────────
-- FKs below use ON UPDATE CASCADE ON DELETE CASCADE, matching what Prisma
-- generates and therefore what a fresh Prisma-built DB has. NOTE: QuikTrack's
-- equivalent (packages/database/scripts/qt-rbac-v2.sql) writes ON DELETE
-- CASCADE only, without ON UPDATE. That divergence is intentional here —
-- schema.prisma is our stated target and byte-comparability with QuikTrack is
-- not a goal. Do not "align" these to QuikTrack; it would put us out of step
-- with our own schema.
--
-- Idempotent: tables and indexes use IF NOT EXISTS; foreign keys use DO blocks
-- that swallow duplicate_object. Wrapped in one transaction — all-or-nothing.
--
-- Prereq: schema `app_quikchat` must exist, and the FK targets quikit."Org",
-- quikit."App" and auth."User" must exist.
-- ============================================================================


-- ############################################################################
-- ##                                                                        ##
-- ##   STOP — MANDATORY PRE-APPLY CHECK. DO NOT RUN THE TRANSACTION BELOW   ##
-- ##   UNTIL YOU HAVE RUN THESE THREE QUERIES AND COMPARED THEIR OUTPUT.    ##
-- ##                                                                        ##
-- ############################################################################
--
-- WHY THIS IS A GATE AND NOT A CAVEAT:
--
-- The `duplicate_object` guard on each foreign key below catches a constraint
-- with the SAME NAME. It does NOT detect an equivalent constraint under a
-- DIFFERENT name. If UAT's copies of these tables were created by a
-- hand-written script (the original was shared over Teams and never committed),
-- its FK names may differ from Prisma's — in which case this file will silently
-- add a SECOND, DUPLICATE foreign key enforcing the same rule. That is additive
-- and will not corrupt data, but it leaves the schema permanently confusing and
-- is tedious to unpick later.
--
-- Query A — which of the four tables already exist?
--   Expect on UAT: 4 rows. Expect on a fresh DB: 0 rows.
--   Anything between 1 and 3 is divergence — STOP and escalate.
--
-- SELECT table_name
--   FROM information_schema.tables
--  WHERE table_schema = 'app_quikchat'
--    AND table_name IN ('AppRole','UserAppRole','RolePermission','UserPermissionExtra')
--  ORDER BY table_name;
--
-- Query B — every existing FOREIGN KEY on those tables, with its name.
--   Compare the names against the nine this file creates:
--     AppRole_orgId_fkey, AppRole_appId_fkey,
--     UserAppRole_orgId_fkey, UserAppRole_roleId_fkey, UserAppRole_userId_fkey,
--     RolePermission_roleId_fkey,
--     UserPermissionExtra_orgId_fkey, UserPermissionExtra_userId_fkey
--   Eight foreign keys across the four tables. (Each table also has a PRIMARY
--   KEY constraint, but this query filters to contype='f' and excludes them.)
--   If a row here enforces one of those rules under a DIFFERENT name, DO NOT
--   RUN the matching DO block — comment it out first, and tell Pravin.
--
-- SELECT c.conrelid::regclass AS table_name,
--        c.conname            AS constraint_name,
--        pg_get_constraintdef(c.oid) AS definition
--   FROM pg_constraint c
--   JOIN pg_class      t ON t.oid = c.conrelid
--   JOIN pg_namespace  n ON n.oid = t.relnamespace
--  WHERE n.nspname = 'app_quikchat'
--    AND t.relname IN ('AppRole','UserAppRole','RolePermission','UserPermissionExtra')
--    AND c.contype = 'f'
--  ORDER BY 1, 2;
--
-- Query C — every existing INDEX on those tables, with its name.
--   Same reasoning: a differently-named unique index enforcing the same tuple
--   would not collide, and you would end up with two.
--
-- SELECT tablename, indexname, indexdef
--   FROM pg_indexes
--  WHERE schemaname = 'app_quikchat'
--    AND tablename IN ('AppRole','UserAppRole','RolePermission','UserPermissionExtra')
--  ORDER BY tablename, indexname;
--
-- ############################################################################


BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. AppRole  (Prisma model QcAppRole)
--    One row per named role per (org, app). `isSystem` protects the seeded
--    "admin" role from rename/delete — it is NOT a permission bypass; admin
--    gets its access from its seeded RolePermission grants like any other role.
--    `isDefault` marks the role new users are bound to, and is read by the
--    Admin Portal's invite modal across every app.
--
--    Column shapes follow the app_quikchat conventions already on UAT:
--      • id         TEXT, no DB default — Prisma @default(cuid()) is app-side
--      • timestamps TIMESTAMP(3)
--      • createdAt  DEFAULT CURRENT_TIMESTAMP
--      • updatedAt  NOT NULL, no default — Prisma @updatedAt is app-side
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "app_quikchat"."AppRole" (
    "id"          TEXT         NOT NULL,
    "orgId"       TEXT         NOT NULL,
    "appId"       TEXT         NOT NULL,
    "name"        TEXT         NOT NULL,
    "description" TEXT,
    "isSystem"    BOOLEAN      NOT NULL DEFAULT false,
    "isDefault"   BOOLEAN      NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    "createdBy"   TEXT,

    CONSTRAINT "AppRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppRole_orgId_appId_name_key"
  ON "app_quikchat"."AppRole" ("orgId", "appId", "name");
CREATE INDEX IF NOT EXISTS "AppRole_orgId_appId_idx"
  ON "app_quikchat"."AppRole" ("orgId", "appId");


-- ────────────────────────────────────────────────────────────────────────────
-- 2. UserAppRole  (Prisma model QcUserAppRole)
--    user → role binding. The application enforces one role per (user, org);
--    the unique index below is on (userId, orgId, roleId), so it prevents the
--    same role being bound twice but does NOT prevent two DIFFERENT roles.
--    That is deliberate — the app's collapseToLatestRole() repairs a legacy
--    double-assign rather than the DB rejecting it.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "app_quikchat"."UserAppRole" (
    "id"         TEXT         NOT NULL,
    "userId"     TEXT         NOT NULL,
    "orgId"      TEXT         NOT NULL,
    "roleId"     TEXT         NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,

    CONSTRAINT "UserAppRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserAppRole_userId_orgId_roleId_key"
  ON "app_quikchat"."UserAppRole" ("userId", "orgId", "roleId");
CREATE INDEX IF NOT EXISTS "UserAppRole_roleId_idx"
  ON "app_quikchat"."UserAppRole" ("roleId");
CREATE INDEX IF NOT EXISTS "UserAppRole_userId_orgId_idx"
  ON "app_quikchat"."UserAppRole" ("userId", "orgId");


-- ────────────────────────────────────────────────────────────────────────────
-- 3. RolePermission  (Prisma model QcRolePermission)
--    (resource, action) grants held by a role. Both are TEXT, not enums, to
--    match every other Qc* table — the permitted values are the app-side
--    registry in apps/quikchat/lib/authz/permissionsRegistry.ts, and unknown
--    pairs fail closed at the userCan() gate rather than at the DB.
--    No orgId column: scoping comes through roleId → AppRole.orgId.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "app_quikchat"."RolePermission" (
    "id"       TEXT NOT NULL,
    "roleId"   TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action"   TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RolePermission_roleId_resource_action_key"
  ON "app_quikchat"."RolePermission" ("roleId", "resource", "action");
CREATE INDEX IF NOT EXISTS "RolePermission_roleId_idx"
  ON "app_quikchat"."RolePermission" ("roleId");


-- ────────────────────────────────────────────────────────────────────────────
-- 4. UserPermissionExtra  (Prisma model QcUserPermissionExtra)
--    Per-user ADDITIVE grants, unioned with the user's role grants at the
--    userCan() gate. Additive only — there is no deny row and no subtraction,
--    so this table can never take a permission away.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "app_quikchat"."UserPermissionExtra" (
    "id"        TEXT         NOT NULL,
    "orgId"     TEXT         NOT NULL,
    "userId"    TEXT         NOT NULL,
    "resource"  TEXT         NOT NULL,
    "action"    TEXT         NOT NULL,
    "grantedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermissionExtra_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserPermissionExtra_orgId_userId_resource_action_key"
  ON "app_quikchat"."UserPermissionExtra" ("orgId", "userId", "resource", "action");
CREATE INDEX IF NOT EXISTS "UserPermissionExtra_userId_orgId_idx"
  ON "app_quikchat"."UserPermissionExtra" ("userId", "orgId");


-- ────────────────────────────────────────────────────────────────────────────
-- 5. Foreign keys
--    Wrapped in DO blocks so a re-run against a partially-migrated DB does not
--    error on a duplicate constraint NAME. See the pre-apply gate at the top:
--    this guard does NOT protect against an equivalent constraint under a
--    different name, which is why Query B is mandatory rather than advisory.
--
--    Actions are ON UPDATE CASCADE ON DELETE CASCADE to match Prisma (see the
--    header note on the divergence from QuikTrack's script).
--
--    Cross-schema by design: role rows are owned by app_quikchat but keyed on
--    platform identities in quikit and auth.
-- ────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "app_quikchat"."AppRole"
    ADD CONSTRAINT "AppRole_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id")
    ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikchat"."AppRole"
    ADD CONSTRAINT "AppRole_appId_fkey"
    FOREIGN KEY ("appId") REFERENCES "quikit"."App"("id")
    ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikchat"."UserAppRole"
    ADD CONSTRAINT "UserAppRole_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "app_quikchat"."AppRole"("id")
    ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikchat"."UserAppRole"
    ADD CONSTRAINT "UserAppRole_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "auth"."User"("id")
    ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikchat"."UserAppRole"
    ADD CONSTRAINT "UserAppRole_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id")
    ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikchat"."RolePermission"
    ADD CONSTRAINT "RolePermission_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "app_quikchat"."AppRole"("id")
    ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikchat"."UserPermissionExtra"
    ADD CONSTRAINT "UserPermissionExtra_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id")
    ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikchat"."UserPermissionExtra"
    ADD CONSTRAINT "UserPermissionExtra_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "auth"."User"("id")
    ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;

-- ============================================================================
-- Post-apply verification (read-only — run separately, outside the transaction)
-- ============================================================================
-- On UAT, every one of these should return exactly what Queries A/B/C returned
-- BEFORE the apply. Any difference means this file was not the no-op it should
-- have been — see the header: stop and escalate rather than accepting it.
--
-- Expect 4 rows:
-- SELECT table_name
--   FROM information_schema.tables
--  WHERE table_schema = 'app_quikchat'
--    AND table_name IN ('AppRole','UserAppRole','RolePermission','UserPermissionExtra')
--  ORDER BY table_name;
--
-- Expect 13 rows: 4 PK (implicit, from the PRIMARY KEY constraints) + 4 UNIQUE
-- + 5 plain — i.e. the 9 CREATE INDEX statements above plus one PK per table:
-- SELECT tablename, indexname, indexdef
--   FROM pg_indexes
--  WHERE schemaname = 'app_quikchat'
--    AND tablename IN ('AppRole','UserAppRole','RolePermission','UserPermissionExtra')
--  ORDER BY tablename, indexname;
--
-- Expect 8 rows, and CRITICALLY no duplicate pairs — two FKs on the same
-- (table, column) under different names is the failure this file's pre-apply
-- gate exists to prevent:
-- SELECT c.conrelid::regclass AS table_name,
--        c.conname            AS constraint_name,
--        pg_get_constraintdef(c.oid) AS definition
--   FROM pg_constraint c
--   JOIN pg_class      t ON t.oid = c.conrelid
--   JOIN pg_namespace  n ON n.oid = t.relnamespace
--  WHERE n.nspname = 'app_quikchat'
--    AND t.relname IN ('AppRole','UserAppRole','RolePermission','UserPermissionExtra')
--    AND c.contype = 'f'
--  ORDER BY 1, 2;
--
-- Column shapes, to confirm a fresh-DB apply matches Prisma:
-- SELECT table_name, column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'app_quikchat'
--    AND table_name IN ('AppRole','UserAppRole','RolePermission','UserPermissionExtra')
--  ORDER BY table_name, ordinal_position;
-- ============================================================================
