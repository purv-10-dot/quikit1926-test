-- AI Meeting Rhythm — Phase 9: the Monthly Report.
--
-- See docs/17-ai-meeting-rhythm-architecture.md sections D.5, E.6, G lever 12.
--
-- FULLY ADDITIVE AND BACKFILL-SAFE.
--   * One new table. Nothing existing is touched.
--   * No data migration; monthly reports are generated on demand.
--   * Rollback is a DROP of the table.
--
-- WHY THIS TABLE IS CHEAP TO POPULATE
-- -----------------------------------
-- A month is roughly 20 daily huddles and 4 weekly meetings — about 1.4M tokens
-- of transcript. This report is built from four ClientDailyHuddleWeeklyReport
-- rows (their flat `metrics` snapshots), the WWW lifecycle, and SQL aggregates
-- over the fact layer: ~5k tokens in total.
--
-- That ~99.6% saving exists only because the weekly reports stored their
-- numbers flat in the first place, which the requirement doc asked for
-- explicitly: "Weekly results must be stored in a structured format to enable
-- trend and comparative analysis in the Monthly Report."
--
-- sourceWeeklyReportIds / sourceWmReportIds are what the cache fingerprint
-- hashes. A monthly report is fresh exactly when the reports beneath it have
-- not been regenerated — it never needs to know what a transcript said.

CREATE TABLE "app_quikscale"."ClientMonthlyReport" (
  "id"                    TEXT NOT NULL,
  "orgId"                 TEXT NOT NULL,
  "clientId"              TEXT NOT NULL,
  "periodStart"           TIMESTAMP(3) NOT NULL,
  "periodEnd"             TIMESTAMP(3) NOT NULL,
  "report"                JSONB NOT NULL,
  "metrics"               JSONB NOT NULL,
  "validation"            JSONB,
  "reportConfidence"      DOUBLE PRECISION,
  "sourceWeeklyReportIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "sourceWmReportIds"     TEXT[] DEFAULT ARRAY[]::TEXT[],
  -- Weeks with no report. Recorded so the rendered report can qualify its
  -- conclusions rather than implying a complete picture of the month.
  "missingWeeks"          TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Cache key + snapshot provenance.
  "sourceFingerprint"     TEXT,
  "promptVersion"         TEXT,
  "schemaVersion"         INTEGER NOT NULL DEFAULT 1,
  "modelId"               TEXT,
  "tokensInput"           INTEGER,
  "tokensOutput"          INTEGER,
  "costUsd"               DECIMAL(10,6),
  "currentVersion"        INTEGER NOT NULL DEFAULT 1,

  "validatedAt"           TIMESTAMP(3),
  "validatedBy"           TEXT,
  "generatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "generatedBy"           TEXT NOT NULL,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  "updatedBy"             TEXT,
  "deletedAt"             TIMESTAMP(3),
  "isDemoData"            BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT "ClientMonthlyReport_pkey" PRIMARY KEY ("id")
);

-- Regenerating a month replaces its row rather than accumulating duplicates;
-- history lives in MeetingReportVersion.
CREATE UNIQUE INDEX "ClientMonthlyReport_orgId_clientId_periodStart_key"
  ON "app_quikscale"."ClientMonthlyReport" ("orgId", "clientId", "periodStart");
CREATE INDEX "ClientMonthlyReport_orgId_idx"
  ON "app_quikscale"."ClientMonthlyReport" ("orgId");
CREATE INDEX "ClientMonthlyReport_orgId_clientId_periodStart_idx"
  ON "app_quikscale"."ClientMonthlyReport" ("orgId", "clientId", "periodStart");
CREATE INDEX "ClientMonthlyReport_orgId_deletedAt_idx"
  ON "app_quikscale"."ClientMonthlyReport" ("orgId", "deletedAt");
CREATE INDEX "ClientMonthlyReport_clientId_idx"
  ON "app_quikscale"."ClientMonthlyReport" ("clientId");

ALTER TABLE "app_quikscale"."ClientMonthlyReport"
  ADD CONSTRAINT "ClientMonthlyReport_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_quikscale"."ClientMonthlyReport"
  ADD CONSTRAINT "ClientMonthlyReport_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "app_quikscale"."Client"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
