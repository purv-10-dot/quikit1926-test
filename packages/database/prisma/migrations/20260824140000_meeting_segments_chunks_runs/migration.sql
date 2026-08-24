-- AI Meeting Rhythm — Phase 1: transcript normalisation and chunk planning.
--
-- See docs/17-ai-meeting-rhythm-architecture.md sections D.2, D.3, E.3.
--
-- FULLY ADDITIVE AND BACKFILL-SAFE.
--   * Two nullable columns on an existing table; three new tables.
--   * Nothing existing is dropped, renamed or re-typed.
--   * No data migration. Existing transcripts simply have no segments yet;
--     they are normalised on demand the first time they are prepared.
--   * Rollback is a DROP of the three tables plus the two columns.
--
-- WHY rawSegments EXISTS
-- ----------------------
-- ClientMeetingTranscript.rawText is a FLATTENED view of the recorder output:
-- transcriptToText in apps/quikflow/lib/connectors/fathom.ts receives
-- { speaker, text, timestamp }[] and joins it into "Speaker: text" lines,
-- DISCARDING every timestamp. On the automatic ingestion path there is then no
-- time information at all, which degrades evidence timestamps, time-windowed
-- chunking and the time-weighted coverage gate to interpolation.
--
-- rawSegments preserves the structured form WITHOUT changing rawText, so the
-- transcript viewer and the DOCX export keep rendering exactly what the
-- recorder produced. timingSource records which of the two we actually had, so
-- a report can never imply measured timings when they were derived.

-- ---------------------------------------------------------------------------
-- 1. ClientMeetingTranscript — structured source + timing provenance
-- ---------------------------------------------------------------------------
ALTER TABLE "app_quikscale"."ClientMeetingTranscript"
  ADD COLUMN "rawSegments"  JSONB,
  ADD COLUMN "timingSource" TEXT;

-- ---------------------------------------------------------------------------
-- 2. MeetingTranscriptSegment — one speaker turn
--
-- Serves four purposes at once: normalisation output, the per-chunk fetch unit
-- (which is what keeps worker memory flat for a 6-hour meeting), the evidence
-- anchor cited by every extracted fact, and the future host for the Phase 8
-- embedding vector(768) column.
-- ---------------------------------------------------------------------------
CREATE TABLE "app_quikscale"."MeetingTranscriptSegment" (
  "id"                 TEXT NOT NULL,
  "orgId"              TEXT NOT NULL,
  "clientId"           TEXT,
  "transcriptId"       TEXT NOT NULL,
  "idx"                INTEGER NOT NULL,
  "startMs"            INTEGER NOT NULL,
  "endMs"              INTEGER NOT NULL,
  "speakerRaw"         TEXT NOT NULL,
  "clientMemberId"     TEXT,
  "text"               TEXT NOT NULL,
  "charCount"          INTEGER NOT NULL,
  "estTokens"          INTEGER NOT NULL,
  "timingInterpolated" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MeetingTranscriptSegment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MeetingTranscriptSegment_transcriptId_idx_key"
  ON "app_quikscale"."MeetingTranscriptSegment" ("transcriptId", "idx");
CREATE INDEX "MeetingTranscriptSegment_orgId_idx"
  ON "app_quikscale"."MeetingTranscriptSegment" ("orgId");
CREATE INDEX "MeetingTranscriptSegment_orgId_transcriptId_idx_idx"
  ON "app_quikscale"."MeetingTranscriptSegment" ("orgId", "transcriptId", "idx");
CREATE INDEX "MeetingTranscriptSegment_orgId_transcriptId_startMs_idx"
  ON "app_quikscale"."MeetingTranscriptSegment" ("orgId", "transcriptId", "startMs");
CREATE INDEX "MeetingTranscriptSegment_transcriptId_clientMemberId_idx"
  ON "app_quikscale"."MeetingTranscriptSegment" ("transcriptId", "clientMemberId");

ALTER TABLE "app_quikscale"."MeetingTranscriptSegment"
  ADD CONSTRAINT "MeetingTranscriptSegment_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "public"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_quikscale"."MeetingTranscriptSegment"
  ADD CONSTRAINT "MeetingTranscriptSegment_transcriptId_fkey"
  FOREIGN KEY ("transcriptId") REFERENCES "app_quikscale"."ClientMeetingTranscript"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. MeetingExtractionRun — one extraction of one transcript by one toolchain
--
-- The UNIQUE (orgId, idempotencyKey) index IS the idempotency guard: a
-- duplicate request joins the existing run rather than starting a second
-- pipeline over the same 3-6 hour transcript.
-- ---------------------------------------------------------------------------
CREATE TABLE "app_quikscale"."MeetingExtractionRun" (
  "id"                   TEXT NOT NULL,
  "orgId"                TEXT NOT NULL,
  "clientId"             TEXT,
  "transcriptId"         TEXT NOT NULL,
  "meetingId"            TEXT,
  "cadence"              TEXT,
  "idempotencyKey"       TEXT NOT NULL,
  "transcriptVersion"    INTEGER NOT NULL,
  "normalizationVersion" INTEGER NOT NULL,
  "chunkerVersion"       INTEGER NOT NULL,
  "extractionVersion"    INTEGER NOT NULL,
  "extractPromptVersion" TEXT NOT NULL,
  "status"               TEXT NOT NULL DEFAULT 'PENDING',
  "stage"                TEXT,
  "progress"             JSONB,
  "chunksTotal"          INTEGER NOT NULL DEFAULT 0,
  "chunksCompleted"      INTEGER NOT NULL DEFAULT 0,
  "chunksFailed"         INTEGER NOT NULL DEFAULT 0,
  "segmentsTotal"        INTEGER NOT NULL DEFAULT 0,
  "timingSource"         TEXT,
  "normalizationStats"   JSONB,
  "contentMsTotal"       INTEGER,
  "contentMsCovered"     INTEGER,
  "coveragePct"          DOUBLE PRECISION,
  "consolidateClaimedAt" TIMESTAMP(3),
  "tokensInput"          INTEGER NOT NULL DEFAULT 0,
  "tokensOutput"         INTEGER NOT NULL DEFAULT 0,
  "costUsd"              DECIMAL(10,6) NOT NULL DEFAULT 0,
  "queueWaitMs"          INTEGER,
  "workerDurationMs"     INTEGER,
  "startedAt"            TIMESTAMP(3),
  "finishedAt"           TIMESTAMP(3),
  "error"                TEXT,
  "requestedBy"          TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MeetingExtractionRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MeetingExtractionRun_orgId_idempotencyKey_key"
  ON "app_quikscale"."MeetingExtractionRun" ("orgId", "idempotencyKey");
CREATE INDEX "MeetingExtractionRun_orgId_idx"
  ON "app_quikscale"."MeetingExtractionRun" ("orgId");
CREATE INDEX "MeetingExtractionRun_orgId_transcriptId_idx"
  ON "app_quikscale"."MeetingExtractionRun" ("orgId", "transcriptId");
CREATE INDEX "MeetingExtractionRun_orgId_status_idx"
  ON "app_quikscale"."MeetingExtractionRun" ("orgId", "status");

ALTER TABLE "app_quikscale"."MeetingExtractionRun"
  ADD CONSTRAINT "MeetingExtractionRun_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "public"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_quikscale"."MeetingExtractionRun"
  ADD CONSTRAINT "MeetingExtractionRun_transcriptId_fkey"
  FOREIGN KEY ("transcriptId") REFERENCES "app_quikscale"."ClientMeetingTranscript"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. MeetingChunk — one unit of work in the extraction fan-out
--
-- status here, not Redis, is the source of truth for fan-in and resumability.
-- The (runId, status) index serves the fan-in question "is any chunk still
-- outstanding?"; (status, lockedUntil) serves the reclaim sweep for chunks
-- orphaned by a crashed worker.
-- ---------------------------------------------------------------------------
CREATE TABLE "app_quikscale"."MeetingChunk" (
  "id"              TEXT NOT NULL,
  "orgId"           TEXT NOT NULL,
  "clientId"        TEXT,
  "transcriptId"    TEXT NOT NULL,
  "runId"           TEXT NOT NULL,
  "idx"             INTEGER NOT NULL,
  "segFromIdx"      INTEGER NOT NULL,
  "segToIdx"        INTEGER NOT NULL,
  "overlapFromIdx"  INTEGER,
  "startMs"         INTEGER NOT NULL,
  "endMs"           INTEGER NOT NULL,
  "estTokens"       INTEGER NOT NULL,
  "estPromptTokens" INTEGER NOT NULL,
  "boundaryScore"   INTEGER,
  "boundaryReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "agendaHint"      TEXT,
  "oversizeSegment" BOOLEAN NOT NULL DEFAULT false,
  "status"          TEXT NOT NULL DEFAULT 'PENDING',
  "attempts"        INTEGER NOT NULL DEFAULT 0,
  "lastError"       TEXT,
  "lockedUntil"     TIMESTAMP(3),
  "tokensInput"     INTEGER,
  "tokensOutput"    INTEGER,
  "costUsd"         DECIMAL(10,6),
  "startedAt"       TIMESTAMP(3),
  "completedAt"     TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MeetingChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MeetingChunk_runId_idx_key"
  ON "app_quikscale"."MeetingChunk" ("runId", "idx");
CREATE INDEX "MeetingChunk_runId_status_idx"
  ON "app_quikscale"."MeetingChunk" ("runId", "status");
CREATE INDEX "MeetingChunk_orgId_idx"
  ON "app_quikscale"."MeetingChunk" ("orgId");
CREATE INDEX "MeetingChunk_orgId_transcriptId_idx"
  ON "app_quikscale"."MeetingChunk" ("orgId", "transcriptId");
CREATE INDEX "MeetingChunk_status_lockedUntil_idx"
  ON "app_quikscale"."MeetingChunk" ("status", "lockedUntil");

ALTER TABLE "app_quikscale"."MeetingChunk"
  ADD CONSTRAINT "MeetingChunk_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "public"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_quikscale"."MeetingChunk"
  ADD CONSTRAINT "MeetingChunk_transcriptId_fkey"
  FOREIGN KEY ("transcriptId") REFERENCES "app_quikscale"."ClientMeetingTranscript"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_quikscale"."MeetingChunk"
  ADD CONSTRAINT "MeetingChunk_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "app_quikscale"."MeetingExtractionRun"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
