-- QuikTest: TestRail parity — template-driven case layouts + spec fields.
-- Tickets QUIKTR-320, 333, 337 (and the schema half of 335/336).
-- See apps/quiktrack/QUIKTEST_TESTRAIL_PARITY_PLAN.md.
--
-- Purely additive: new nullable columns and one new table. No existing column
-- is altered or dropped, so it is safe to apply to the shared Neon DB by hand
-- (the build pipeline does not run `migrate deploy`). Idempotent throughout.
--
-- THE CENTRAL IDEA — flexible enough for BOTH TestRail templates:
--   "Test Case (Text)"  authors ONE case-level Expected Result
--   "Test Case (Steps)" authors PER-STEP expected values
-- Both storage shapes now coexist on every case:
--   QtTestCase.expectedResult   (text layout)
--   QtTestCaseStep.expected     (steps layout, already present)
-- The case's template `kind` decides which the editor SHOWS; neither is ever
-- destroyed by switching template. That matters because a case authored as
-- steps and later switched to text (or back) would otherwise silently lose its
-- content — and a test case losing its expectations is a silent quality hole.

-- ── Template gains a layout discriminator ───────────────────────────────────
ALTER TABLE app_quiktrack."QtTestTemplate"
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'STEPS';
ALTER TABLE app_quiktrack."QtTestTemplate"
  ADD COLUMN IF NOT EXISTS "isDefault" boolean NOT NULL DEFAULT false;

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

-- Exactly one default template per org, and only where projectId IS NULL
-- (org-wide templates). Partial unique — Prisma cannot express it.
CREATE UNIQUE INDEX IF NOT EXISTS "QtTestTemplate_orgId_default_uniq"
  ON app_quiktrack."QtTestTemplate" ("orgId")
  WHERE "isDefault" = true AND "projectId" IS NULL AND "isDeleted" = false;

-- ── Case: the spec's authoring fields ───────────────────────────────────────
-- NOTE: `references` is a Postgres RESERVED WORD (it introduces a foreign-key
-- clause), so the spec's "References" field is stored as `refTickets`. Quoting
-- would work, but would leave every future hand-written query one missing quote
-- away from a syntax error.
ALTER TABLE app_quiktrack."QtTestCase"
  ADD COLUMN IF NOT EXISTS "expectedResult" text,
  ADD COLUMN IF NOT EXISTS "automationTool" text,
  ADD COLUMN IF NOT EXISTS "automationCandidate" text,
  ADD COLUMN IF NOT EXISTS "refTickets" text;

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

-- ── Run: planned window + references (QUIKTR-320) ───────────────────────────
ALTER TABLE app_quiktrack."QtTestRun"
  ADD COLUMN IF NOT EXISTS "startDate" timestamp(3),
  ADD COLUMN IF NOT EXISTS "endDate" timestamp(3),
  -- `references` is a Postgres RESERVED WORD (it introduces an FK clause), so
  -- the column is named `refTickets`. Quoting would work but leaves every future
  -- hand-written query one missing quote away from a syntax error.
  ADD COLUMN IF NOT EXISTS "refTickets" text;

-- endDate must not precede startDate. Both nullable, so the check only bites
-- when both are set.
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

-- ── Case attachments (the spec's "Add File" on the authoring form) ──────────
-- Separate from QtTestResultAttachment on purpose: a CASE attachment describes
-- how to test (reference screenshot, sample data); a RESULT attachment is
-- evidence of one execution. Conflating them would make a case's reference
-- material look like proof of a test run.
CREATE TABLE IF NOT EXISTS app_quiktrack."QtTestCaseAttachment" (
  id           text PRIMARY KEY,
  "orgId"      text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "caseId"     text NOT NULL REFERENCES app_quiktrack."QtTestCase"(id) ON DELETE CASCADE,
  "fileName"   text NOT NULL,
  "mimeType"   text NOT NULL,
  "sizeBytes"  integer NOT NULL,
  "s3Key"      text NOT NULL,
  "uploadedBy" text,
  "createdAt"  timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "QtTestCaseAttachment_orgId_idx"
  ON app_quiktrack."QtTestCaseAttachment" ("orgId");
CREATE INDEX IF NOT EXISTS "QtTestCaseAttachment_caseId_idx"
  ON app_quiktrack."QtTestCaseAttachment" ("caseId");

-- ── Seed the four templates for every existing org ──────────────────────────
-- "Test Case (Steps)" is the default because that is what every case authored
-- so far uses — making TEXT the default would change how existing cases render.
INSERT INTO app_quiktrack."QtTestTemplate"
  (id, "orgId", "projectId", name, kind, "isDefault", "createdAt", "updatedAt")
SELECT
  'qtt_' || o.id || '_' || t.kind,
  o.id, NULL, t.name, t.kind, t.is_default, now(), now()
FROM quikit."Org" o
CROSS JOIN (VALUES
  ('Test Case (Steps)',   'STEPS',       true),
  ('Test Case (Text)',    'TEXT',        false),
  ('BDD / Gherkin',       'BDD',         false),
  ('Exploratory Session', 'EXPLORATORY', false)
) AS t(name, kind, is_default)
ON CONFLICT (id) DO NOTHING;

-- Existing cases keep the steps layout they were authored with.
UPDATE app_quiktrack."QtTestCase" c
SET "templateId" = t.id
FROM app_quiktrack."QtTestTemplate" t
WHERE c."templateId" IS NULL
  AND t."orgId" = c."orgId"
  AND t.kind = 'STEPS'
  AND t."projectId" IS NULL;
