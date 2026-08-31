-- AI Meeting Rhythm — Phase 0 foundation: report versioning, generation locking
-- and LLM cost accounting.
--
-- See docs/17-ai-meeting-rhythm-architecture.md §E.2, §E.6, §L, §O.
--
-- FULLY ADDITIVE AND BACKFILL-SAFE.
--   * Every new column is nullable, or NOT NULL with a DEFAULT that reproduces
--     today's behaviour exactly (transcriptVersion = 1, schemaVersion = 1,
--     currentVersion = 1 all describe existing rows correctly).
--   * Three new tables; nothing existing is dropped, renamed or re-typed.
--   * No data migration. No backfill required.
--   * Existing readers are untouched: no column they select changes type or
--     nullability, and no index they rely on is replaced.
--
-- Rollback is a DROP of the three tables plus the added columns; no data that
-- existed before this migration is modified, so rollback is lossless.

-- ---------------------------------------------------------------------------
-- 1. ClientMeetingTranscript — extraction provenance
--
-- These columns turn extraction into a one-time, fingerprint-gated operation.
-- `sourceHash` is sha256(rawText); `transcriptVersion` increments only when
-- that hash changes, so a Fathom re-emit of byte-identical content is free.
-- Together with the *Version columns they form the extraction cache key.
-- ---------------------------------------------------------------------------
ALTER TABLE "app_quikscale"."ClientMeetingTranscript"
  ADD COLUMN "sourceHash"           TEXT,
  ADD COLUMN "transcriptVersion"    INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "estTokens"            INTEGER,
  ADD COLUMN "normalizationVersion" INTEGER,
  ADD COLUMN "normalizationStats"   JSONB,
  ADD COLUMN "extractionVersion"    INTEGER,
  ADD COLUMN "extractedAt"          TIMESTAMP(3),
  ADD COLUMN "extractionStatus"     TEXT,
  ADD COLUMN "extractionError"      TEXT;

-- ---------------------------------------------------------------------------
-- 2. ClientDailyHuddleWeeklyReport — cache key + snapshot provenance
--
-- Closes doc 15 defect B8 ("no stored model id, prompt version, token usage,
-- transcript fingerprint, or report version"). The cache key is the triple
-- (sourceFingerprint, promptVersion, schemaVersion).
--
-- Existing rows get sourceFingerprint = NULL, which the cache-decision helper
-- treats as "unknown provenance ⇒ stale". That is the correct and safe reading:
-- reports generated before this migration cannot prove what they were built
-- from, so they are offered for regeneration rather than trusted as fresh.
-- They remain fully viewable, and viewing still costs zero tokens.
-- ---------------------------------------------------------------------------
ALTER TABLE "app_quikscale"."ClientDailyHuddleWeeklyReport"
  ADD COLUMN "sourceFingerprint" TEXT,
  ADD COLUMN "promptVersion"     TEXT,
  ADD COLUMN "schemaVersion"     INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "modelId"           TEXT,
  ADD COLUMN "tokensInput"       INTEGER,
  ADD COLUMN "tokensOutput"      INTEGER,
  ADD COLUMN "costUsd"           DECIMAL(10,6),
  ADD COLUMN "currentVersion"    INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "coveragePct"       DOUBLE PRECISION;

-- ---------------------------------------------------------------------------
-- 3. MeetingReportVersion — immutable snapshot history
--
-- One table for every report kind; `reportKind` discriminates. `reportId` is
-- deliberately NOT a foreign key: the owning table varies by kind, and a
-- snapshot must survive a hard-deleted report so "why did it say this?" stays
-- answerable.
-- ---------------------------------------------------------------------------
CREATE TABLE "app_quikscale"."MeetingReportVersion" (
  "id"                TEXT NOT NULL,
  "orgId"             TEXT NOT NULL,
  "clientId"          TEXT,
  "reportKind"        TEXT NOT NULL,
  "reportId"          TEXT NOT NULL,
  "version"           INTEGER NOT NULL,
  "report"            JSONB NOT NULL,
  "metrics"           JSONB NOT NULL,
  "validation"        JSONB,
  "sourceFingerprint" TEXT,
  "promptVersion"     TEXT,
  "schemaVersion"     INTEGER NOT NULL DEFAULT 1,
  "modelId"           TEXT,
  "extractionVersion" INTEGER,
  "tokensInput"       INTEGER,
  "tokensOutput"      INTEGER,
  "costUsd"           DECIMAL(10,6),
  "coveragePct"       DOUBLE PRECISION,
  "generatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "generatedBy"       TEXT NOT NULL,

  CONSTRAINT "MeetingReportVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MeetingReportVersion_reportKind_reportId_version_key"
  ON "app_quikscale"."MeetingReportVersion" ("reportKind", "reportId", "version");
CREATE INDEX "MeetingReportVersion_orgId_idx"
  ON "app_quikscale"."MeetingReportVersion" ("orgId");
CREATE INDEX "MeetingReportVersion_orgId_reportKind_reportId_idx"
  ON "app_quikscale"."MeetingReportVersion" ("orgId", "reportKind", "reportId");
CREATE INDEX "MeetingReportVersion_orgId_clientId_reportKind_generatedAt_idx"
  ON "app_quikscale"."MeetingReportVersion" ("orgId", "clientId", "reportKind", "generatedAt");

ALTER TABLE "app_quikscale"."MeetingReportVersion"
  ADD CONSTRAINT "MeetingReportVersion_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. MeetingReportJob — generation lock, progress, idempotency
--
-- The UNIQUE (orgId, reportKind, scopeKey) index IS the lock. Two users
-- pressing Generate simultaneously race to insert; exactly one wins and the
-- loser polls the winner's job. Without it, each press is a separate LLM bill
-- plus a lost-update race on the report upsert.
--
-- The (status, lockedUntil) index serves the reclaim sweep for jobs orphaned
-- by a crashed serverless invocation or worker.
-- ---------------------------------------------------------------------------
CREATE TABLE "app_quikscale"."MeetingReportJob" (
  "id"          TEXT NOT NULL,
  "orgId"       TEXT NOT NULL,
  "clientId"    TEXT,
  "reportKind"  TEXT NOT NULL,
  "scopeKey"    TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'NOT_STARTED',
  "progress"    JSONB,
  "attempt"     INTEGER NOT NULL DEFAULT 1,
  "lockedUntil" TIMESTAMP(3),
  "startedAt"   TIMESTAMP(3),
  "finishedAt"  TIMESTAMP(3),
  "error"       TEXT,
  "reportId"    TEXT,
  "requestedBy" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MeetingReportJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MeetingReportJob_orgId_reportKind_scopeKey_key"
  ON "app_quikscale"."MeetingReportJob" ("orgId", "reportKind", "scopeKey");
CREATE INDEX "MeetingReportJob_orgId_idx"
  ON "app_quikscale"."MeetingReportJob" ("orgId");
CREATE INDEX "MeetingReportJob_orgId_status_idx"
  ON "app_quikscale"."MeetingReportJob" ("orgId", "status");
CREATE INDEX "MeetingReportJob_status_lockedUntil_idx"
  ON "app_quikscale"."MeetingReportJob" ("status", "lockedUntil");

ALTER TABLE "app_quikscale"."MeetingReportJob"
  ADD CONSTRAINT "MeetingReportJob_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 5. AiUsageLog — one row per LLM call, including failures
--
-- Makes "Report Cache Hit Rate", "tokens per meeting" and "cost per client per
-- month" answerable as SQL. Failures are logged because a call that burned
-- input tokens and then timed out still cost money.
--
-- Append-only and write-heavy: five narrow indexes, no unique constraint. The
-- (runId) index exists so a long Weekly Meeting extraction's cost decomposes
-- per chunk.
-- ---------------------------------------------------------------------------
CREATE TABLE "app_quikscale"."AiUsageLog" (
  "id"            TEXT NOT NULL,
  "orgId"         TEXT NOT NULL,
  "clientId"      TEXT,
  "feature"       TEXT NOT NULL,
  "model"         TEXT NOT NULL,
  "promptVersion" TEXT,
  "transcriptId"  TEXT,
  "runId"         TEXT,
  "chunkIdx"      INTEGER,
  "reportKind"    TEXT,
  "reportId"      TEXT,
  "inputTokens"   INTEGER NOT NULL DEFAULT 0,
  "outputTokens"  INTEGER NOT NULL DEFAULT 0,
  "cachedTokens"  INTEGER,
  "costUsd"       DECIMAL(10,6) NOT NULL DEFAULT 0,
  "latencyMs"     INTEGER,
  "queueWaitMs"   INTEGER,
  "status"        TEXT NOT NULL DEFAULT 'OK',
  "attempt"       INTEGER NOT NULL DEFAULT 1,
  "errorCode"     TEXT,
  "traceId"       TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiUsageLog_orgId_createdAt_idx"
  ON "app_quikscale"."AiUsageLog" ("orgId", "createdAt");
CREATE INDEX "AiUsageLog_orgId_feature_createdAt_idx"
  ON "app_quikscale"."AiUsageLog" ("orgId", "feature", "createdAt");
CREATE INDEX "AiUsageLog_orgId_clientId_createdAt_idx"
  ON "app_quikscale"."AiUsageLog" ("orgId", "clientId", "createdAt");
CREATE INDEX "AiUsageLog_runId_idx"
  ON "app_quikscale"."AiUsageLog" ("runId");
CREATE INDEX "AiUsageLog_reportKind_reportId_idx"
  ON "app_quikscale"."AiUsageLog" ("reportKind", "reportId");

ALTER TABLE "app_quikscale"."AiUsageLog"
  ADD CONSTRAINT "AiUsageLog_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
