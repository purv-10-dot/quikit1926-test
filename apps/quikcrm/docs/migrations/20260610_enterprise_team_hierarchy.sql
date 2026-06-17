-- ============================================================
-- MIGRATION: 20260610_enterprise_team_hierarchy
-- Author:    Principal CRM Architect
-- Purpose:   Wire CrmSalesTeam → CrmSalesGroup into a real
--            two-layer hierarchy:
--              Organization
--               └── CrmSalesTeam  (management / reporting layer)
--                    └── CrmSalesGroup  (ACL / visibility layer)
--                         └── User → Account → Lead / Opp / …
--
-- New tables:
--   CrmTeamMember   – users that belong to a team (for rollups)
--   CrmTeamManager  – additional managers of a team
--
-- Schema change:
--   CrmSalesGroup   – add teamId FK, description column
--
-- Migration strategy:
--   • CrmSalesTeam rows are preserved (id/name/managerId kept)
--   • Existing CrmSalesTeam.managerId → seeded into CrmTeamManager
--   • CrmSalesGroup.teamId left NULL; admin assigns via Settings UI
--
-- Apply via:
--   psql $DATABASE_URL -f 20260610_enterprise_team_hierarchy.sql
-- ============================================================

BEGIN;

-- ── 1. CrmTeamMember ────────────────────────────────────────
-- Tracks every user that belongs to a CrmSalesTeam.
-- Used for: team dashboard rollups, TeamManager assignment scope,
--           executive reporting drill-down (Org → Team → User).
-- NOT used for record visibility — that remains CrmSalesGroup.

CREATE TABLE IF NOT EXISTS app_quikcrm."CrmTeamMember" (
    "teamId"  TEXT        NOT NULL,
    "userId"  TEXT        NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmTeamMember_pkey" PRIMARY KEY ("teamId", "userId"),
    CONSTRAINT "CrmTeamMember_teamId_fkey"
        FOREIGN KEY ("teamId")
        REFERENCES app_quikcrm."CrmSalesTeam"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CrmTeamMember_userId_idx"
    ON app_quikcrm."CrmTeamMember"("userId");

CREATE INDEX IF NOT EXISTS "CrmTeamMember_teamId_idx"
    ON app_quikcrm."CrmTeamMember"("teamId");


-- ── 2. CrmTeamManager ───────────────────────────────────────
-- Allows multiple managers per team (CrmSalesTeam.managerId keeps
-- the PRIMARY manager for UI simplicity; this table stores all
-- managers including co-managers and deputy managers).
-- Used for: TeamManager role scope resolution.

CREATE TABLE IF NOT EXISTS app_quikcrm."CrmTeamManager" (
    "teamId"  TEXT        NOT NULL,
    "userId"  TEXT        NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmTeamManager_pkey" PRIMARY KEY ("teamId", "userId"),
    CONSTRAINT "CrmTeamManager_teamId_fkey"
        FOREIGN KEY ("teamId")
        REFERENCES app_quikcrm."CrmSalesTeam"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CrmTeamManager_userId_idx"
    ON app_quikcrm."CrmTeamManager"("userId");

CREATE INDEX IF NOT EXISTS "CrmTeamManager_teamId_idx"
    ON app_quikcrm."CrmTeamManager"("teamId");


-- ── 3. Seed CrmTeamManager from existing CrmSalesTeam.managerId
-- Every team that already has a managerId gets that user seeded
-- into CrmTeamManager so the new role system finds them.

INSERT INTO app_quikcrm."CrmTeamManager" ("teamId", "userId")
SELECT "id", "managerId"
FROM   app_quikcrm."CrmSalesTeam"
WHERE  "managerId" IS NOT NULL
ON CONFLICT DO NOTHING;


-- ── 4. Enhance CrmSalesGroup ────────────────────────────────
-- teamId  : links a sales group to a team (management hierarchy)
-- description : optional free-text for UI display

ALTER TABLE app_quikcrm."CrmSalesGroup"
    ADD COLUMN IF NOT EXISTS "teamId"      TEXT,
    ADD COLUMN IF NOT EXISTS "description" TEXT;

-- FK: group → team (SET NULL on team delete so group still exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE  constraint_name = 'CrmSalesGroup_teamId_fkey'
          AND  table_schema     = 'app_quikcrm'
    ) THEN
        ALTER TABLE app_quikcrm."CrmSalesGroup"
            ADD CONSTRAINT "CrmSalesGroup_teamId_fkey"
            FOREIGN KEY ("teamId")
            REFERENCES app_quikcrm."CrmSalesTeam"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS "CrmSalesGroup_orgId_teamId_idx"
    ON app_quikcrm."CrmSalesGroup"("orgId", "teamId");

CREATE INDEX IF NOT EXISTS "CrmSalesGroup_teamId_idx"
    ON app_quikcrm."CrmSalesGroup"("teamId");


-- ── 5. Prisma schema additions (for integration owner) ───────
-- Add the following blocks to packages/database/prisma/schema.prisma
-- inside the app_quikcrm schema section, then run:
--   npx prisma generate
--   npx prisma db pull  (or skip if you applied this SQL manually)
--
-- ┌──────────────────────────────────────────────────────────────
-- │ model CrmTeamMember {
-- │   teamId  String
-- │   userId  String
-- │   addedAt DateTime @default(now())
-- │   team    CrmSalesTeam @relation(fields: [teamId], references: [id], onDelete: Cascade)
-- │   @@id([teamId, userId])
-- │   @@index([userId])
-- │   @@index([teamId])
-- │   @@schema("app_quikcrm")
-- │ }
-- │
-- │ model CrmTeamManager {
-- │   teamId  String
-- │   userId  String
-- │   addedAt DateTime @default(now())
-- │   team    CrmSalesTeam @relation(fields: [teamId], references: [id], onDelete: Cascade)
-- │   @@id([teamId, userId])
-- │   @@index([userId])
-- │   @@index([teamId])
-- │   @@schema("app_quikcrm")
-- │ }
-- └──────────────────────────────────────────────────────────────
-- Also add to CrmSalesTeam:
-- │   members  CrmTeamMember[]
-- │   managers CrmTeamManager[]
-- │   groups   CrmSalesGroup[]
-- And to CrmSalesGroup:
-- │   teamId      String?
-- │   description String?
-- │   team        CrmSalesTeam? @relation(fields: [teamId], references: [id], onDelete: SetNull)
-- │   @@index([orgId, teamId])

COMMIT;
