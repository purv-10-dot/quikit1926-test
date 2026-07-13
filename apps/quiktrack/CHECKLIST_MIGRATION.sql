-- Personal Checklist feature — schema migration (run by the integration owner).
-- Non-destructive: creates two NEW tables in app_quiktrack, drops nothing.
-- Mirrors the Prisma models QtChecklistStatus / QtChecklistItem added to
-- packages/database/prisma/schema.prisma. The app accesses these via raw SQL
-- until the generated Prisma client is regenerated (Windows DLL-lock caveat).

CREATE TABLE IF NOT EXISTS "app_quiktrack"."QtChecklistStatus" (
  "id"         TEXT PRIMARY KEY,
  "orgId"      TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "color"      TEXT NOT NULL DEFAULT '#6b7280',
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "isDefault"  BOOLEAN NOT NULL DEFAULT FALSE,
  "isDeleted"  BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "QtChecklistStatus_orgId_userId_idx"
  ON "app_quiktrack"."QtChecklistStatus" ("orgId", "userId");

CREATE TABLE IF NOT EXISTS "app_quiktrack"."QtChecklistItem" (
  "id"             TEXT PRIMARY KEY,
  "orgId"          TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "statusId"       TEXT,
  "dueDate"        TIMESTAMPTZ,
  "reminderSentAt" TIMESTAMPTZ,
  "orderIndex"     INTEGER NOT NULL DEFAULT 0,
  "isCompleted"    BOOLEAN NOT NULL DEFAULT FALSE,
  "isDeleted"      BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "QtChecklistItem_statusId_fkey"
    FOREIGN KEY ("statusId") REFERENCES "app_quiktrack"."QtChecklistStatus" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "QtChecklistItem_orgId_userId_idx"
  ON "app_quiktrack"."QtChecklistItem" ("orgId", "userId");
CREATE INDEX IF NOT EXISTS "QtChecklistItem_dueDate_reminderSentAt_idx"
  ON "app_quiktrack"."QtChecklistItem" ("dueDate", "reminderSentAt");
