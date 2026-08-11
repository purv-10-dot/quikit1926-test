-- QuikTrack: Configurable Workflows (Phase 1) — see
-- apps/quiktrack/WORKFLOW_INTEGRATION_PLAN.md.
-- A workflow is a directed graph over a project's existing QtIssueStatus rows
-- (nodes) + transitions (edges); a workflow scheme maps issue types → workflows
-- per project. Status writes are gated against the active workflow; projects
-- with no PUBLISHED scheme keep today's any→any behaviour (opt-in enforcement).
-- Idempotent so it is safe to apply to the shared prod Neon DB by hand (the
-- build pipeline does not run `migrate deploy`).

-- ── Resolution catalog + issue column ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtResolution" (
  id           text PRIMARY KEY,
  "orgId"      text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  name         text NOT NULL,
  "orderIndex" integer NOT NULL DEFAULT 0,
  "isDeleted"  boolean NOT NULL DEFAULT false,
  "createdAt"  timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"  timestamp(3) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "QtResolution_orgId_name_key"
  ON app_quiktrack."QtResolution" ("orgId", "name");
CREATE INDEX IF NOT EXISTS "QtResolution_orgId_idx"
  ON app_quiktrack."QtResolution" ("orgId");

-- QtIssue.resolutionId — NULL = open (source of truth for "open", not status).
ALTER TABLE app_quiktrack."QtIssue"
  ADD COLUMN IF NOT EXISTS "resolutionId" text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'QtIssue_resolutionId_fkey'
  ) THEN
    ALTER TABLE app_quiktrack."QtIssue"
      ADD CONSTRAINT "QtIssue_resolutionId_fkey"
      FOREIGN KEY ("resolutionId")
      REFERENCES app_quiktrack."QtResolution"(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "QtIssue_resolutionId_idx"
  ON app_quiktrack."QtIssue" ("resolutionId");

-- ── Workflow (graph) ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtWorkflow" (
  id                    text PRIMARY KEY,
  "orgId"               text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "projectId"           text REFERENCES app_quiktrack."QtProject"(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  description           text,
  "isActive"            boolean NOT NULL DEFAULT false,
  "initialTransitionId" text,
  "isDeleted"           boolean NOT NULL DEFAULT false,
  "createdAt"           timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"           timestamp(3) NOT NULL DEFAULT now(),
  "createdBy"           text,
  "updatedBy"           text
);

-- NULLs in projectId are distinct in a Postgres unique index, so org-shared
-- templates (projectId NULL) never collide with each other on name. Enforce
-- template-name uniqueness in the app layer if needed.
CREATE UNIQUE INDEX IF NOT EXISTS "QtWorkflow_orgId_projectId_name_key"
  ON app_quiktrack."QtWorkflow" ("orgId", "projectId", "name");
CREATE INDEX IF NOT EXISTS "QtWorkflow_orgId_idx"
  ON app_quiktrack."QtWorkflow" ("orgId");
CREATE INDEX IF NOT EXISTS "QtWorkflow_projectId_idx"
  ON app_quiktrack."QtWorkflow" ("projectId");

-- ── Workflow ↔ Status (nodes) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtWorkflowStatus" (
  id           text PRIMARY KEY,
  "workflowId" text NOT NULL REFERENCES app_quiktrack."QtWorkflow"(id) ON DELETE CASCADE,
  "statusId"   text NOT NULL REFERENCES app_quiktrack."QtIssueStatus"(id) ON DELETE CASCADE,
  "isInitial"  boolean NOT NULL DEFAULT false,
  x            double precision,
  y            double precision,
  properties   jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS "QtWorkflowStatus_workflowId_statusId_key"
  ON app_quiktrack."QtWorkflowStatus" ("workflowId", "statusId");
CREATE INDEX IF NOT EXISTS "QtWorkflowStatus_statusId_idx"
  ON app_quiktrack."QtWorkflowStatus" ("statusId");

-- ── Transition (edges) ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtWorkflowTransition" (
  id           text PRIMARY KEY,
  "workflowId" text NOT NULL REFERENCES app_quiktrack."QtWorkflow"(id) ON DELETE CASCADE,
  name         text NOT NULL,
  type         text NOT NULL DEFAULT 'NORMAL',
  "toStatusId" text NOT NULL REFERENCES app_quiktrack."QtIssueStatus"(id) ON DELETE CASCADE,
  "orderIndex" integer NOT NULL DEFAULT 0,
  "isDeleted"  boolean NOT NULL DEFAULT false,
  "createdAt"  timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"  timestamp(3) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "QtWorkflowTransition_workflowId_name_key"
  ON app_quiktrack."QtWorkflowTransition" ("workflowId", "name");
CREATE INDEX IF NOT EXISTS "QtWorkflowTransition_workflowId_idx"
  ON app_quiktrack."QtWorkflowTransition" ("workflowId");
CREATE INDEX IF NOT EXISTS "QtWorkflowTransition_toStatusId_idx"
  ON app_quiktrack."QtWorkflowTransition" ("toStatusId");

-- ── Transition source statuses ("From statuses"; empty for GLOBAL/INITIAL) ───
CREATE TABLE IF NOT EXISTS app_quiktrack."QtWorkflowTransitionFrom" (
  "transitionId" text NOT NULL REFERENCES app_quiktrack."QtWorkflowTransition"(id) ON DELETE CASCADE,
  "statusId"     text NOT NULL REFERENCES app_quiktrack."QtIssueStatus"(id) ON DELETE CASCADE,
  PRIMARY KEY ("transitionId", "statusId")
);

CREATE INDEX IF NOT EXISTS "QtWorkflowTransitionFrom_statusId_idx"
  ON app_quiktrack."QtWorkflowTransitionFrom" ("statusId");

-- ── Rules (conditions / validators / post-functions) ────────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtWorkflowRule" (
  id             text PRIMARY KEY,
  "transitionId" text NOT NULL REFERENCES app_quiktrack."QtWorkflowTransition"(id) ON DELETE CASCADE,
  kind           text NOT NULL,
  type           text NOT NULL,
  config         jsonb,
  "errorMessage" text,
  "groupNo"      integer NOT NULL DEFAULT 0,
  "orderNo"      integer NOT NULL DEFAULT 0,
  "createdAt"    timestamp(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "QtWorkflowRule_transitionId_kind_orderNo_idx"
  ON app_quiktrack."QtWorkflowRule" ("transitionId", "kind", "orderNo");

-- ── Workflow scheme (one per project) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtWorkflowScheme" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "projectId" text NOT NULL UNIQUE REFERENCES app_quiktrack."QtProject"(id) ON DELETE CASCADE,
  name        text NOT NULL,
  "hasDraft"  boolean NOT NULL DEFAULT false,
  "draftJson" jsonb,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "QtWorkflowScheme_orgId_idx"
  ON app_quiktrack."QtWorkflowScheme" ("orgId");

-- ── Scheme item (issue-type → workflow; NULL type + isDefault = fallback) ────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtWorkflowSchemeItem" (
  id            text PRIMARY KEY,
  "schemeId"    text NOT NULL REFERENCES app_quiktrack."QtWorkflowScheme"(id) ON DELETE CASCADE,
  "issueTypeId" text REFERENCES app_quiktrack."QtIssueType"(id) ON DELETE CASCADE,
  "workflowId"  text NOT NULL REFERENCES app_quiktrack."QtWorkflow"(id) ON DELETE CASCADE,
  "isDefault"   boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS "QtWorkflowSchemeItem_schemeId_issueTypeId_key"
  ON app_quiktrack."QtWorkflowSchemeItem" ("schemeId", "issueTypeId");
CREATE INDEX IF NOT EXISTS "QtWorkflowSchemeItem_workflowId_idx"
  ON app_quiktrack."QtWorkflowSchemeItem" ("workflowId");

-- ── Transition audit log (append-only; complements QtIssueHistory) ───────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtIssueTransitionLog" (
  id             text PRIMARY KEY,
  "orgId"        text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "issueId"      text NOT NULL REFERENCES app_quiktrack."QtIssue"(id) ON DELETE CASCADE,
  "transitionId" text,
  "fromStatusId" text,
  "toStatusId"   text NOT NULL,
  "actorId"      text,
  reason         text,
  "createdAt"    timestamp(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "QtIssueTransitionLog_orgId_idx"
  ON app_quiktrack."QtIssueTransitionLog" ("orgId");
CREATE INDEX IF NOT EXISTS "QtIssueTransitionLog_issueId_createdAt_idx"
  ON app_quiktrack."QtIssueTransitionLog" ("issueId", "createdAt");
