-- The cross-meeting Week Rollup (doc 17 §R3).
--
-- NAMING, BECAUSE THREE THINGS SOUND ALIKE
-- ----------------------------------------
--   ClientDailyHuddleWeeklyReport  — the week's DAILY HUDDLES, rolled up
--   ClientWeeklyMeetingReport      — ONE weekly meeting occurrence
--   ClientWeekRollupReport         — EVERYTHING that happened this week,
--                                    across both rhythms
--
-- The third is the artefact the external architecture review describes and
-- neither of the first two covers. It answers "what happened this week" rather
-- than "how did the daily huddles go" or "how did Tuesday's meeting go".
--
-- WHY IT IS CHEAP
-- ---------------
-- It reads the `metrics` and `factSet` columns of the reports beneath it —
-- never a transcript, never a fact table. Its cost is the number of source
-- REPORTS, not the number of facts, which is the same property that lets the
-- monthly report exist. A quarterly view over these rows would work the same
-- way for the same reason.
--
-- Additive only. Safe to apply while the app is running.

CREATE TABLE "app_quikscale"."ClientWeekRollupReport" (
  "id"                   TEXT NOT NULL,
  "orgId"                TEXT NOT NULL,
  "clientId"             TEXT NOT NULL,
  "weekStart"            TIMESTAMP(3) NOT NULL,
  "weekEnd"              TIMESTAMP(3) NOT NULL,
  "report"               JSONB NOT NULL,
  "metrics"              JSONB NOT NULL,
  "validation"           JSONB,
  "reportConfidence"     DOUBLE PRECISION,
  "sourceWeeklyReportId" TEXT,
  "sourceWmReportIds"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "missingSources"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sourceFingerprint"    TEXT,
  "promptVersion"        TEXT,
  "schemaVersion"        INTEGER NOT NULL DEFAULT 1,
  "modelId"              TEXT,
  "tokensInput"          INTEGER,
  "tokensOutput"         INTEGER,
  "costUsd"              DECIMAL(10,6),
  "currentVersion"       INTEGER NOT NULL DEFAULT 1,
  "validatedAt"          TIMESTAMP(3),
  "validatedBy"          TEXT,
  "generatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "generatedBy"          TEXT NOT NULL,
  "updatedAt"            TIMESTAMP(3) NOT NULL,
  "updatedBy"            TEXT,
  "deletedAt"            TIMESTAMP(3),
  "isDemoData"           BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT "ClientWeekRollupReport_pkey" PRIMARY KEY ("id")
);

-- One rollup per client-week. Regenerating REPLACES the row; the previous
-- snapshot is preserved in MeetingReportVersion, so nothing is destroyed.
CREATE UNIQUE INDEX "ClientWeekRollupReport_orgId_clientId_weekStart_key"
  ON "app_quikscale"."ClientWeekRollupReport" ("orgId", "clientId", "weekStart");

CREATE INDEX "ClientWeekRollupReport_orgId_idx"
  ON "app_quikscale"."ClientWeekRollupReport" ("orgId");

-- The listing query: a client's weeks over a period, newest first.
CREATE INDEX "ClientWeekRollupReport_orgId_clientId_weekStart_idx"
  ON "app_quikscale"."ClientWeekRollupReport" ("orgId", "clientId", "weekStart");

CREATE INDEX "ClientWeekRollupReport_orgId_deletedAt_idx"
  ON "app_quikscale"."ClientWeekRollupReport" ("orgId", "deletedAt");

CREATE INDEX "ClientWeekRollupReport_clientId_idx"
  ON "app_quikscale"."ClientWeekRollupReport" ("clientId");

ALTER TABLE "app_quikscale"."ClientWeekRollupReport"
  ADD CONSTRAINT "ClientWeekRollupReport_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "quikit"."Org" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikscale"."ClientWeekRollupReport"
  ADD CONSTRAINT "ClientWeekRollupReport_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "app_quikscale"."Client" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
