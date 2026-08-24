-- The Weekly Meeting Report (doc 17 §P6).
--
-- Mirrors ClientDailyHuddleWeeklyReport and ClientMonthlyReport: the structured
-- report is the source of truth, DOCX and PDF are rendered from it on demand,
-- and every read is a plain SELECT that costs nothing.
--
-- Two columns exist only to keep an incomplete report honest. `coveragePct` and
-- `processingLimitations` carry the extraction's coverage verdict and the exact
-- time windows nobody read, so a PARTIAL report names its own gaps instead of
-- reading like a complete one. `validatedAt` stays NULL for those: sign-off is
-- a claim about the whole meeting, and a report that only saw 92% of it cannot
-- support that claim.
--
-- Additive only. Safe to apply while the app is running.

CREATE TABLE "app_quikscale"."ClientWeeklyMeetingReport" (
  "id"                    TEXT NOT NULL,
  "orgId"                 TEXT NOT NULL,
  "clientId"              TEXT NOT NULL,
  "weeklyMeetingId"       TEXT NOT NULL,
  "meetingDate"           TIMESTAMP(3) NOT NULL,
  "report"                JSONB NOT NULL,
  "metrics"               JSONB NOT NULL,
  "validation"            JSONB,
  "reportConfidence"      DOUBLE PRECISION,
  "coveragePct"           DOUBLE PRECISION,
  "processingLimitations" JSONB,
  "completeness"          TEXT NOT NULL DEFAULT 'COMPLETE',
  "sourceFingerprint"     TEXT,
  "promptVersion"         TEXT,
  "schemaVersion"         INTEGER NOT NULL DEFAULT 1,
  "modelId"               TEXT,
  "extractionVersion"     INTEGER,
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

  CONSTRAINT "ClientWeeklyMeetingReport_pkey" PRIMARY KEY ("id")
);

-- One report per meeting. Regenerating REPLACES the row; the previous snapshot
-- is preserved in MeetingReportVersion, so nothing is destroyed and "why did
-- the report say this?" stays answerable.
CREATE UNIQUE INDEX "ClientWeeklyMeetingReport_weeklyMeetingId_key"
  ON "app_quikscale"."ClientWeeklyMeetingReport" ("weeklyMeetingId");

CREATE UNIQUE INDEX "ClientWeeklyMeetingReport_orgId_weeklyMeetingId_key"
  ON "app_quikscale"."ClientWeeklyMeetingReport" ("orgId", "weeklyMeetingId");

CREATE INDEX "ClientWeeklyMeetingReport_orgId_idx"
  ON "app_quikscale"."ClientWeeklyMeetingReport" ("orgId");

-- The listing query: a client's meetings over a period, newest first.
CREATE INDEX "ClientWeeklyMeetingReport_orgId_clientId_meetingDate_idx"
  ON "app_quikscale"."ClientWeeklyMeetingReport" ("orgId", "clientId", "meetingDate");

CREATE INDEX "ClientWeeklyMeetingReport_orgId_deletedAt_idx"
  ON "app_quikscale"."ClientWeeklyMeetingReport" ("orgId", "deletedAt");

CREATE INDEX "ClientWeeklyMeetingReport_clientId_idx"
  ON "app_quikscale"."ClientWeeklyMeetingReport" ("clientId");

ALTER TABLE "app_quikscale"."ClientWeeklyMeetingReport"
  ADD CONSTRAINT "ClientWeeklyMeetingReport_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "public"."Org" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikscale"."ClientWeeklyMeetingReport"
  ADD CONSTRAINT "ClientWeeklyMeetingReport_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "app_quikscale"."Client" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Deleting the meeting deletes its report: a report about a meeting that no
-- longer exists is not an artefact anyone can act on.
ALTER TABLE "app_quikscale"."ClientWeeklyMeetingReport"
  ADD CONSTRAINT "ClientWeeklyMeetingReport_weeklyMeetingId_fkey"
  FOREIGN KEY ("weeklyMeetingId") REFERENCES "app_quikscale"."ClientWeeklyMeeting" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
