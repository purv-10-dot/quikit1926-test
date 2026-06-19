-- ────────────────────────────────────────────────────────────────────────
-- QuikTrack schema sync: brings an OLDER QuikTrack DB up to the current
-- packages/database/prisma/schema.prisma (app_quiktrack schema).
--
-- Run this against your teammate's database to apply the 3 differences:
--   1. New table   app_quiktrack."QtIssueAttachment"
--   2. New column  app_quiktrack."QtUserViewPref"."settings"  (JSONB, nullable)
--   3. New table   app_quiktrack."QtFeedback"
--
-- (The QtIssue.attachments relation is virtual — it needs no DB column; it is
--  created by the FK from QtIssueAttachment below.)
--
-- All statements use IF NOT EXISTS so this file is safe to re-run and safe to
-- run on a DB that already has some of these objects.
-- ────────────────────────────────────────────────────────────────────────

-- 1) QtIssueAttachment ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtIssueAttachment" (
  id                   TEXT PRIMARY KEY,
  "orgId"              TEXT NOT NULL,
  "projectId"          TEXT NOT NULL,
  "issueId"            TEXT NOT NULL,
  "fileName"           TEXT NOT NULL,
  "mimeType"           TEXT NOT NULL,
  "sizeBytes"          INTEGER NOT NULL,
  "s3Key"              TEXT NOT NULL,
  "sourceSystem"       TEXT,
  "sourceAttachmentId" TEXT,
  "uploadedBy"         TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QtIssueAttachment_issue_fkey"
    FOREIGN KEY ("issueId")
    REFERENCES app_quiktrack."QtIssue"(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "QtIssueAttachment_issue_source_key"
  ON app_quiktrack."QtIssueAttachment"("issueId", "sourceSystem", "sourceAttachmentId");
CREATE INDEX IF NOT EXISTS "QtIssueAttachment_org_idx"
  ON app_quiktrack."QtIssueAttachment"("orgId");
CREATE INDEX IF NOT EXISTS "QtIssueAttachment_project_idx"
  ON app_quiktrack."QtIssueAttachment"("projectId");
CREATE INDEX IF NOT EXISTS "QtIssueAttachment_issue_created_idx"
  ON app_quiktrack."QtIssueAttachment"("issueId", "createdAt");

-- 2) QtUserViewPref.settings ──────────────────────────────────────────────
ALTER TABLE app_quiktrack."QtUserViewPref" ADD COLUMN IF NOT EXISTS "settings" JSONB;

-- 3) QtFeedback ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtFeedback" (
  id           TEXT PRIMARY KEY,
  "orgId"      TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "projectId"  TEXT,
  category     TEXT NOT NULL,
  content      TEXT NOT NULL,
  "contactOk"  BOOLEAN NOT NULL DEFAULT false,
  "researchOk" BOOLEAN NOT NULL DEFAULT false,
  url          TEXT,
  "userAgent"  TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "QtFeedback_org_created_idx"
  ON app_quiktrack."QtFeedback"("orgId", "createdAt");
CREATE INDEX IF NOT EXISTS "QtFeedback_user_idx"
  ON app_quiktrack."QtFeedback"("userId");
