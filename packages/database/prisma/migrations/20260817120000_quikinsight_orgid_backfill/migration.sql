-- QuikInsight: reconcile schema drift on the app_quikinsight tables.
--
-- WHY THIS EXISTS
-- The live database carries columns that no migration ever created — orgId on
-- five tables, invitedBy on QiInvitation, and four columns on
-- QiDashboardSnapshot. They were added out-of-band (a `db push` or a manual
-- ALTER), so `prisma migrate` never learned about them.
--
-- The Prisma models now declare those columns (they have to: orgId is NOT NULL,
-- so every create through Prisma was failing with P2011 "Null constraint
-- violation on the fields: (orgId)"). Without this migration a FRESH
-- environment built from migrations alone would lack the columns entirely and
-- break the other way round.
--
-- IDEMPOTENT: every statement is IF NOT EXISTS, so applying it to a database
-- that already has the columns is a no-op. Safe to run anywhere.
--
-- NULLABLE FIRST, THEN NOT NULL. Adding a NOT NULL column without a default to
-- a table with existing rows fails outright. Each column is added nullable,
-- backfilled where a source for the value exists, and only then tightened —
-- and the tightening is skipped when any row is still NULL, so this migration
-- can never fail on data it cannot infer. Re-run it after backfilling by hand.

-- ── orgId ───────────────────────────────────────────────────────────────────
ALTER TABLE app_quikinsight."QiDataSync"          ADD COLUMN IF NOT EXISTS "orgId" TEXT;
ALTER TABLE app_quikinsight."QiConnectedAccount"  ADD COLUMN IF NOT EXISTS "orgId" TEXT;
ALTER TABLE app_quikinsight."QiDashboard"         ADD COLUMN IF NOT EXISTS "orgId" TEXT;
ALTER TABLE app_quikinsight."QiUserRole"          ADD COLUMN IF NOT EXISTS "orgId" TEXT;
ALTER TABLE app_quikinsight."QiEmailReportSettings" ADD COLUMN IF NOT EXISTS "orgId" TEXT;

-- ── QiEmailReportSettings: timestamps the model now declares ────────────────
ALTER TABLE app_quikinsight."QiEmailReportSettings"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE app_quikinsight."QiEmailReportSettings"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ── QiInvitation.invitedBy ─────────────────────────────────────────────────
ALTER TABLE app_quikinsight."QiInvitation" ADD COLUMN IF NOT EXISTS "invitedBy" TEXT;

-- ── QiDashboardSnapshot: userId / orgId / weekNumber / year ────────────────
ALTER TABLE app_quikinsight."QiDashboardSnapshot" ADD COLUMN IF NOT EXISTS "userId"     TEXT;
ALTER TABLE app_quikinsight."QiDashboardSnapshot" ADD COLUMN IF NOT EXISTS "orgId"      TEXT;
ALTER TABLE app_quikinsight."QiDashboardSnapshot" ADD COLUMN IF NOT EXISTS "weekNumber" INTEGER;
ALTER TABLE app_quikinsight."QiDashboardSnapshot" ADD COLUMN IF NOT EXISTS "year"       INTEGER;

-- ── Backfill what can be derived ───────────────────────────────────────────
-- A snapshot's week/year are recoverable from snapshotAt; the rest have no
-- in-table source and are left to the operator.
UPDATE app_quikinsight."QiDashboardSnapshot"
   SET "weekNumber" = EXTRACT(WEEK FROM "snapshotAt")::int
 WHERE "weekNumber" IS NULL;
UPDATE app_quikinsight."QiDashboardSnapshot"
   SET "year" = EXTRACT(YEAR FROM "snapshotAt")::int
 WHERE "year" IS NULL;

-- ── Tighten to NOT NULL, but only where no NULLs remain ────────────────────
DO $$
DECLARE
  t   TEXT;
  c   TEXT;
  pair TEXT[];
  n   BIGINT;
BEGIN
  FOREACH pair SLICE 1 IN ARRAY ARRAY[
    ARRAY['QiDataSync','orgId'],
    ARRAY['QiConnectedAccount','orgId'],
    ARRAY['QiDashboard','orgId'],
    ARRAY['QiUserRole','orgId'],
    ARRAY['QiEmailReportSettings','orgId'],
    ARRAY['QiInvitation','invitedBy'],
    ARRAY['QiDashboardSnapshot','userId'],
    ARRAY['QiDashboardSnapshot','orgId'],
    ARRAY['QiDashboardSnapshot','weekNumber'],
    ARRAY['QiDashboardSnapshot','year']
  ] LOOP
    t := pair[1];
    c := pair[2];
    EXECUTE format('SELECT count(*) FROM app_quikinsight.%I WHERE %I IS NULL', t, c) INTO n;
    IF n = 0 THEN
      EXECUTE format('ALTER TABLE app_quikinsight.%I ALTER COLUMN %I SET NOT NULL', t, c);
    ELSE
      RAISE NOTICE 'skipping NOT NULL on %.% — % row(s) still NULL, backfill then re-run', t, c, n;
    END IF;
  END LOOP;
END $$;

-- ── Indexes the models declare ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "QiDataSync_orgId_idx"            ON app_quikinsight."QiDataSync" ("orgId");
CREATE INDEX IF NOT EXISTS "QiConnectedAccount_orgId_idx"    ON app_quikinsight."QiConnectedAccount" ("orgId");
CREATE INDEX IF NOT EXISTS "QiDashboard_orgId_idx"           ON app_quikinsight."QiDashboard" ("orgId");
CREATE INDEX IF NOT EXISTS "QiUserRole_orgId_idx"            ON app_quikinsight."QiUserRole" ("orgId");
CREATE INDEX IF NOT EXISTS "QiEmailReportSettings_orgId_idx" ON app_quikinsight."QiEmailReportSettings" ("orgId");
CREATE INDEX IF NOT EXISTS "QiDashboardSnapshot_orgId_idx"   ON app_quikinsight."QiDashboardSnapshot" ("orgId");
CREATE UNIQUE INDEX IF NOT EXISTS "QiDashboardSnapshot_userId_weekNumber_year_key"
  ON app_quikinsight."QiDashboardSnapshot" ("userId", "weekNumber", "year");
