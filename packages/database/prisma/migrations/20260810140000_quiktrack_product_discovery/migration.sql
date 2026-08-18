-- QuikTrack: Product Discovery (JPD-clone "discovery" project template).
-- Dedicated Idea models, intentionally SEPARATE from QtIssue. Custom-field
-- values reuse the shared QtCustomField catalogue via QtIdeaFieldValue.
--
-- STAGED ONLY — DO NOT APPLY. Per schema.prisma TODO(integration) notes, this
-- migration is PENDING integration-owner sign-off and must not land on the
-- shared/Neon DB until that sign-off happens.
--
-- Idempotent (CREATE TABLE IF NOT EXISTS / DO $$ ... pg_constraint guards) so
-- it is safe to apply by hand once approved, matching this repo's convention
-- (the build pipeline does not run `migrate deploy`).

-- ── QtIdeaStatus ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtIdeaStatus" (
  id           text PRIMARY KEY,
  "projectId"  text NOT NULL,
  name         text NOT NULL,
  color        text NOT NULL DEFAULT '#94a3b8',
  category     text NOT NULL DEFAULT 'DISCOVERY',
  "orderIndex" integer NOT NULL DEFAULT 0,
  "isHidden"   boolean NOT NULL DEFAULT false,
  "isDeleted"  boolean NOT NULL DEFAULT false,
  "createdAt"  timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"  timestamp(3) NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QtIdeaStatus_projectId_fkey') THEN
    ALTER TABLE app_quiktrack."QtIdeaStatus"
      ADD CONSTRAINT "QtIdeaStatus_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES app_quiktrack."QtProject"(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "QtIdeaStatus_projectId_name_key"
  ON app_quiktrack."QtIdeaStatus" ("projectId", "name");
CREATE INDEX IF NOT EXISTS "QtIdeaStatus_projectId_orderIndex_idx"
  ON app_quiktrack."QtIdeaStatus" ("projectId", "orderIndex");

-- ── QtIdea ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtIdea" (
  id             text PRIMARY KEY,
  "orgId"        text NOT NULL,
  "projectId"    text NOT NULL,
  key            text NOT NULL,
  title          text NOT NULL,
  description    text,
  "statusId"     text NOT NULL,
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QtIdea_projectId_fkey') THEN
    ALTER TABLE app_quiktrack."QtIdea"
      ADD CONSTRAINT "QtIdea_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES app_quiktrack."QtProject"(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QtIdea_statusId_fkey') THEN
    ALTER TABLE app_quiktrack."QtIdea"
      ADD CONSTRAINT "QtIdea_statusId_fkey"
      FOREIGN KEY ("statusId") REFERENCES app_quiktrack."QtIdeaStatus"(id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "QtIdea_projectId_key_key"
  ON app_quiktrack."QtIdea" ("projectId", "key");
CREATE INDEX IF NOT EXISTS "QtIdea_orgId_idx" ON app_quiktrack."QtIdea" ("orgId");
CREATE INDEX IF NOT EXISTS "QtIdea_projectId_statusId_idx" ON app_quiktrack."QtIdea" ("projectId", "statusId");
CREATE INDEX IF NOT EXISTS "QtIdea_projectId_archivedFlag_idx" ON app_quiktrack."QtIdea" ("projectId", "archivedFlag");
CREATE INDEX IF NOT EXISTS "QtIdea_assigneeId_idx" ON app_quiktrack."QtIdea" ("assigneeId");

-- ── QtIdeaFieldValue ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtIdeaFieldValue" (
  id            text PRIMARY KEY,
  "orgId"       text NOT NULL,
  "ideaId"      text NOT NULL,
  "fieldId"     text NOT NULL,
  "valueText"   text,
  "valueNumber" double precision,
  "valueDate"   timestamp(3),
  "valueBoolean" boolean,
  "valueJson"   jsonb,
  "createdAt"   timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"   timestamp(3) NOT NULL DEFAULT now(),
  "createdBy"   text,
  "updatedBy"   text
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QtIdeaFieldValue_ideaId_fkey') THEN
    ALTER TABLE app_quiktrack."QtIdeaFieldValue"
      ADD CONSTRAINT "QtIdeaFieldValue_ideaId_fkey"
      FOREIGN KEY ("ideaId") REFERENCES app_quiktrack."QtIdea"(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QtIdeaFieldValue_fieldId_fkey') THEN
    ALTER TABLE app_quiktrack."QtIdeaFieldValue"
      ADD CONSTRAINT "QtIdeaFieldValue_fieldId_fkey"
      FOREIGN KEY ("fieldId") REFERENCES app_quiktrack."QtCustomField"(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "QtIdeaFieldValue_ideaId_fieldId_key"
  ON app_quiktrack."QtIdeaFieldValue" ("ideaId", "fieldId");
CREATE INDEX IF NOT EXISTS "QtIdeaFieldValue_fieldId_valueText_idx" ON app_quiktrack."QtIdeaFieldValue" ("fieldId", "valueText");
CREATE INDEX IF NOT EXISTS "QtIdeaFieldValue_fieldId_valueNumber_idx" ON app_quiktrack."QtIdeaFieldValue" ("fieldId", "valueNumber");
CREATE INDEX IF NOT EXISTS "QtIdeaFieldValue_orgId_idx" ON app_quiktrack."QtIdeaFieldValue" ("orgId");

-- ── QtIdeaView ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtIdeaView" (
  id           text PRIMARY KEY,
  "orgId"      text NOT NULL,
  "projectId"  text NOT NULL,
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QtIdeaView_projectId_fkey') THEN
    ALTER TABLE app_quiktrack."QtIdeaView"
      ADD CONSTRAINT "QtIdeaView_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES app_quiktrack."QtProject"(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "QtIdeaView_projectId_orderIndex_idx" ON app_quiktrack."QtIdeaView" ("projectId", "orderIndex");

-- ── QtIdeaComment ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtIdeaComment" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL,
  "ideaId"    text NOT NULL,
  "parentId"  text,
  body        text NOT NULL,
  "isDeleted" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  "createdBy" text
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QtIdeaComment_ideaId_fkey') THEN
    ALTER TABLE app_quiktrack."QtIdeaComment"
      ADD CONSTRAINT "QtIdeaComment_ideaId_fkey"
      FOREIGN KEY ("ideaId") REFERENCES app_quiktrack."QtIdea"(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QtIdeaComment_parentId_fkey') THEN
    ALTER TABLE app_quiktrack."QtIdeaComment"
      ADD CONSTRAINT "QtIdeaComment_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES app_quiktrack."QtIdeaComment"(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "QtIdeaComment_ideaId_createdAt_idx" ON app_quiktrack."QtIdeaComment" ("ideaId", "createdAt");
CREATE INDEX IF NOT EXISTS "QtIdeaComment_orgId_idx" ON app_quiktrack."QtIdeaComment" ("orgId");

-- ── QtIdeaCommentReaction ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtIdeaCommentReaction" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL,
  "commentId" text NOT NULL,
  emoji       text NOT NULL,
  "userId"    text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QtIdeaCommentReaction_commentId_fkey') THEN
    ALTER TABLE app_quiktrack."QtIdeaCommentReaction"
      ADD CONSTRAINT "QtIdeaCommentReaction_commentId_fkey"
      FOREIGN KEY ("commentId") REFERENCES app_quiktrack."QtIdeaComment"(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "QtIdeaCommentReaction_commentId_userId_emoji_key"
  ON app_quiktrack."QtIdeaCommentReaction" ("commentId", "userId", "emoji");
CREATE INDEX IF NOT EXISTS "QtIdeaCommentReaction_commentId_idx" ON app_quiktrack."QtIdeaCommentReaction" ("commentId");

-- ── QtIdeaInsight ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtIdeaInsight" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL,
  "ideaId"    text NOT NULL,
  body        text NOT NULL,
  url         text,
  impact      integer NOT NULL DEFAULT 0,
  labels      jsonb,
  "isDeleted" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  "createdBy" text
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QtIdeaInsight_ideaId_fkey') THEN
    ALTER TABLE app_quiktrack."QtIdeaInsight"
      ADD CONSTRAINT "QtIdeaInsight_ideaId_fkey"
      FOREIGN KEY ("ideaId") REFERENCES app_quiktrack."QtIdea"(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "QtIdeaInsight_ideaId_createdAt_idx" ON app_quiktrack."QtIdeaInsight" ("ideaId", "createdAt");
CREATE INDEX IF NOT EXISTS "QtIdeaInsight_orgId_idx" ON app_quiktrack."QtIdeaInsight" ("orgId");

-- ── QtIdeaDelivery ───────────────────────────────────────────────────────────
-- No FK to QtIssue: cross-project + soft-delete tolerant, resolved at read time.
CREATE TABLE IF NOT EXISTS app_quiktrack."QtIdeaDelivery" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL,
  "ideaId"    text NOT NULL,
  "issueId"   text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "createdBy" text
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QtIdeaDelivery_ideaId_fkey') THEN
    ALTER TABLE app_quiktrack."QtIdeaDelivery"
      ADD CONSTRAINT "QtIdeaDelivery_ideaId_fkey"
      FOREIGN KEY ("ideaId") REFERENCES app_quiktrack."QtIdea"(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "QtIdeaDelivery_ideaId_issueId_key"
  ON app_quiktrack."QtIdeaDelivery" ("ideaId", "issueId");
CREATE INDEX IF NOT EXISTS "QtIdeaDelivery_ideaId_idx" ON app_quiktrack."QtIdeaDelivery" ("ideaId");
CREATE INDEX IF NOT EXISTS "QtIdeaDelivery_issueId_idx" ON app_quiktrack."QtIdeaDelivery" ("issueId");
CREATE INDEX IF NOT EXISTS "QtIdeaDelivery_orgId_idx" ON app_quiktrack."QtIdeaDelivery" ("orgId");

-- ── QtIdeaViewComment ────────────────────────────────────────────────────────
-- No FK to QtIdeaView declared in schema.prisma; viewId resolved at read time.
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

CREATE INDEX IF NOT EXISTS "QtIdeaViewComment_viewId_createdAt_idx" ON app_quiktrack."QtIdeaViewComment" ("viewId", "createdAt");
CREATE INDEX IF NOT EXISTS "QtIdeaViewComment_orgId_idx" ON app_quiktrack."QtIdeaViewComment" ("orgId");

-- ── QtIdeaAttachment ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtIdeaAttachment" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL,
  "ideaId"    text NOT NULL,
  "fileName"  text NOT NULL,
  url         text NOT NULL,
  "mimeType"  text,
  size        integer,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "createdBy" text
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QtIdeaAttachment_ideaId_fkey') THEN
    ALTER TABLE app_quiktrack."QtIdeaAttachment"
      ADD CONSTRAINT "QtIdeaAttachment_ideaId_fkey"
      FOREIGN KEY ("ideaId") REFERENCES app_quiktrack."QtIdea"(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "QtIdeaAttachment_ideaId_createdAt_idx" ON app_quiktrack."QtIdeaAttachment" ("ideaId", "createdAt");
CREATE INDEX IF NOT EXISTS "QtIdeaAttachment_orgId_idx" ON app_quiktrack."QtIdeaAttachment" ("orgId");

-- ── QtIdeaLink ───────────────────────────────────────────────────────────────
-- No FK to QtIssue: cross-project reference, resolved at read time.
CREATE TABLE IF NOT EXISTS app_quiktrack."QtIdeaLink" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL,
  "ideaId"    text NOT NULL,
  "issueId"   text NOT NULL,
  "linkType"  text NOT NULL DEFAULT 'relates to',
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "createdBy" text
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QtIdeaLink_ideaId_fkey') THEN
    ALTER TABLE app_quiktrack."QtIdeaLink"
      ADD CONSTRAINT "QtIdeaLink_ideaId_fkey"
      FOREIGN KEY ("ideaId") REFERENCES app_quiktrack."QtIdea"(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "QtIdeaLink_ideaId_issueId_linkType_key"
  ON app_quiktrack."QtIdeaLink" ("ideaId", "issueId", "linkType");
CREATE INDEX IF NOT EXISTS "QtIdeaLink_ideaId_idx" ON app_quiktrack."QtIdeaLink" ("ideaId");
CREATE INDEX IF NOT EXISTS "QtIdeaLink_orgId_idx" ON app_quiktrack."QtIdeaLink" ("orgId");
