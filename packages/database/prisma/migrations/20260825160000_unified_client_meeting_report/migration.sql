-- One report table, discriminated by kind.
--
-- WHY
-- ---
-- Four tables held generated reports: ClientDailyHuddleWeeklyReport,
-- ClientWeeklyMeetingReport, ClientMonthlyReport, ClientWeekRollupReport. About
-- twenty-four of their thirty columns were byte-identical — the whole cache-key
-- block, the sign-off pair, the audit columns and the same four indexes — and
-- the copies had already drifted: `factSet` existed on two of the four,
-- `completeness` and `processingLimitations` on one. That is what four copies
-- of one contract reliably produce.
--
-- The pattern is not new here. `MeetingReportVersion` keys on
-- (reportKind, reportId, version) and `MeetingReportJob` on
-- (orgId, reportKind, scopeKey) for exactly the same reason. The report rows
-- were the odd ones out.
--
-- SAFETY
-- ------
-- Three of the four tables were created within the last two days and were never
-- applied to any environment, so this drops them outright — there is nothing to
-- lose. ClientDailyHuddleWeeklyReport predates that work and holds LIVE data, so
-- its rows are copied across and **the table is left in place** as a rollback
-- target. A separate later migration drops it once the cutover is confirmed.
--
-- The backfill preserves `currentVersion` and `validatedAt`/`validatedBy`
-- exactly. A facilitator's sign-off lost in a migration would be the worst
-- outcome here, and it is the thing to check first after applying.
--
-- `MeetingReportVersion` is untouched: it references reports by
-- (reportKind, reportId), and the ids are carried over unchanged, so every
-- report's version history still resolves.

CREATE TABLE "app_quikscale"."ClientMeetingReport" (
  "id"                    TEXT NOT NULL,
  "orgId"                 TEXT NOT NULL,
  "clientId"              TEXT NOT NULL,

  -- DH_WEEKLY | WM | WEEK_ROLLUP | MONTHLY
  "reportKind"            TEXT NOT NULL,
  -- Identity within the kind: ISO period start, or the meeting id for WM.
  "scopeKey"              TEXT NOT NULL,

  -- One name for what were weekStart, periodStart and meetingDate.
  "periodStart"           TIMESTAMP(3) NOT NULL,
  "periodEnd"             TIMESTAMP(3) NOT NULL,

  -- The occurrence the report is ABOUT. WM only; null elsewhere.
  "weeklyMeetingId"       TEXT,

  "report"                JSONB NOT NULL,
  "metrics"               JSONB NOT NULL,
  "validation"            JSONB,
  "factSet"               JSONB,
  "reportConfidence"      DOUBLE PRECISION,

  "coveragePct"           DOUBLE PRECISION,
  "completeness"          TEXT NOT NULL DEFAULT 'COMPLETE',
  "processingLimitations" JSONB,
  "extractionVersion"     INTEGER,

  "sourceFingerprint"     TEXT,
  "promptVersion"         TEXT,
  "schemaVersion"         INTEGER NOT NULL DEFAULT 1,
  "modelId"               TEXT,
  "tokensInput"           INTEGER,
  "tokensOutput"          INTEGER,
  "costUsd"               DECIMAL(10,6),
  "currentVersion"        INTEGER NOT NULL DEFAULT 1,

  "sourceReportIds"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sourceHuddleIds"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sourceTranscriptIds"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "missingSources"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  "validatedAt"           TIMESTAMP(3),
  "validatedBy"           TEXT,
  "generatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "generatedBy"           TEXT NOT NULL,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  "updatedBy"             TEXT,
  "deletedAt"             TIMESTAMP(3),
  "isDemoData"            BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT "ClientMeetingReport_pkey" PRIMARY KEY ("id")
);

-- One report per kind per scope. A DH weekly and a week rollup for the SAME
-- week coexist: they share a periodStart and differ only by kind, which is
-- exactly the case this composite key exists for.
CREATE UNIQUE INDEX "ClientMeetingReport_orgId_reportKind_scopeKey_key"
  ON "app_quikscale"."ClientMeetingReport" ("orgId", "reportKind", "scopeKey");

CREATE INDEX "ClientMeetingReport_orgId_idx"
  ON "app_quikscale"."ClientMeetingReport" ("orgId");

-- The listing query: one client's reports of one kind over a period.
CREATE INDEX "ClientMeetingReport_orgId_clientId_reportKind_periodStart_idx"
  ON "app_quikscale"."ClientMeetingReport" ("orgId", "clientId", "reportKind", "periodStart");

-- "Everything that happened for this client in this period", across kinds —
-- the query that needed four round trips before.
CREATE INDEX "ClientMeetingReport_orgId_clientId_periodStart_idx"
  ON "app_quikscale"."ClientMeetingReport" ("orgId", "clientId", "periodStart");

CREATE INDEX "ClientMeetingReport_orgId_deletedAt_idx"
  ON "app_quikscale"."ClientMeetingReport" ("orgId", "deletedAt");

CREATE INDEX "ClientMeetingReport_clientId_idx"
  ON "app_quikscale"."ClientMeetingReport" ("clientId");

CREATE INDEX "ClientMeetingReport_weeklyMeetingId_idx"
  ON "app_quikscale"."ClientMeetingReport" ("weeklyMeetingId");

ALTER TABLE "app_quikscale"."ClientMeetingReport"
  ADD CONSTRAINT "ClientMeetingReport_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "public"."Org" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikscale"."ClientMeetingReport"
  ADD CONSTRAINT "ClientMeetingReport_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "app_quikscale"."Client" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Nullable FK, so deleting a weekly meeting still deletes its report — the one
-- guarantee that could have been lost by merging the tables, and was not.
ALTER TABLE "app_quikscale"."ClientMeetingReport"
  ADD CONSTRAINT "ClientMeetingReport_weeklyMeetingId_fkey"
  FOREIGN KEY ("weeklyMeetingId") REFERENCES "app_quikscale"."ClientWeeklyMeeting" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Backfill ───────────────────────────────────────────────────────────────
--
-- Ids are carried across unchanged so MeetingReportVersion still resolves, and
-- so a rollback is a matter of pointing the code back at the old table.
--
-- The three INSERTs below the first one are no-ops in every environment where
-- those tables were never created; they are written defensively because a dev
-- database may have applied them.

INSERT INTO "app_quikscale"."ClientMeetingReport" (
  "id", "orgId", "clientId", "reportKind", "scopeKey",
  "periodStart", "periodEnd",
  "report", "metrics", "validation", "factSet", "reportConfidence",
  "coveragePct",
  "sourceFingerprint", "promptVersion", "schemaVersion", "modelId",
  "tokensInput", "tokensOutput", "costUsd", "currentVersion",
  "sourceHuddleIds", "sourceTranscriptIds",
  "validatedAt", "validatedBy",
  "generatedAt", "generatedBy", "updatedAt", "updatedBy", "deletedAt", "isDemoData"
)
SELECT
  "id", "orgId", "clientId", 'DH_WEEKLY', to_char("weekStart", 'YYYY-MM-DD'),
  "weekStart", "weekEnd",
  "report", "metrics", "validation", "factSet", "reportConfidence",
  "coveragePct",
  "sourceFingerprint", "promptVersion", "schemaVersion", "modelId",
  "tokensInput", "tokensOutput", "costUsd", "currentVersion",
  "sourceHuddleIds", "sourceTranscriptIds",
  "validatedAt", "validatedBy",
  "generatedAt", "generatedBy", "updatedAt", "updatedBy", "deletedAt", "isDemoData"
FROM "app_quikscale"."ClientDailyHuddleWeeklyReport"
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'app_quikscale' AND table_name = 'ClientWeeklyMeetingReport'
  ) THEN
    INSERT INTO "app_quikscale"."ClientMeetingReport" (
      "id", "orgId", "clientId", "reportKind", "scopeKey",
      "periodStart", "periodEnd", "weeklyMeetingId",
      "report", "metrics", "validation", "factSet", "reportConfidence",
      "coveragePct", "completeness", "processingLimitations", "extractionVersion",
      "sourceFingerprint", "promptVersion", "schemaVersion", "modelId",
      "tokensInput", "tokensOutput", "costUsd", "currentVersion",
      "validatedAt", "validatedBy",
      "generatedAt", "generatedBy", "updatedAt", "updatedBy", "deletedAt", "isDemoData"
    )
    SELECT
      "id", "orgId", "clientId", 'WM', "weeklyMeetingId",
      "meetingDate", "meetingDate", "weeklyMeetingId",
      "report", "metrics", "validation", "factSet", "reportConfidence",
      "coveragePct", "completeness", "processingLimitations", "extractionVersion",
      "sourceFingerprint", "promptVersion", "schemaVersion", "modelId",
      "tokensInput", "tokensOutput", "costUsd", "currentVersion",
      "validatedAt", "validatedBy",
      "generatedAt", "generatedBy", "updatedAt", "updatedBy", "deletedAt", "isDemoData"
    FROM "app_quikscale"."ClientWeeklyMeetingReport"
    ON CONFLICT DO NOTHING;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'app_quikscale' AND table_name = 'ClientMonthlyReport'
  ) THEN
    INSERT INTO "app_quikscale"."ClientMeetingReport" (
      "id", "orgId", "clientId", "reportKind", "scopeKey",
      "periodStart", "periodEnd",
      "report", "metrics", "validation", "reportConfidence",
      "sourceFingerprint", "promptVersion", "schemaVersion", "modelId",
      "tokensInput", "tokensOutput", "costUsd", "currentVersion",
      "sourceReportIds", "missingSources",
      "validatedAt", "validatedBy",
      "generatedAt", "generatedBy", "updatedAt", "updatedBy", "deletedAt", "isDemoData"
    )
    SELECT
      "id", "orgId", "clientId", 'MONTHLY', to_char("periodStart", 'YYYY-MM-DD'),
      "periodStart", "periodEnd",
      "report", "metrics", "validation", "reportConfidence",
      "sourceFingerprint", "promptVersion", "schemaVersion", "modelId",
      "tokensInput", "tokensOutput", "costUsd", "currentVersion",
      "sourceWeeklyReportIds" || "sourceWmReportIds", "missingWeeks",
      "validatedAt", "validatedBy",
      "generatedAt", "generatedBy", "updatedAt", "updatedBy", "deletedAt", "isDemoData"
    FROM "app_quikscale"."ClientMonthlyReport"
    ON CONFLICT DO NOTHING;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'app_quikscale' AND table_name = 'ClientWeekRollupReport'
  ) THEN
    INSERT INTO "app_quikscale"."ClientMeetingReport" (
      "id", "orgId", "clientId", "reportKind", "scopeKey",
      "periodStart", "periodEnd",
      "report", "metrics", "validation", "reportConfidence",
      "sourceFingerprint", "promptVersion", "schemaVersion", "modelId",
      "tokensInput", "tokensOutput", "costUsd", "currentVersion",
      "sourceReportIds", "missingSources",
      "validatedAt", "validatedBy",
      "generatedAt", "generatedBy", "updatedAt", "updatedBy", "deletedAt", "isDemoData"
    )
    SELECT
      "id", "orgId", "clientId", 'WEEK_ROLLUP', to_char("weekStart", 'YYYY-MM-DD'),
      "weekStart", "weekEnd",
      "report", "metrics", "validation", "reportConfidence",
      "sourceFingerprint", "promptVersion", "schemaVersion", "modelId",
      "tokensInput", "tokensOutput", "costUsd", "currentVersion",
      CASE
        WHEN "sourceWeeklyReportId" IS NULL THEN "sourceWmReportIds"
        ELSE ARRAY["sourceWeeklyReportId"] || "sourceWmReportIds"
      END,
      "missingSources",
      "validatedAt", "validatedBy",
      "generatedAt", "generatedBy", "updatedAt", "updatedBy", "deletedAt", "isDemoData"
    FROM "app_quikscale"."ClientWeekRollupReport"
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ── Drop the three that never held production data ─────────────────────────
DROP TABLE IF EXISTS "app_quikscale"."ClientWeeklyMeetingReport";
DROP TABLE IF EXISTS "app_quikscale"."ClientMonthlyReport";
DROP TABLE IF EXISTS "app_quikscale"."ClientWeekRollupReport";

-- ClientDailyHuddleWeeklyReport is deliberately NOT dropped here. It is the one
-- table that held live rows, and it stays for one release as a rollback target.
