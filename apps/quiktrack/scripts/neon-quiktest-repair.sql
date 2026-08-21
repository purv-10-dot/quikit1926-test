-- =============================================================================
-- QuikTest — Neon repair: the objects `prisma db push` cannot create
-- =============================================================================
--
-- WHY THIS EXISTS
--
-- Creating a test case on Vercel fails with:
--
--     ERROR: function app_quiktrack.qt_test_next_ref(text, text, text) does not exist
--
-- The QuikTest TABLES are present in Neon (suites, cases and templates all load),
-- but the migrations' NON-TABLE objects are not. That is the signature of schema
-- applied with `prisma db push`, which syncs tables and columns from
-- schema.prisma and nothing else: Prisma cannot express functions, triggers,
-- partial indexes or CHECK constraints, so those only exist if the .sql files
-- were run by hand.
--
-- Postgres reports the signature it TRIED to resolve, so "(text, text, text)
-- does not exist" means there is no such function at all — the arity is a red
-- herring, not a mismatch.
--
-- WHAT THIS FIXES, IN ORDER OF SEVERITY
--
--   1. qt_test_next_ref()            — case/run numbering. Without it, creating
--                                      any case or run fails outright (loud).
--   2. append-only triggers          — WORST, because it fails SILENTLY. The
--                                      result-history UI tells users "results are
--                                      append-only, so this is the full record".
--                                      Without these triggers that claim is false
--                                      and results are quietly editable.
--   3. partial unique indexes        — duplicate automation ids, duplicate CI
--                                      runs per build, two default statuses per
--                                      org, the same case materialised twice in a
--                                      run. All silent data problems.
--   4. CHECK constraints             — inverted run date windows, invalid enum
--                                      values.
--
-- SAFETY
--
-- Every statement is idempotent: CREATE OR REPLACE FUNCTION, CREATE ... IF NOT
-- EXISTS, and constraints guarded by a pg_constraint lookup. Re-running changes
-- nothing. NOTHING here drops or alters a table, and no row is deleted.
--
-- Sourced verbatim from:
--   packages/database/prisma/migrations/20260807120000_quiktest_test_management/migration.sql
--   packages/database/prisma/migrations/20260807140000_quiktest_testrail_parity/migration.sql
--
-- HOW TO RUN
--
--   1. Run STEP 0 alone first. It only READS — it reports what is missing.
--   2. If step 0 shows missing objects, run STEP 1..5.
--   3. Run STEP 6 to confirm everything now reports present.
--
-- A partial unique index can FAIL if data already violates it (see step 3's
-- note). That is information, not a defect — fix the duplicates, then re-run.
-- =============================================================================


-- =============================================================================
-- STEP 0 — DIAGNOSE (read-only; safe to run any time)
-- =============================================================================
-- Run this by itself first. Anything reported as MISSING is what steps 1-5 add.

SELECT 'function: qt_test_next_ref' AS object,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'app_quiktrack' AND p.proname = 'qt_test_next_ref'
       ) THEN 'present' ELSE 'MISSING' END AS status
UNION ALL
SELECT 'function: qt_test_result_append_only',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'app_quiktrack' AND p.proname = 'qt_test_result_append_only'
       ) THEN 'present' ELSE 'MISSING' END
UNION ALL
SELECT 'trigger: qt_test_result_no_mutate  (APPEND-ONLY GUARANTEE)',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_trigger WHERE tgname = 'qt_test_result_no_mutate' AND NOT tgisinternal
       ) THEN 'present' ELSE 'MISSING' END
UNION ALL
SELECT 'trigger: qt_test_step_result_no_mutate  (APPEND-ONLY GUARANTEE)',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_trigger WHERE tgname = 'qt_test_step_result_no_mutate' AND NOT tgisinternal
       ) THEN 'present' ELSE 'MISSING' END
UNION ALL
SELECT 'index: ' || i.name,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'app_quiktrack' AND c.relname = i.name
       ) THEN 'present' ELSE 'MISSING' END
FROM (VALUES
  ('QtTestCase_projectId_automationId_uniq'),
  ('QtTestStatus_orgId_default_uniq'),
  ('QtTestRun_projectId_build_uniq'),
  ('QtTest_runId_caseId_noconfig_uniq'),
  ('QtTestTemplate_orgId_default_uniq')
) AS i(name)
UNION ALL
SELECT 'constraint: ' || k.name,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_constraint WHERE conname = k.name
       ) THEN 'present' ELSE 'MISSING' END
FROM (VALUES
  ('QtTestCaseDependency_no_self'),
  ('QtTestRun_date_order_check'),
  ('QtTestCase_automationCandidate_check'),
  ('QtTestTemplate_kind_check')
) AS k(name)
ORDER BY 2 DESC, 1;


-- =============================================================================
-- STEP 1 — the ref-counter function (fixes the reported error)
-- =============================================================================
-- Allocates the per-project sequential number rendered as TC-1042 / R13. The
-- INSERT ... ON CONFLICT DO UPDATE makes allocation atomic, so two concurrent
-- case creations cannot receive the same number.

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


-- =============================================================================
-- STEP 2 — APPEND-ONLY ENFORCEMENT (the most important part)
-- =============================================================================
-- The core guarantee of the module: a result, once written, is immutable. It is a
-- TRIGGER rather than a permission GRANT because the app connects as the table
-- owner in every environment, and owners bypass column privileges — a trigger
-- applies to everyone, owner included.
--
-- Until this exists, the result-history panel's claim that results cannot be
-- rewritten is untrue.

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

-- Cascade note: because the trigger is row-level, a run with results cannot be
-- hard-deleted at all (the FK's cascade fires a DELETE the trigger blocks). That
-- is intentional — runs are closed or soft-deleted, never dropped.


-- =============================================================================
-- STEP 3 — PARTIAL UNIQUE INDEXES (Prisma cannot express these)
-- =============================================================================
-- If any of these FAILS, it is because existing data already violates the rule.
-- That is a genuine finding, not a script defect: the duplicate rows have been
-- accepted until now precisely BECAUSE the index was missing. Find them with the
-- queries in the comment above each, fix, then re-run.

-- An automation id must be unique per project, but most cases legitimately have
-- none. A plain unique index would collapse every NULL and reject a second
-- manual-only case.
--   Find offenders:
--     SELECT "projectId", "automationId", count(*) FROM app_quiktrack."QtTestCase"
--     WHERE "automationId" IS NOT NULL AND "isDeleted" = false
--     GROUP BY 1,2 HAVING count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS "QtTestCase_projectId_automationId_uniq"
  ON app_quiktrack."QtTestCase" ("projectId", "automationId")
  WHERE "automationId" IS NOT NULL AND "isDeleted" = false;

-- Exactly one default status per org. Two defaults would make "which status does
-- a new test start in?" ambiguous.
--   Find offenders:
--     SELECT "orgId", count(*) FROM app_quiktrack."QtTestStatus"
--     WHERE "isDefault" = true GROUP BY 1 HAVING count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS "QtTestStatus_orgId_default_uniq"
  ON app_quiktrack."QtTestStatus" ("orgId")
  WHERE "isDefault" = true;

-- One automated/mixed run per (project, build) — this is what makes CI
-- find-or-create idempotent, so re-running build 1.4.0 attaches to the existing
-- run instead of duplicating it. Manual runs may freely share a build label.
CREATE UNIQUE INDEX IF NOT EXISTS "QtTestRun_projectId_build_uniq"
  ON app_quiktrack."QtTestRun" ("projectId", "build")
  WHERE "build" IS NOT NULL AND "isDeleted" = false AND source <> 'manual';

-- Postgres treats NULLs as distinct, so the plain (run, case, config) unique
-- index does NOT stop the same case being materialised twice with no config.
CREATE UNIQUE INDEX IF NOT EXISTS "QtTest_runId_caseId_noconfig_uniq"
  ON app_quiktrack."QtTest" ("runId", "caseId")
  WHERE "configId" IS NULL;

-- Exactly one default TEMPLATE per org, and only among org-wide ones
-- (projectId IS NULL). Note this one also excludes soft-deleted rows, unlike the
-- status index above — the two are deliberately different.
CREATE UNIQUE INDEX IF NOT EXISTS "QtTestTemplate_orgId_default_uniq"
  ON app_quiktrack."QtTestTemplate" ("orgId")
  WHERE "isDefault" = true AND "projectId" IS NULL AND "isDeleted" = false;


-- =============================================================================
-- STEP 4 — CHECK CONSTRAINTS
-- =============================================================================
-- Each is guarded by a pg_constraint lookup because ADD CONSTRAINT has no
-- IF NOT EXISTS.

-- A case cannot depend on itself.
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

-- A run's planned window must not end before it starts. Both nullable, so this
-- only bites when both are set.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'QtTestRun_date_order_check'
  ) THEN
    ALTER TABLE app_quiktrack."QtTestRun"
      ADD CONSTRAINT "QtTestRun_date_order_check"
      CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "endDate" >= "startDate");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'QtTestCase_automationCandidate_check'
  ) THEN
    ALTER TABLE app_quiktrack."QtTestCase"
      ADD CONSTRAINT "QtTestCase_automationCandidate_check"
      CHECK ("automationCandidate" IS NULL
             OR "automationCandidate" IN ('YES', 'NO', 'NONE'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'QtTestTemplate_kind_check'
  ) THEN
    ALTER TABLE app_quiktrack."QtTestTemplate"
      ADD CONSTRAINT "QtTestTemplate_kind_check"
      CHECK (kind IN ('TEXT', 'STEPS', 'BDD', 'EXPLORATORY'));
  END IF;
END $$;


-- =============================================================================
-- STEP 5 — sanity-check the ref counter table exists and works
-- =============================================================================
-- The function INSERTs into QtTestRefCounter, so if `db push` created that table
-- from schema.prisma we are fine. This proves the whole path end to end WITHOUT
-- leaving a row behind: it allocates two numbers for a throwaway key, checks they
-- increment, then deletes the counter row.
--
-- NOTE: `QtTestRefCounter.orgId` carries a FOREIGN KEY to quikit."Org", so the probe
-- must borrow a REAL org id — a made-up one fails with a 23503 FK violation. The
-- `projectId` is deliberately fake, which is what keeps the probe isolated from any
-- real project's numbering: the counter is keyed on (projectId, kind).
--
-- Skips itself cleanly if the database has no orgs yet.

DO $$
DECLARE
  v_org text;
  a integer;
  b integer;
BEGIN
  SELECT id INTO v_org FROM quikit."Org" LIMIT 1;

  IF v_org IS NULL THEN
    RAISE NOTICE 'No org in this database — skipping the qt_test_next_ref probe.';
    RETURN;
  END IF;

  a := app_quiktrack.qt_test_next_ref(v_org, '__qt_probe_project', 'case');
  b := app_quiktrack.qt_test_next_ref(v_org, '__qt_probe_project', 'case');

  IF b <> a + 1 THEN
    RAISE EXCEPTION 'qt_test_next_ref did not increment: got % then %', a, b;
  END IF;

  DELETE FROM app_quiktrack."QtTestRefCounter"
  WHERE "projectId" = '__qt_probe_project';

  RAISE NOTICE 'qt_test_next_ref works (allocated % then %, probe row removed)', a, b;
END $$;


-- =============================================================================
-- STEP 6 — VERIFY (re-run STEP 0; everything should now read 'present')
-- =============================================================================
-- Also confirms the triggers are actually attached to the right tables and fire
-- on both UPDATE and DELETE — a trigger that exists but only covers UPDATE would
-- still let history be deleted.

SELECT c.relname   AS table_name,
       t.tgname    AS trigger_name,
       CASE WHEN (t.tgtype::integer & 16) > 0 THEN 'yes' ELSE 'NO' END AS on_update,
       CASE WHEN (t.tgtype::integer & 8)  > 0 THEN 'yes' ELSE 'NO' END AS on_delete
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'app_quiktrack'
  AND NOT t.tgisinternal
  AND t.tgname IN ('qt_test_result_no_mutate', 'qt_test_step_result_no_mutate')
ORDER BY 1;
