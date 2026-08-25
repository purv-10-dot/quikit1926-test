-- AI Meeting Rhythm — Phase 5: Weekly Meeting fact tables + agenda config.
--
-- See docs/17-ai-meeting-rhythm-architecture.md sections D.3, E.4, and the
-- requirement doc section 5.2.
--
-- FULLY ADDITIVE AND BACKFILL-SAFE.
--   * One nullable column on Client; four new tables.
--   * Nothing existing is dropped, renamed or re-typed. No data migration.
--   * Rollback is a DROP of the four tables plus the column.

-- ---------------------------------------------------------------------------
-- 1. Client.weeklyAgendaConfig
--
-- Requirement doc 5.2 needs an EXPECTED duration per segment to classify time
-- discipline as Rushed / On Track / Over-ran. Without one, only
-- Done / Partial / Not Done is computable — which is all the schema could
-- express before this column.
--
-- Null falls back to DEFAULT_AGENDA in lib/meetings/agendaConfig.ts, so every
-- existing client keeps working unchanged.
-- ---------------------------------------------------------------------------
ALTER TABLE "app_quikscale"."Client"
  ADD COLUMN "weeklyAgendaConfig" JSONB;

-- ---------------------------------------------------------------------------
-- 2. MeetingSegmentFact — agenda coverage per segment
--
-- The extractor emits START/END markers; consolidation pairs them into windows;
-- coverage and time discipline are then COMPUTED by segmentAdherence.ts. The
-- model only reports where a boundary fell.
--
-- humanFlag/flagAgrees record the reconciliation with the seven
-- ClientWeeklyMeeting flag columns. The human flag WINS on disagreement, and
-- the disagreement is stored rather than discarded: a systematic mismatch means
-- either detection is wrong or the flags are being filled in carelessly.
-- ---------------------------------------------------------------------------
CREATE TABLE "app_quikscale"."MeetingSegmentFact" (
  "id"                TEXT NOT NULL,
  "orgId"             TEXT NOT NULL,
  "clientId"          TEXT,
  "transcriptId"      TEXT NOT NULL,
  "runId"             TEXT,
  "meetingDate"       TIMESTAMP(3),
  "segmentKey"        TEXT NOT NULL,
  "coverage"          TEXT NOT NULL,
  "timeDiscipline"    TEXT NOT NULL,
  "expectedMinutes"   INTEGER,
  "actualMinutes"     DOUBLE PRECISION,
  "startMs"           INTEGER,
  "endMs"             INTEGER,
  "humanFlag"         TEXT,
  "flagAgrees"        BOOLEAN NOT NULL DEFAULT true,
  "comment"           TEXT,
  "evidence"          JSONB NOT NULL,
  "confidence"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "extractionVersion" INTEGER,
  "promptVersion"     TEXT,
  "modelId"           TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"         TIMESTAMP(3),

  CONSTRAINT "MeetingSegmentFact_pkey" PRIMARY KEY ("id")
);

-- One verdict per segment per meeting.
CREATE UNIQUE INDEX "MeetingSegmentFact_transcriptId_segmentKey_key"
  ON "app_quikscale"."MeetingSegmentFact" ("transcriptId", "segmentKey");
CREATE INDEX "MeetingSegmentFact_orgId_idx"
  ON "app_quikscale"."MeetingSegmentFact" ("orgId");
CREATE INDEX "MeetingSegmentFact_orgId_transcriptId_idx"
  ON "app_quikscale"."MeetingSegmentFact" ("orgId", "transcriptId");
CREATE INDEX "MeetingSegmentFact_orgId_clientId_meetingDate_idx"
  ON "app_quikscale"."MeetingSegmentFact" ("orgId", "clientId", "meetingDate");

ALTER TABLE "app_quikscale"."MeetingSegmentFact"
  ADD CONSTRAINT "MeetingSegmentFact_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_quikscale"."MeetingSegmentFact"
  ADD CONSTRAINT "MeetingSegmentFact_transcriptId_fkey"
  FOREIGN KEY ("transcriptId") REFERENCES "app_quikscale"."ClientMeetingTranscript"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. MeetingKpiFact — one member's K&P dashboard read
--
-- RAG IS COPIED VERBATIM, NEVER JUDGED. The requirement doc is explicit:
-- preserve the status stated or shown in the meeting; the AI must not
-- independently change it based on its interpretation.
--
-- The (orgId, clientMemberId, meetingDate) index is the join Phase 10's
-- No-Stuck vs Red-KPI correlation needs.
-- ---------------------------------------------------------------------------
CREATE TABLE "app_quikscale"."MeetingKpiFact" (
  "id"                TEXT NOT NULL,
  "orgId"             TEXT NOT NULL,
  "clientId"          TEXT,
  "transcriptId"      TEXT NOT NULL,
  "runId"             TEXT,
  "meetingDate"       TIMESTAMP(3),
  "chunkIdx"          INTEGER,
  "speakerRaw"        TEXT NOT NULL,
  "clientMemberId"    TEXT,
  "kpiRag"            TEXT,
  "priorityRag"       TEXT,
  "keyPoints"         TEXT[] DEFAULT ARRAY[]::TEXT[],
  "ragConflict"       BOOLEAN NOT NULL DEFAULT false,
  "evidence"          JSONB NOT NULL,
  "confidence"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "extractionVersion" INTEGER,
  "promptVersion"     TEXT,
  "modelId"           TEXT,
  "fromOverlap"       BOOLEAN NOT NULL DEFAULT false,
  "mergedIntoId"      TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"         TIMESTAMP(3),

  CONSTRAINT "MeetingKpiFact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MeetingKpiFact_orgId_idx"
  ON "app_quikscale"."MeetingKpiFact" ("orgId");
CREATE INDEX "MeetingKpiFact_orgId_transcriptId_idx"
  ON "app_quikscale"."MeetingKpiFact" ("orgId", "transcriptId");
CREATE INDEX "MeetingKpiFact_orgId_clientId_meetingDate_idx"
  ON "app_quikscale"."MeetingKpiFact" ("orgId", "clientId", "meetingDate");
CREATE INDEX "MeetingKpiFact_orgId_clientMemberId_meetingDate_idx"
  ON "app_quikscale"."MeetingKpiFact" ("orgId", "clientMemberId", "meetingDate");

ALTER TABLE "app_quikscale"."MeetingKpiFact"
  ADD CONSTRAINT "MeetingKpiFact_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_quikscale"."MeetingKpiFact"
  ADD CONSTRAINT "MeetingKpiFact_transcriptId_fkey"
  FOREIGN KEY ("transcriptId") REFERENCES "app_quikscale"."ClientMeetingTranscript"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. MeetingGapFact — a gap surfaced, with the agreed response
--
-- `scope` distinguishes an individual's gap from a team-wide one. The
-- requirement doc asks for common gaps to be CONSOLIDATED rather than repeated
-- member-wise, so a gap raised by three or more people becomes one TEAM row
-- listing every raiser — which is also a stronger signal than three rows.
-- ---------------------------------------------------------------------------
CREATE TABLE "app_quikscale"."MeetingGapFact" (
  "id"                TEXT NOT NULL,
  "orgId"             TEXT NOT NULL,
  "clientId"          TEXT,
  "transcriptId"      TEXT NOT NULL,
  "runId"             TEXT,
  "meetingDate"       TIMESTAMP(3),
  "chunkIdx"          INTEGER,
  "gap"               TEXT NOT NULL,
  "normalizedKey"     TEXT NOT NULL,
  "agreedAction"      TEXT,
  "ownerRaw"          TEXT,
  "ownerMemberId"     TEXT,
  "scope"             TEXT NOT NULL DEFAULT 'INDIVIDUAL',
  "raisedByRaw"       TEXT[] DEFAULT ARRAY[]::TEXT[],
  "severityStated"    TEXT,
  "evidence"          JSONB NOT NULL,
  "confidence"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "extractionVersion" INTEGER,
  "promptVersion"     TEXT,
  "modelId"           TEXT,
  "fromOverlap"       BOOLEAN NOT NULL DEFAULT false,
  "mergedIntoId"      TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"         TIMESTAMP(3),

  CONSTRAINT "MeetingGapFact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MeetingGapFact_orgId_idx"
  ON "app_quikscale"."MeetingGapFact" ("orgId");
CREATE INDEX "MeetingGapFact_orgId_transcriptId_idx"
  ON "app_quikscale"."MeetingGapFact" ("orgId", "transcriptId");
CREATE INDEX "MeetingGapFact_orgId_clientId_meetingDate_idx"
  ON "app_quikscale"."MeetingGapFact" ("orgId", "clientId", "meetingDate");
CREATE INDEX "MeetingGapFact_orgId_normalizedKey_idx"
  ON "app_quikscale"."MeetingGapFact" ("orgId", "normalizedKey");

ALTER TABLE "app_quikscale"."MeetingGapFact"
  ADD CONSTRAINT "MeetingGapFact_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_quikscale"."MeetingGapFact"
  ADD CONSTRAINT "MeetingGapFact_transcriptId_fkey"
  FOREIGN KEY ("transcriptId") REFERENCES "app_quikscale"."ClientMeetingTranscript"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 5. MeetingDiscussionFact — Good News, CEF and CI
--
-- One table with a `kind` discriminator rather than three near-identical ones:
-- all three are "somebody shared something", differing only in which agenda
-- segment they belong to.
--
-- wasDeferred matters for CI specifically. The requirement doc says that if CI
-- was skipped or deferred, RECORD THAT — do not generate a topic from other
-- meeting discussion. A deferred CI is a row saying so, never a manufactured
-- topic scraped from elsewhere in the conversation.
-- ---------------------------------------------------------------------------
CREATE TABLE "app_quikscale"."MeetingDiscussionFact" (
  "id"                TEXT NOT NULL,
  "orgId"             TEXT NOT NULL,
  "clientId"          TEXT,
  "transcriptId"      TEXT NOT NULL,
  "runId"             TEXT,
  "meetingDate"       TIMESTAMP(3),
  "chunkIdx"          INTEGER,
  "kind"              TEXT NOT NULL,
  "sharedByRaw"       TEXT,
  "sharedByMemberId"  TEXT,
  "summary"           TEXT NOT NULL,
  "normalizedKey"     TEXT NOT NULL,
  "outcome"           TEXT,
  "wasDeferred"       BOOLEAN NOT NULL DEFAULT false,
  "evidence"          JSONB NOT NULL,
  "confidence"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "extractionVersion" INTEGER,
  "promptVersion"     TEXT,
  "modelId"           TEXT,
  "fromOverlap"       BOOLEAN NOT NULL DEFAULT false,
  "mergedIntoId"      TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"         TIMESTAMP(3),

  CONSTRAINT "MeetingDiscussionFact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MeetingDiscussionFact_orgId_idx"
  ON "app_quikscale"."MeetingDiscussionFact" ("orgId");
CREATE INDEX "MeetingDiscussionFact_orgId_transcriptId_kind_idx"
  ON "app_quikscale"."MeetingDiscussionFact" ("orgId", "transcriptId", "kind");
CREATE INDEX "MeetingDiscussionFact_orgId_clientId_meetingDate_idx"
  ON "app_quikscale"."MeetingDiscussionFact" ("orgId", "clientId", "meetingDate");

ALTER TABLE "app_quikscale"."MeetingDiscussionFact"
  ADD CONSTRAINT "MeetingDiscussionFact_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_quikscale"."MeetingDiscussionFact"
  ADD CONSTRAINT "MeetingDiscussionFact_transcriptId_fkey"
  FOREIGN KEY ("transcriptId") REFERENCES "app_quikscale"."ClientMeetingTranscript"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
