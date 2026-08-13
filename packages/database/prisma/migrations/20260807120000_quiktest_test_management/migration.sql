-- QuikTest: test management (TestRail-parity) inside QuikTrack — see
-- apps/quiktrack/QUIKTEST_MODULE_PLAN.md.
--
-- Reusable test cases in suites/sections, runs that materialise one test per
-- case, and an APPEND-ONLY result store fed by two write paths (manual runner
-- + CI automation). Coverage links a case to a requirement issue; a failed
-- result links a Bug.
--
-- Idempotent so it is safe to apply to the shared prod Neon DB by hand (the
-- build pipeline does not run `migrate deploy`). Purely additive: no existing
-- table is altered, and issue references carry no FK (QtIdeaLink precedent), so
-- nothing here can cascade into QtIssue.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ THIS FILE CARRIES THREE THINGS PRISMA CANNOT EXPRESS.                    │
-- │ If it is ever lost, the module silently loses its core guarantees:       │
-- │   1. the APPEND-ONLY trigger on QtTestResult / QtTestStepResult          │
-- │   2. partial unique indexes (automationId per project, build per         │
-- │      project, one default status per org)                                │
-- │   3. the refId allocation function                                       │
-- │ A future `prisma db push` will NOT recreate them. Re-run this file after │
-- │ any such push, and keep the guard test in                               │
-- │ apps/quiktrack/__tests__/api/ that asserts the trigger exists.           │
-- └──────────────────────────────────────────────────────────────────────────┘

-- ── Repository: suites, sections, cases ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestSuite" (
  id            text PRIMARY KEY,
  "orgId"       text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "projectId"   text NOT NULL REFERENCES app_quiktrack."QtProject"(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  "isBaseline"  boolean NOT NULL DEFAULT false,
  "archivedAt"  timestamp(3),
  "isDeleted"   boolean NOT NULL DEFAULT false,
  "createdAt"   timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"   timestamp(3) NOT NULL DEFAULT now(),
  "createdBy"   text
);
CREATE INDEX IF NOT EXISTS "QtTestSuite_orgId_idx"
  ON app_quiktrack."QtTestSuite" ("orgId");
CREATE INDEX IF NOT EXISTS "QtTestSuite_projectId_isDeleted_idx"
  ON app_quiktrack."QtTestSuite" ("projectId", "isDeleted");

CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestSection" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "suiteId"   text NOT NULL REFERENCES app_quiktrack."QtTestSuite"(id) ON DELETE CASCADE,
  "parentId"  text REFERENCES app_quiktrack."QtTestSection"(id) ON DELETE CASCADE,
  name        text NOT NULL,
  "orderNo"   integer NOT NULL DEFAULT 0,
  "isDeleted" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "QtTestSection_orgId_idx"
  ON app_quiktrack."QtTestSection" ("orgId");
CREATE INDEX IF NOT EXISTS "QtTestSection_suiteId_parentId_orderNo_idx"
  ON app_quiktrack."QtTestSection" ("suiteId", "parentId", "orderNo");

CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestTemplate" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "projectId" text,
  name        text NOT NULL,
  "fieldIds"  jsonb,
  "isDeleted" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "QtTestTemplate_orgId_idx"
  ON app_quiktrack."QtTestTemplate" ("orgId");
CREATE INDEX IF NOT EXISTS "QtTestTemplate_projectId_idx"
  ON app_quiktrack."QtTestTemplate" ("projectId");

CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestCase" (
  id                 text PRIMARY KEY,
  "orgId"            text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "projectId"        text NOT NULL,
  "sectionId"        text NOT NULL REFERENCES app_quiktrack."QtTestSection"(id) ON DELETE CASCADE,
  "refId"            integer NOT NULL,
  title              text NOT NULL,
  description        text,
  preconditions      text,
  priority           text NOT NULL DEFAULT 'MEDIUM',
  type               text NOT NULL DEFAULT 'FUNCTIONAL',
  "automationStatus" text NOT NULL DEFAULT 'MANUAL',
  "automationId"     text,
  "ownerId"          text,
  "estimateMs"       integer,
  "templateId"       text REFERENCES app_quiktrack."QtTestTemplate"(id),
  "approvalState"    text NOT NULL DEFAULT 'DRAFT',
  "currentVersion"   integer NOT NULL DEFAULT 1,
  "isDeleted"        boolean NOT NULL DEFAULT false,
  "createdAt"        timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"        timestamp(3) NOT NULL DEFAULT now(),
  "createdBy"        text,
  "updatedBy"        text
);
CREATE UNIQUE INDEX IF NOT EXISTS "QtTestCase_projectId_refId_key"
  ON app_quiktrack."QtTestCase" ("projectId", "refId");
CREATE INDEX IF NOT EXISTS "QtTestCase_orgId_idx"
  ON app_quiktrack."QtTestCase" ("orgId");
CREATE INDEX IF NOT EXISTS "QtTestCase_sectionId_isDeleted_idx"
  ON app_quiktrack."QtTestCase" ("sectionId", "isDeleted");
CREATE INDEX IF NOT EXISTS "QtTestCase_projectId_automationId_idx"
  ON app_quiktrack."QtTestCase" ("projectId", "automationId");

-- PARTIAL UNIQUE (Prisma cannot express): an automation id must be unique per
-- project, but many cases legitimately have none. A plain unique index would
-- collapse every NULL-free row AND reject a second manual-only case.
CREATE UNIQUE INDEX IF NOT EXISTS "QtTestCase_projectId_automationId_uniq"
  ON app_quiktrack."QtTestCase" ("projectId", "automationId")
  WHERE "automationId" IS NOT NULL AND "isDeleted" = false;

CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestCaseStep" (
  id         text PRIMARY KEY,
  "orgId"    text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "caseId"   text NOT NULL REFERENCES app_quiktrack."QtTestCase"(id) ON DELETE CASCADE,
  "orderNo"  integer NOT NULL,
  action     text NOT NULL,
  expected   text
);
CREATE UNIQUE INDEX IF NOT EXISTS "QtTestCaseStep_caseId_orderNo_key"
  ON app_quiktrack."QtTestCaseStep" ("caseId", "orderNo");
CREATE INDEX IF NOT EXISTS "QtTestCaseStep_orgId_idx"
  ON app_quiktrack."QtTestCaseStep" ("orgId");

CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestCaseVersion" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "caseId"    text NOT NULL REFERENCES app_quiktrack."QtTestCase"(id) ON DELETE CASCADE,
  "versionNo" integer NOT NULL,
  snapshot    jsonb NOT NULL,
  "editedBy"  text,
  "editedAt"  timestamp(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "QtTestCaseVersion_caseId_versionNo_key"
  ON app_quiktrack."QtTestCaseVersion" ("caseId", "versionNo");
CREATE INDEX IF NOT EXISTS "QtTestCaseVersion_orgId_idx"
  ON app_quiktrack."QtTestCaseVersion" ("orgId");

CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestCaseApproval" (
  id           text PRIMARY KEY,
  "orgId"      text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "caseId"     text NOT NULL REFERENCES app_quiktrack."QtTestCase"(id) ON DELETE CASCADE,
  state        text NOT NULL,
  "reviewerId" text,
  note         text,
  "createdAt"  timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "QtTestCaseApproval_orgId_idx"
  ON app_quiktrack."QtTestCaseApproval" ("orgId");
CREATE INDEX IF NOT EXISTS "QtTestCaseApproval_caseId_createdAt_idx"
  ON app_quiktrack."QtTestCaseApproval" ("caseId", "createdAt");

CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestCaseParam" (
  id       text PRIMARY KEY,
  "orgId"  text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "caseId" text NOT NULL REFERENCES app_quiktrack."QtTestCase"(id) ON DELETE CASCADE,
  name     text NOT NULL,
  values   jsonb NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "QtTestCaseParam_caseId_name_key"
  ON app_quiktrack."QtTestCaseParam" ("caseId", "name");
CREATE INDEX IF NOT EXISTS "QtTestCaseParam_orgId_idx"
  ON app_quiktrack."QtTestCaseParam" ("orgId");

CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestCaseDependency" (
  id                text PRIMARY KEY,
  "orgId"           text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "caseId"          text NOT NULL REFERENCES app_quiktrack."QtTestCase"(id) ON DELETE CASCADE,
  "dependsOnCaseId" text NOT NULL REFERENCES app_quiktrack."QtTestCase"(id) ON DELETE CASCADE,
  "createdAt"       timestamp(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "QtTestCaseDependency_caseId_dependsOnCaseId_key"
  ON app_quiktrack."QtTestCaseDependency" ("caseId", "dependsOnCaseId");
CREATE INDEX IF NOT EXISTS "QtTestCaseDependency_orgId_idx"
  ON app_quiktrack."QtTestCaseDependency" ("orgId");

-- A case may not be its own prerequisite. Deeper cycles need a graph walk and
-- are checked in the service layer.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'QtTestCaseDependency_no_self'
  ) THEN
    ALTER TABLE app_quiktrack."QtTestCaseDependency"
      ADD CONSTRAINT "QtTestCaseDependency_no_self"
      CHECK ("caseId" <> "dependsOnCaseId");
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestTag" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "projectId" text,
  name        text NOT NULL,
  color       text,
  "createdAt" timestamp(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "QtTestTag_orgId_projectId_name_key"
  ON app_quiktrack."QtTestTag" ("orgId", "projectId", "name");
CREATE INDEX IF NOT EXISTS "QtTestTag_orgId_idx"
  ON app_quiktrack."QtTestTag" ("orgId");

CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestCaseTag" (
  "orgId"  text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "caseId" text NOT NULL REFERENCES app_quiktrack."QtTestCase"(id) ON DELETE CASCADE,
  "tagId"  text NOT NULL REFERENCES app_quiktrack."QtTestTag"(id) ON DELETE CASCADE,
  CONSTRAINT "QtTestCaseTag_pkey" PRIMARY KEY ("caseId", "tagId")
);
CREATE INDEX IF NOT EXISTS "QtTestCaseTag_orgId_idx"
  ON app_quiktrack."QtTestCaseTag" ("orgId");
CREATE INDEX IF NOT EXISTS "QtTestCaseTag_tagId_idx"
  ON app_quiktrack."QtTestCaseTag" ("tagId");

CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestBaseline" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "suiteId"   text NOT NULL REFERENCES app_quiktrack."QtTestSuite"(id) ON DELETE CASCADE,
  name        text NOT NULL,
  snapshot    jsonb NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "createdBy" text
);
CREATE INDEX IF NOT EXISTS "QtTestBaseline_orgId_idx"
  ON app_quiktrack."QtTestBaseline" ("orgId");
CREATE INDEX IF NOT EXISTS "QtTestBaseline_suiteId_createdAt_idx"
  ON app_quiktrack."QtTestBaseline" ("suiteId", "createdAt");

-- Coverage link. `issueId` deliberately carries NO foreign key (QtIdeaLink
-- precedent) so this migration stays additive and issue deletion can never
-- cascade into test data.
CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestCaseIssueLink" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "caseId"    text NOT NULL REFERENCES app_quiktrack."QtTestCase"(id) ON DELETE CASCADE,
  "issueId"   text NOT NULL,
  type        text NOT NULL DEFAULT 'covers',
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "createdBy" text
);
CREATE UNIQUE INDEX IF NOT EXISTS "QtTestCaseIssueLink_caseId_issueId_type_key"
  ON app_quiktrack."QtTestCaseIssueLink" ("caseId", "issueId", "type");
CREATE INDEX IF NOT EXISTS "QtTestCaseIssueLink_orgId_idx"
  ON app_quiktrack."QtTestCaseIssueLink" ("orgId");
CREATE INDEX IF NOT EXISTS "QtTestCaseIssueLink_issueId_idx"
  ON app_quiktrack."QtTestCaseIssueLink" ("issueId");

-- ── Planning: milestones, plans, configurations ─────────────────────────────

CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestMilestone" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "projectId" text NOT NULL REFERENCES app_quiktrack."QtProject"(id) ON DELETE CASCADE,
  "parentId"  text REFERENCES app_quiktrack."QtTestMilestone"(id) ON DELETE SET NULL,
  name        text NOT NULL,
  "dueDate"   timestamp(3),
  state       text NOT NULL DEFAULT 'open',
  "isDeleted" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "QtTestMilestone_orgId_idx"
  ON app_quiktrack."QtTestMilestone" ("orgId");
CREATE INDEX IF NOT EXISTS "QtTestMilestone_projectId_state_idx"
  ON app_quiktrack."QtTestMilestone" ("projectId", "state");

CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestPlan" (
  id            text PRIMARY KEY,
  "orgId"       text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "projectId"   text NOT NULL REFERENCES app_quiktrack."QtProject"(id) ON DELETE CASCADE,
  "milestoneId" text REFERENCES app_quiktrack."QtTestMilestone"(id) ON DELETE SET NULL,
  name          text NOT NULL,
  description   text,
  "startDate"   timestamp(3),
  "endDate"     timestamp(3),
  "isDeleted"   boolean NOT NULL DEFAULT false,
  "createdAt"   timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"   timestamp(3) NOT NULL DEFAULT now(),
  "createdBy"   text
);
CREATE INDEX IF NOT EXISTS "QtTestPlan_orgId_idx"
  ON app_quiktrack."QtTestPlan" ("orgId");
CREATE INDEX IF NOT EXISTS "QtTestPlan_projectId_isDeleted_idx"
  ON app_quiktrack."QtTestPlan" ("projectId", "isDeleted");

CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestConfigGroup" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "projectId" text NOT NULL,
  name        text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "QtTestConfigGroup_projectId_name_key"
  ON app_quiktrack."QtTestConfigGroup" ("projectId", "name");
CREATE INDEX IF NOT EXISTS "QtTestConfigGroup_orgId_idx"
  ON app_quiktrack."QtTestConfigGroup" ("orgId");

CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestConfig" (
  id        text PRIMARY KEY,
  "orgId"   text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "groupId" text NOT NULL REFERENCES app_quiktrack."QtTestConfigGroup"(id) ON DELETE CASCADE,
  name      text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "QtTestConfig_groupId_name_key"
  ON app_quiktrack."QtTestConfig" ("groupId", "name");
CREATE INDEX IF NOT EXISTS "QtTestConfig_orgId_idx"
  ON app_quiktrack."QtTestConfig" ("orgId");

-- ── Status catalogue ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestStatus" (
  id             text PRIMARY KEY,
  "orgId"        text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  key            text NOT NULL,
  label          text NOT NULL,
  color          text NOT NULL DEFAULT '#94a3b8',
  "isFinal"      boolean NOT NULL DEFAULT true,
  "isDefault"    boolean NOT NULL DEFAULT false,
  "isAutomation" boolean NOT NULL DEFAULT false,
  "orderNo"      integer NOT NULL DEFAULT 0,
  "isDeleted"    boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS "QtTestStatus_orgId_key_key"
  ON app_quiktrack."QtTestStatus" ("orgId", "key");
CREATE INDEX IF NOT EXISTS "QtTestStatus_orgId_idx"
  ON app_quiktrack."QtTestStatus" ("orgId");

-- PARTIAL UNIQUE (Prisma cannot express): exactly one default status per org.
CREATE UNIQUE INDEX IF NOT EXISTS "QtTestStatus_orgId_default_uniq"
  ON app_quiktrack."QtTestStatus" ("orgId")
  WHERE "isDefault" = true;

-- ── Execution: runs, tests ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestRun" (
  id            text PRIMARY KEY,
  "orgId"       text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "projectId"   text NOT NULL REFERENCES app_quiktrack."QtProject"(id) ON DELETE CASCADE,
  "planId"      text REFERENCES app_quiktrack."QtTestPlan"(id) ON DELETE SET NULL,
  "suiteId"     text REFERENCES app_quiktrack."QtTestSuite"(id) ON DELETE SET NULL,
  "baselineId"  text REFERENCES app_quiktrack."QtTestBaseline"(id) ON DELETE SET NULL,
  "milestoneId" text REFERENCES app_quiktrack."QtTestMilestone"(id) ON DELETE SET NULL,
  "refId"       integer NOT NULL,
  name          text NOT NULL,
  description   text,
  source        text NOT NULL DEFAULT 'manual',
  state         text NOT NULL DEFAULT 'open',
  build         text,
  environment   text,
  "assigneeId"  text,
  "isDeleted"   boolean NOT NULL DEFAULT false,
  "createdAt"   timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"   timestamp(3) NOT NULL DEFAULT now(),
  "createdBy"   text,
  "closedAt"    timestamp(3),
  "closedBy"    text
);
CREATE UNIQUE INDEX IF NOT EXISTS "QtTestRun_projectId_refId_key"
  ON app_quiktrack."QtTestRun" ("projectId", "refId");
CREATE INDEX IF NOT EXISTS "QtTestRun_orgId_idx"
  ON app_quiktrack."QtTestRun" ("orgId");
CREATE INDEX IF NOT EXISTS "QtTestRun_projectId_state_idx"
  ON app_quiktrack."QtTestRun" ("projectId", "state");
CREATE INDEX IF NOT EXISTS "QtTestRun_milestoneId_idx"
  ON app_quiktrack."QtTestRun" ("milestoneId");

-- PARTIAL UNIQUE (Prisma cannot express): one automated run per build per
-- project. This is what makes CI find-or-create idempotent — re-running build
-- 1.4.0 attaches to the existing run instead of duplicating it. Scoped to
-- automated/mixed runs so manual runs may freely share a build label.
CREATE UNIQUE INDEX IF NOT EXISTS "QtTestRun_projectId_build_uniq"
  ON app_quiktrack."QtTestRun" ("projectId", "build")
  WHERE "build" IS NOT NULL AND "isDeleted" = false AND source <> 'manual';

CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestRunConfig" (
  "orgId"    text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "runId"    text NOT NULL REFERENCES app_quiktrack."QtTestRun"(id) ON DELETE CASCADE,
  "configId" text NOT NULL REFERENCES app_quiktrack."QtTestConfig"(id) ON DELETE CASCADE,
  CONSTRAINT "QtTestRunConfig_pkey" PRIMARY KEY ("runId", "configId")
);
CREATE INDEX IF NOT EXISTS "QtTestRunConfig_orgId_idx"
  ON app_quiktrack."QtTestRunConfig" ("orgId");
CREATE INDEX IF NOT EXISTS "QtTestRunConfig_configId_idx"
  ON app_quiktrack."QtTestRunConfig" ("configId");

CREATE TABLE IF NOT EXISTS app_quiktrack."QtTest" (
  id                text PRIMARY KEY,
  "orgId"           text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "runId"           text NOT NULL REFERENCES app_quiktrack."QtTestRun"(id) ON DELETE CASCADE,
  "caseId"          text NOT NULL REFERENCES app_quiktrack."QtTestCase"(id) ON DELETE CASCADE,
  "configId"        text REFERENCES app_quiktrack."QtTestConfig"(id) ON DELETE SET NULL,
  "refId"           integer NOT NULL,
  "caseVersion"     integer NOT NULL,
  "assigneeId"      text,
  "currentStatusId" text NOT NULL REFERENCES app_quiktrack."QtTestStatus"(id),
  "createdAt"       timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"       timestamp(3) NOT NULL DEFAULT now()
);
-- NOTE: with configId NULL, Postgres treats each row as distinct under a plain
-- unique index, so a per-case duplicate is additionally guarded below.
CREATE UNIQUE INDEX IF NOT EXISTS "QtTest_runId_caseId_configId_key"
  ON app_quiktrack."QtTest" ("runId", "caseId", "configId");
CREATE UNIQUE INDEX IF NOT EXISTS "QtTest_runId_caseId_noconfig_uniq"
  ON app_quiktrack."QtTest" ("runId", "caseId")
  WHERE "configId" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "QtTest_runId_refId_key"
  ON app_quiktrack."QtTest" ("runId", "refId");
CREATE INDEX IF NOT EXISTS "QtTest_orgId_idx"
  ON app_quiktrack."QtTest" ("orgId");
CREATE INDEX IF NOT EXISTS "QtTest_runId_currentStatusId_idx"
  ON app_quiktrack."QtTest" ("runId", "currentStatusId");
CREATE INDEX IF NOT EXISTS "QtTest_caseId_idx"
  ON app_quiktrack."QtTest" ("caseId");
CREATE INDEX IF NOT EXISTS "QtTest_assigneeId_idx"
  ON app_quiktrack."QtTest" ("assigneeId");

-- ── THE TRAIL (append-only) ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestResult" (
  id               text PRIMARY KEY,
  "orgId"          text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "testId"         text NOT NULL REFERENCES app_quiktrack."QtTest"(id) ON DELETE CASCADE,
  "runId"          text NOT NULL REFERENCES app_quiktrack."QtTestRun"(id) ON DELETE CASCADE,
  "statusId"       text NOT NULL REFERENCES app_quiktrack."QtTestStatus"(id),
  source           text NOT NULL,
  "executedBy"     text,
  "executedAt"     timestamp(3) NOT NULL DEFAULT now(),
  "elapsedMs"      integer,
  comment          text,
  "failureMessage" text,
  "stackTrace"     text,
  build            text,
  "ciUrl"          text,
  "paramRow"       jsonb,
  "createdAt"      timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "QtTestResult_source_check" CHECK (source IN ('manual', 'automated'))
);
CREATE INDEX IF NOT EXISTS "QtTestResult_orgId_idx"
  ON app_quiktrack."QtTestResult" ("orgId");
-- (testId, createdAt) is the history query; the trailing id breaks ties so
-- "latest result" is deterministic under concurrent inserts.
CREATE INDEX IF NOT EXISTS "QtTestResult_testId_createdAt_idx"
  ON app_quiktrack."QtTestResult" ("testId", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "QtTestResult_runId_source_idx"
  ON app_quiktrack."QtTestResult" ("runId", "source");
CREATE INDEX IF NOT EXISTS "QtTestResult_executedBy_createdAt_idx"
  ON app_quiktrack."QtTestResult" ("executedBy", "createdAt");

CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestStepResult" (
  id         text PRIMARY KEY,
  "orgId"    text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "resultId" text NOT NULL REFERENCES app_quiktrack."QtTestResult"(id) ON DELETE CASCADE,
  "stepId"   text NOT NULL REFERENCES app_quiktrack."QtTestCaseStep"(id) ON DELETE CASCADE,
  "statusId" text NOT NULL REFERENCES app_quiktrack."QtTestStatus"(id),
  comment    text
);
CREATE UNIQUE INDEX IF NOT EXISTS "QtTestStepResult_resultId_stepId_key"
  ON app_quiktrack."QtTestStepResult" ("resultId", "stepId");
CREATE INDEX IF NOT EXISTS "QtTestStepResult_orgId_idx"
  ON app_quiktrack."QtTestStepResult" ("orgId");

CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestResultAttachment" (
  id           text PRIMARY KEY,
  "orgId"      text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "resultId"   text NOT NULL REFERENCES app_quiktrack."QtTestResult"(id) ON DELETE CASCADE,
  "fileName"   text NOT NULL,
  "mimeType"   text NOT NULL,
  "sizeBytes"  integer NOT NULL,
  "s3Key"      text NOT NULL,
  "uploadedBy" text,
  "createdAt"  timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "QtTestResultAttachment_orgId_idx"
  ON app_quiktrack."QtTestResultAttachment" ("orgId");
CREATE INDEX IF NOT EXISTS "QtTestResultAttachment_resultId_idx"
  ON app_quiktrack."QtTestResultAttachment" ("resultId");

-- Defect link. `issueId` carries NO foreign key on purpose: closing or
-- deleting a Bug must never rewrite the historical result that found it.
CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestDefectLink" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "resultId"  text NOT NULL REFERENCES app_quiktrack."QtTestResult"(id) ON DELETE CASCADE,
  "issueId"   text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "createdBy" text
);
CREATE UNIQUE INDEX IF NOT EXISTS "QtTestDefectLink_resultId_issueId_key"
  ON app_quiktrack."QtTestDefectLink" ("resultId", "issueId");
CREATE INDEX IF NOT EXISTS "QtTestDefectLink_orgId_idx"
  ON app_quiktrack."QtTestDefectLink" ("orgId");
CREATE INDEX IF NOT EXISTS "QtTestDefectLink_issueId_idx"
  ON app_quiktrack."QtTestDefectLink" ("issueId");

CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestUnmatchedAutomationId" (
  id             text PRIMARY KEY,
  "orgId"        text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "runId"        text NOT NULL REFERENCES app_quiktrack."QtTestRun"(id) ON DELETE CASCADE,
  "automationId" text NOT NULL,
  count          integer NOT NULL DEFAULT 1,
  "firstSeenAt"  timestamp(3) NOT NULL DEFAULT now(),
  "lastSeenAt"   timestamp(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "QtTestUnmatchedAutomationId_runId_automationId_key"
  ON app_quiktrack."QtTestUnmatchedAutomationId" ("runId", "automationId");
CREATE INDEX IF NOT EXISTS "QtTestUnmatchedAutomationId_orgId_idx"
  ON app_quiktrack."QtTestUnmatchedAutomationId" ("orgId");

CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestSchedule" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "projectId" text NOT NULL REFERENCES app_quiktrack."QtProject"(id) ON DELETE CASCADE,
  "suiteId"   text,
  "planId"    text,
  name        text NOT NULL,
  cron        text NOT NULL,
  "isEnabled" boolean NOT NULL DEFAULT true,
  "nextRunAt" timestamp(3),
  "lastRunAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  "createdBy" text
);
CREATE INDEX IF NOT EXISTS "QtTestSchedule_orgId_idx"
  ON app_quiktrack."QtTestSchedule" ("orgId");
CREATE INDEX IF NOT EXISTS "QtTestSchedule_isEnabled_nextRunAt_idx"
  ON app_quiktrack."QtTestSchedule" ("isEnabled", "nextRunAt");

-- ── refId allocation ───────────────────────────────────────────────────────
-- Human-facing ids (TC-1042, R13) come from a counter row rather than
-- MAX(refId)+1, which races under concurrent CI writes. The UPDATE takes a row
-- lock, so parallel allocations serialise instead of colliding.

CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestRefCounter" (
  "orgId"     text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "projectId" text NOT NULL,
  kind        text NOT NULL,
  "nextValue" integer NOT NULL DEFAULT 1,
  CONSTRAINT "QtTestRefCounter_pkey" PRIMARY KEY ("projectId", "kind")
);
CREATE INDEX IF NOT EXISTS "QtTestRefCounter_orgId_idx"
  ON app_quiktrack."QtTestRefCounter" ("orgId");

CREATE OR REPLACE FUNCTION app_quiktrack.qt_test_next_ref(
  p_org_id text,
  p_project_id text,
  p_kind text
) RETURNS integer AS $$
DECLARE
  v_next integer;
BEGIN
  INSERT INTO app_quiktrack."QtTestRefCounter" ("orgId", "projectId", kind, "nextValue")
  VALUES (p_org_id, p_project_id, p_kind, 2)
  ON CONFLICT ("projectId", kind) DO UPDATE
    SET "nextValue" = app_quiktrack."QtTestRefCounter"."nextValue" + 1
  RETURNING "nextValue" - 1 INTO v_next;
  RETURN v_next;
END;
$$ LANGUAGE plpgsql;

-- ── APPEND-ONLY ENFORCEMENT ────────────────────────────────────────────────
-- The core guarantee of the whole module: a result, once written, is immutable.
-- Enforced HERE at the database so that no application bug, migration script,
-- admin console or ORM misuse can rewrite history. A correction is a new row.
--
-- Deliberately not a permission GRANT: the app connects as the table owner in
-- every environment, and owners bypass column privileges. A trigger applies to
-- everyone, owner included.

CREATE OR REPLACE FUNCTION app_quiktrack.qt_test_result_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'QtTestResult is append-only: % on %.% is not permitted. Post a new result to correct a mistake.',
    TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "qt_test_result_no_mutate" ON app_quiktrack."QtTestResult";
CREATE TRIGGER "qt_test_result_no_mutate"
  BEFORE UPDATE OR DELETE ON app_quiktrack."QtTestResult"
  FOR EACH ROW EXECUTE FUNCTION app_quiktrack.qt_test_result_append_only();

-- Per-step results are part of the same immutable record.
DROP TRIGGER IF EXISTS "qt_test_step_result_no_mutate" ON app_quiktrack."QtTestStepResult";
CREATE TRIGGER "qt_test_step_result_no_mutate"
  BEFORE UPDATE OR DELETE ON app_quiktrack."QtTestStepResult"
  FOR EACH ROW EXECUTE FUNCTION app_quiktrack.qt_test_result_append_only();

-- Cascade note: deleting a run or test DOES remove its results (FK ON DELETE
-- CASCADE fires a row-level DELETE, which the trigger above blocks — so a run
-- with results cannot be hard-deleted at all). That is intentional: runs are
-- closed or soft-deleted (`isDeleted`), never dropped. Purging a project
-- deliberately requires disabling the trigger, which is an auditable act.

-- ── Seed the status catalogue for every existing org ───────────────────────
-- Nine statuses: the four manual outcomes, Retest, the Untested default, and
-- the three automation buckets the reference UI reports separately.

INSERT INTO app_quiktrack."QtTestStatus"
  (id, "orgId", key, label, color, "isFinal", "isDefault", "isAutomation", "orderNo")
SELECT
  'qts_' || o.id || '_' || s.key,
  o.id, s.key, s.label, s.color, s.is_final, s.is_default, s.is_automation, s.order_no
FROM quikit."Org" o
CROSS JOIN (VALUES
  ('passed',            'Passed',            '#22c55e', true,  false, false, 1),
  ('blocked',           'Blocked',           '#374151', true,  false, false, 2),
  ('skipped',           'Skipped',           '#facc15', true,  false, false, 3),
  ('failed',            'Failed',            '#e11d48', true,  false, false, 4),
  ('retest',            'Retest',            '#3b82f6', false, false, false, 5),
  ('untested',          'Untested',          '#9ca3af', false, true,  false, 6),
  ('automation_passed', 'Automation Passed', '#15803d', true,  false, true,  7),
  ('automation_failed', 'Automation Failed', '#dc2626', true,  false, true,  8),
  ('automation_error',  'Automation Error',  '#9ca3af', true,  false, true,  9)
) AS s(key, label, color, is_final, is_default, is_automation, order_no)
ON CONFLICT ("orgId", key) DO NOTHING;

-- ── Register the 'Execute Tests' permission family ─────────────────────────
-- Grants the seven QuikTest resources to every existing admin-tier app role so
-- the module is reachable immediately after deploy. Non-admin roles get nothing
-- until an org admin grants it — matching how every other resource behaves.

INSERT INTO app_quiktrack."RolePermission" (id, "roleId", resource, action)
SELECT
  'qtp_' || r.id || '_' || p.resource || '_' || p.action,
  r.id, p.resource, p.action
-- NOTE: QtAppRole maps to the table "AppRole" and QtRolePermission to
-- "RolePermission" (@@map in schema.prisma) — use the physical names here.
FROM app_quiktrack."AppRole" r
CROSS JOIN (VALUES
  ('TestCase', 'view'), ('TestCase', 'create'), ('TestCase', 'update'), ('TestCase', 'delete'),
  ('TestSuite', 'view'), ('TestSuite', 'create'), ('TestSuite', 'update'), ('TestSuite', 'delete'),
  ('TestPlan', 'view'), ('TestPlan', 'create'), ('TestPlan', 'update'),
  ('TestRun', 'view'), ('TestRun', 'create'), ('TestRun', 'update'),
  ('TestResult', 'view'), ('TestResult', 'create'),
  ('TestCaseApproval', 'create'),
  ('TestReport', 'view')
) AS p(resource, action)
WHERE r."isSystem" = true
ON CONFLICT ("roleId", resource, action) DO NOTHING;
