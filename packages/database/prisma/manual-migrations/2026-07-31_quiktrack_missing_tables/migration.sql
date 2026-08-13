-- QuikTrack: create the 16 tables that live in schema.prisma but were never
-- turned into a Prisma migration (applied locally via `db push`). Brings UAT in
-- sync with the current schema for: Sprint velocity snapshots, personal
-- checklist, saved filters, feedback, and Product Discovery (Ideas).
--
-- Fully IDEMPOTENT (CREATE ... IF NOT EXISTS + guarded FKs) — safe to run more
-- than once and safe whether or not any of these tables already exist. Matches
-- the hand-written convention in 20260728120000_quiktrack_workflows.
--
-- Conventions (from existing migrations):
--   id           -> text PRIMARY KEY (cuid generated app-side, no DB default)
--   Org FK       -> REFERENCES quikit."Org"(id) ON DELETE CASCADE
--   timestamps   -> timestamp(3) NOT NULL DEFAULT now()
--   Json         -> jsonb
--   String[]     -> text[]
-- Tables are created parent-before-child so inline REFERENCES resolve.

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. Column additions on EXISTING tables (un-migrated `db push` changes)
-- ═══════════════════════════════════════════════════════════════════════════
-- QtProject.managementStyle — Jira "team-managed"/"company-managed" label.
ALTER TABLE app_quiktrack."QtProject"
  ADD COLUMN IF NOT EXISTS "managementStyle" text NOT NULL DEFAULT 'team-managed';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Sprint velocity snapshot (frozen scope at sprint completion)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS app_quiktrack."QtSprintSnapshot" (
  id                  text PRIMARY KEY,
  "orgId"             text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "projectId"         text NOT NULL REFERENCES app_quiktrack."QtProject"(id) ON DELETE CASCADE,
  "sprintId"          text NOT NULL REFERENCES app_quiktrack."QtSprint"(id) ON DELETE CASCADE,
  "committedPoints"   integer NOT NULL DEFAULT 0,
  "committedCount"    integer NOT NULL DEFAULT 0,
  "committedIssueIds" jsonb NOT NULL DEFAULT '[]',
  "completedPoints"   integer NOT NULL DEFAULT 0,
  "completedCount"    integer NOT NULL DEFAULT 0,
  "committedHours"    double precision NOT NULL DEFAULT 0,
  "completedHours"    double precision NOT NULL DEFAULT 0,
  "completionPct"     integer NOT NULL DEFAULT 0,
  "completedAt"       timestamp(3),
  "createdAt"         timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"         timestamp(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "QtSprintSnapshot_sprintId_key"
  ON app_quiktrack."QtSprintSnapshot" ("sprintId");
CREATE INDEX IF NOT EXISTS "QtSprintSnapshot_projectId_idx"
  ON app_quiktrack."QtSprintSnapshot" ("projectId");
CREATE INDEX IF NOT EXISTS "QtSprintSnapshot_orgId_idx"
  ON app_quiktrack."QtSprintSnapshot" ("orgId");

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Personal checklist (statuses first, then items → statusId FK)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS app_quiktrack."QtChecklistStatus" (
  id           text PRIMARY KEY,
  "orgId"      text NOT NULL,
  "userId"     text NOT NULL,
  name         text NOT NULL,
  color        text NOT NULL DEFAULT '#6b7280',
  "orderIndex" integer NOT NULL DEFAULT 0,
  "isDefault"  boolean NOT NULL DEFAULT false,
  "isDeleted"  boolean NOT NULL DEFAULT false,
  "createdAt"  timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"  timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "QtChecklistStatus_orgId_userId_idx"
  ON app_quiktrack."QtChecklistStatus" ("orgId", "userId");

CREATE TABLE IF NOT EXISTS app_quiktrack."QtChecklistItem" (
  id               text PRIMARY KEY,
  "orgId"          text NOT NULL,
  "userId"         text NOT NULL,
  name             text NOT NULL,
  "statusId"       text REFERENCES app_quiktrack."QtChecklistStatus"(id) ON DELETE SET NULL,
  "dueDate"        timestamp(3),
  "reminderSentAt" timestamp(3),
  "orderIndex"     integer NOT NULL DEFAULT 0,
  "isCompleted"    boolean NOT NULL DEFAULT false,
  "isDeleted"      boolean NOT NULL DEFAULT false,
  "createdAt"      timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"      timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "QtChecklistItem_orgId_userId_idx"
  ON app_quiktrack."QtChecklistItem" ("orgId", "userId");
CREATE INDEX IF NOT EXISTS "QtChecklistItem_dueDate_reminderSentAt_idx"
  ON app_quiktrack."QtChecklistItem" ("dueDate", "reminderSentAt");

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Saved work-item filters (global Filters surface)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS app_quiktrack."QtSavedFilter" (
  id           text PRIMARY KEY,
  "orgId"      text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "userId"     text NOT NULL,
  name         text NOT NULL,
  description  text,
  criteria     jsonb NOT NULL,
  visibility   text NOT NULL DEFAULT 'private',
  "viewerIds"  text[] NOT NULL DEFAULT '{}',
  starred      boolean NOT NULL DEFAULT false,
  "isDeleted"  boolean NOT NULL DEFAULT false,
  "createdAt"  timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"  timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "QtSavedFilter_orgId_userId_idx"
  ON app_quiktrack."QtSavedFilter" ("orgId", "userId");
CREATE INDEX IF NOT EXISTS "QtSavedFilter_orgId_visibility_idx"
  ON app_quiktrack."QtSavedFilter" ("orgId", "visibility");

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Feedback
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS app_quiktrack."QtFeedback" (
  id           text PRIMARY KEY,
  "orgId"      text NOT NULL,
  "userId"     text NOT NULL,
  "projectId"  text,
  category     text NOT NULL,
  content      text NOT NULL,
  "contactOk"  boolean NOT NULL DEFAULT false,
  "researchOk" boolean NOT NULL DEFAULT false,
  url          text,
  "userAgent"  text,
  "createdAt"  timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "QtFeedback_orgId_createdAt_idx"
  ON app_quiktrack."QtFeedback" ("orgId", "createdAt");
CREATE INDEX IF NOT EXISTS "QtFeedback_userId_idx"
  ON app_quiktrack."QtFeedback" ("userId");

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Product Discovery / Ideas (parent-before-child order)
-- ═══════════════════════════════════════════════════════════════════════════

-- 5a. Idea statuses
CREATE TABLE IF NOT EXISTS app_quiktrack."QtIdeaStatus" (
  id           text PRIMARY KEY,
  "projectId"  text NOT NULL REFERENCES app_quiktrack."QtProject"(id) ON DELETE CASCADE,
  name         text NOT NULL,
  color        text NOT NULL DEFAULT '#94a3b8',
  category     text NOT NULL DEFAULT 'DISCOVERY',
  "orderIndex" integer NOT NULL DEFAULT 0,
  "isHidden"   boolean NOT NULL DEFAULT false,
  "isDeleted"  boolean NOT NULL DEFAULT false,
  "createdAt"  timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"  timestamp(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "QtIdeaStatus_projectId_name_key"
  ON app_quiktrack."QtIdeaStatus" ("projectId", "name");
CREATE INDEX IF NOT EXISTS "QtIdeaStatus_projectId_orderIndex_idx"
  ON app_quiktrack."QtIdeaStatus" ("projectId", "orderIndex");

-- 5b. Ideas
CREATE TABLE IF NOT EXISTS app_quiktrack."QtIdea" (
  id             text PRIMARY KEY,
  "orgId"        text NOT NULL,
  "projectId"    text NOT NULL REFERENCES app_quiktrack."QtProject"(id) ON DELETE CASCADE,
  key            text NOT NULL,
  title          text NOT NULL,
  description    text,
  "statusId"     text NOT NULL REFERENCES app_quiktrack."QtIdeaStatus"(id),
  "assigneeId"   text,
  "reporterId"   text,
  "archivedFlag" boolean NOT NULL DEFAULT false,
  "orderIndex"   integer NOT NULL DEFAULT 0,
  "isDeleted"    boolean NOT NULL DEFAULT false,
  "createdAt"    timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"    timestamp(3) NOT NULL DEFAULT now(),
  "createdBy"    text,
  "updatedBy"    text
);
CREATE UNIQUE INDEX IF NOT EXISTS "QtIdea_projectId_key_key"
  ON app_quiktrack."QtIdea" ("projectId", "key");
CREATE INDEX IF NOT EXISTS "QtIdea_orgId_idx"
  ON app_quiktrack."QtIdea" ("orgId");
CREATE INDEX IF NOT EXISTS "QtIdea_projectId_statusId_idx"
  ON app_quiktrack."QtIdea" ("projectId", "statusId");
CREATE INDEX IF NOT EXISTS "QtIdea_projectId_archivedFlag_idx"
  ON app_quiktrack."QtIdea" ("projectId", "archivedFlag");
CREATE INDEX IF NOT EXISTS "QtIdea_assigneeId_idx"
  ON app_quiktrack."QtIdea" ("assigneeId");

-- 5c. Idea custom-field values (FK to QtCustomField added conditionally below)
CREATE TABLE IF NOT EXISTS app_quiktrack."QtIdeaFieldValue" (
  id             text PRIMARY KEY,
  "orgId"        text NOT NULL,
  "ideaId"       text NOT NULL REFERENCES app_quiktrack."QtIdea"(id) ON DELETE CASCADE,
  "fieldId"      text NOT NULL,
  "valueText"    text,
  "valueNumber"  double precision,
  "valueDate"    timestamp(3),
  "valueBoolean" boolean,
  "valueJson"    jsonb,
  "createdAt"    timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"    timestamp(3) NOT NULL DEFAULT now(),
  "createdBy"    text,
  "updatedBy"    text
);
CREATE UNIQUE INDEX IF NOT EXISTS "QtIdeaFieldValue_ideaId_fieldId_key"
  ON app_quiktrack."QtIdeaFieldValue" ("ideaId", "fieldId");
CREATE INDEX IF NOT EXISTS "QtIdeaFieldValue_fieldId_valueText_idx"
  ON app_quiktrack."QtIdeaFieldValue" ("fieldId", "valueText");
CREATE INDEX IF NOT EXISTS "QtIdeaFieldValue_fieldId_valueNumber_idx"
  ON app_quiktrack."QtIdeaFieldValue" ("fieldId", "valueNumber");
CREATE INDEX IF NOT EXISTS "QtIdeaFieldValue_orgId_idx"
  ON app_quiktrack."QtIdeaFieldValue" ("orgId");
-- fieldId -> QtCustomField FK: only added if the custom-fields table exists and
-- the constraint isn't already present (keeps this script safe to run before
-- the custom-fields migration).
DO $$
BEGIN
  IF to_regclass('app_quiktrack."QtCustomField"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'QtIdeaFieldValue_fieldId_fkey'
     ) THEN
    ALTER TABLE app_quiktrack."QtIdeaFieldValue"
      ADD CONSTRAINT "QtIdeaFieldValue_fieldId_fkey"
      FOREIGN KEY ("fieldId")
      REFERENCES app_quiktrack."QtCustomField"(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 5d. Idea views
CREATE TABLE IF NOT EXISTS app_quiktrack."QtIdeaView" (
  id           text PRIMARY KEY,
  "orgId"      text NOT NULL,
  "projectId"  text NOT NULL REFERENCES app_quiktrack."QtProject"(id) ON DELETE CASCADE,
  name         text NOT NULL,
  type         text NOT NULL DEFAULT 'table',
  config       jsonb,
  visibility   text NOT NULL DEFAULT 'shared',
  "ownerId"    text,
  "orderIndex" integer NOT NULL DEFAULT 0,
  "isDefault"  boolean NOT NULL DEFAULT false,
  "isDeleted"  boolean NOT NULL DEFAULT false,
  "createdAt"  timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"  timestamp(3) NOT NULL DEFAULT now(),
  "createdBy"  text,
  "updatedBy"  text
);
CREATE INDEX IF NOT EXISTS "QtIdeaView_projectId_orderIndex_idx"
  ON app_quiktrack."QtIdeaView" ("projectId", "orderIndex");

-- 5e. Idea comments (self-referential parentId)
CREATE TABLE IF NOT EXISTS app_quiktrack."QtIdeaComment" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL,
  "ideaId"    text NOT NULL REFERENCES app_quiktrack."QtIdea"(id) ON DELETE CASCADE,
  "parentId"  text REFERENCES app_quiktrack."QtIdeaComment"(id) ON DELETE CASCADE,
  body        text NOT NULL,
  "isDeleted" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  "createdBy" text
);
CREATE INDEX IF NOT EXISTS "QtIdeaComment_ideaId_createdAt_idx"
  ON app_quiktrack."QtIdeaComment" ("ideaId", "createdAt");
CREATE INDEX IF NOT EXISTS "QtIdeaComment_orgId_idx"
  ON app_quiktrack."QtIdeaComment" ("orgId");

-- 5f. Idea comment reactions
CREATE TABLE IF NOT EXISTS app_quiktrack."QtIdeaCommentReaction" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL,
  "commentId" text NOT NULL REFERENCES app_quiktrack."QtIdeaComment"(id) ON DELETE CASCADE,
  emoji       text NOT NULL,
  "userId"    text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "QtIdeaCommentReaction_commentId_userId_emoji_key"
  ON app_quiktrack."QtIdeaCommentReaction" ("commentId", "userId", "emoji");
CREATE INDEX IF NOT EXISTS "QtIdeaCommentReaction_commentId_idx"
  ON app_quiktrack."QtIdeaCommentReaction" ("commentId");

-- 5g. Idea insights
CREATE TABLE IF NOT EXISTS app_quiktrack."QtIdeaInsight" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL,
  "ideaId"    text NOT NULL REFERENCES app_quiktrack."QtIdea"(id) ON DELETE CASCADE,
  body        text NOT NULL,
  url         text,
  impact      integer NOT NULL DEFAULT 0,
  labels      jsonb,
  "isDeleted" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  "createdBy" text
);
CREATE INDEX IF NOT EXISTS "QtIdeaInsight_ideaId_createdAt_idx"
  ON app_quiktrack."QtIdeaInsight" ("ideaId", "createdAt");
CREATE INDEX IF NOT EXISTS "QtIdeaInsight_orgId_idx"
  ON app_quiktrack."QtIdeaInsight" ("orgId");

-- 5h. Idea deliveries (issueId is cross-project, intentionally no FK)
CREATE TABLE IF NOT EXISTS app_quiktrack."QtIdeaDelivery" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL,
  "ideaId"    text NOT NULL REFERENCES app_quiktrack."QtIdea"(id) ON DELETE CASCADE,
  "issueId"   text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "createdBy" text
);
CREATE UNIQUE INDEX IF NOT EXISTS "QtIdeaDelivery_ideaId_issueId_key"
  ON app_quiktrack."QtIdeaDelivery" ("ideaId", "issueId");
CREATE INDEX IF NOT EXISTS "QtIdeaDelivery_ideaId_idx"
  ON app_quiktrack."QtIdeaDelivery" ("ideaId");
CREATE INDEX IF NOT EXISTS "QtIdeaDelivery_issueId_idx"
  ON app_quiktrack."QtIdeaDelivery" ("issueId");
CREATE INDEX IF NOT EXISTS "QtIdeaDelivery_orgId_idx"
  ON app_quiktrack."QtIdeaDelivery" ("orgId");

-- 5i. Idea view-level comments (viewId has no FK per schema)
CREATE TABLE IF NOT EXISTS app_quiktrack."QtIdeaViewComment" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL,
  "viewId"    text NOT NULL,
  body        text NOT NULL,
  "isDeleted" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  "createdBy" text
);
CREATE INDEX IF NOT EXISTS "QtIdeaViewComment_viewId_createdAt_idx"
  ON app_quiktrack."QtIdeaViewComment" ("viewId", "createdAt");
CREATE INDEX IF NOT EXISTS "QtIdeaViewComment_orgId_idx"
  ON app_quiktrack."QtIdeaViewComment" ("orgId");

-- 5j. Idea attachments
CREATE TABLE IF NOT EXISTS app_quiktrack."QtIdeaAttachment" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL,
  "ideaId"    text NOT NULL REFERENCES app_quiktrack."QtIdea"(id) ON DELETE CASCADE,
  "fileName"  text NOT NULL,
  url         text NOT NULL,
  "mimeType"  text,
  size        integer,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "createdBy" text
);
CREATE INDEX IF NOT EXISTS "QtIdeaAttachment_ideaId_createdAt_idx"
  ON app_quiktrack."QtIdeaAttachment" ("ideaId", "createdAt");
CREATE INDEX IF NOT EXISTS "QtIdeaAttachment_orgId_idx"
  ON app_quiktrack."QtIdeaAttachment" ("orgId");

-- 5k. Idea links (issueId is cross-project, intentionally no FK)
CREATE TABLE IF NOT EXISTS app_quiktrack."QtIdeaLink" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL,
  "ideaId"    text NOT NULL REFERENCES app_quiktrack."QtIdea"(id) ON DELETE CASCADE,
  "issueId"   text NOT NULL,
  "linkType"  text NOT NULL DEFAULT 'relates to',
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "createdBy" text
);
CREATE UNIQUE INDEX IF NOT EXISTS "QtIdeaLink_ideaId_issueId_linkType_key"
  ON app_quiktrack."QtIdeaLink" ("ideaId", "issueId", "linkType");
CREATE INDEX IF NOT EXISTS "QtIdeaLink_ideaId_idx"
  ON app_quiktrack."QtIdeaLink" ("ideaId");
CREATE INDEX IF NOT EXISTS "QtIdeaLink_orgId_idx"
  ON app_quiktrack."QtIdeaLink" ("orgId");
