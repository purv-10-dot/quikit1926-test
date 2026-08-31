-- AI Meeting Rhythm — Phase 2: the fact layer.
--
-- See docs/17-ai-meeting-rhythm-architecture.md sections E.4, F.1, D.7.
--
-- FULLY ADDITIVE AND BACKFILL-SAFE.
--   * Four new tables. Nothing existing is touched.
--   * No data migration. Facts are produced by extraction; historical
--     transcripts simply have none until they are extracted.
--   * Rollback is a DROP of the four tables.
--
-- WHY ADHERENCE IS A STRING AND NOT A NUMBER
-- ------------------------------------------
-- The requirement doc fixes Yes=100 / Partial=50 / No=0, averaged over the
-- huddles a member ATTENDED. That arithmetic lives in
-- lib/ai/weeklyHuddleAggregate.ts where it is unit-tested and cannot drift.
-- Storing a model-produced number here would make every report's headline
-- figure an LLM guess, so the column holds the classification only.
--
-- WHY ADHERENCE AND QUALITY ARE SEPARATE COLUMNS
-- ----------------------------------------------
-- The client doc distinguishes "was the update given?" from "how good was it?",
-- and the Facilitator Observations section is built on that split: a member can
-- score 100% adherence while every achievement is activity-oriented. One column
-- could not express that.

-- ---------------------------------------------------------------------------
-- 1. MeetingParticipantFact — the three-point Daily Huddle update
--
-- Self-joined on (clientMemberId, meetingDate) this also answers Phase-2
-- commitment follow-through with no schema change, which the requirement doc
-- asks for explicitly. Hence the dedicated index on that pair.
--
-- The (orgId, clientId, noStuck, meetingDate) index serves the "No Stuck"
-- frequency aggregate the client wants correlated with Red KPIs later.
-- ---------------------------------------------------------------------------
CREATE TABLE "app_quikscale"."MeetingParticipantFact" (
  "id"                   TEXT NOT NULL,
  "orgId"                TEXT NOT NULL,
  "clientId"             TEXT,
  "transcriptId"         TEXT NOT NULL,
  "runId"                TEXT,
  "meetingDate"          TIMESTAMP(3),
  "cadence"              TEXT,
  "chunkIdx"             INTEGER,
  "speakerRaw"           TEXT NOT NULL,
  "clientMemberId"       TEXT,

  "achievementText"      TEXT,
  "achievementAdherence" TEXT NOT NULL,
  "achievementQuality"   TEXT NOT NULL,
  "achievementEvidence"  JSONB NOT NULL,

  "focusText"            TEXT,
  "focusAdherence"       TEXT NOT NULL,
  "focusQuality"         TEXT NOT NULL,
  "focusEvidence"        JSONB NOT NULL,

  "stuckText"            TEXT,
  "stuckAdherence"       TEXT NOT NULL,
  "stuckQuality"         TEXT NOT NULL,
  "stuckEvidence"        JSONB NOT NULL,

  "noStuck"              BOOLEAN NOT NULL DEFAULT false,
  "confidence"           DOUBLE PRECISION NOT NULL DEFAULT 0,
  "extractionVersion"    INTEGER,
  "promptVersion"        TEXT,
  "modelId"              TEXT,
  "fromOverlap"          BOOLEAN NOT NULL DEFAULT false,
  "mergedIntoId"         TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"            TIMESTAMP(3),

  CONSTRAINT "MeetingParticipantFact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MeetingParticipantFact_orgId_idx"
  ON "app_quikscale"."MeetingParticipantFact" ("orgId");
CREATE INDEX "MeetingParticipantFact_orgId_transcriptId_idx"
  ON "app_quikscale"."MeetingParticipantFact" ("orgId", "transcriptId");
CREATE INDEX "MeetingParticipantFact_orgId_clientId_meetingDate_idx"
  ON "app_quikscale"."MeetingParticipantFact" ("orgId", "clientId", "meetingDate");
CREATE INDEX "MeetingParticipantFact_orgId_clientMemberId_meetingDate_idx"
  ON "app_quikscale"."MeetingParticipantFact" ("orgId", "clientMemberId", "meetingDate");
CREATE INDEX "MeetingParticipantFact_orgId_clientId_noStuck_meetingDate_idx"
  ON "app_quikscale"."MeetingParticipantFact" ("orgId", "clientId", "noStuck", "meetingDate");

ALTER TABLE "app_quikscale"."MeetingParticipantFact"
  ADD CONSTRAINT "MeetingParticipantFact_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_quikscale"."MeetingParticipantFact"
  ADD CONSTRAINT "MeetingParticipantFact_transcriptId_fkey"
  FOREIGN KEY ("transcriptId") REFERENCES "app_quikscale"."ClientMeetingTranscript"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. MeetingStuckFact — one blocker raised
--
-- normalizedKey makes recurrence detection free: grouping by it finds repeats
-- within a week AND across a month, with no AI call and no vector index.
--
-- raisedForRaw is free text because a stuck is often raised for a client, a
-- team or an external party, not only a roster member.
-- ---------------------------------------------------------------------------
CREATE TABLE "app_quikscale"."MeetingStuckFact" (
  "id"                TEXT NOT NULL,
  "orgId"             TEXT NOT NULL,
  "clientId"          TEXT,
  "transcriptId"      TEXT NOT NULL,
  "runId"             TEXT,
  "meetingDate"       TIMESTAMP(3),
  "cadence"           TEXT,
  "chunkIdx"          INTEGER,
  "raisedByRaw"       TEXT NOT NULL,
  "raisedByMemberId"  TEXT,
  "raisedForRaw"      TEXT,
  "raisedForMemberId" TEXT,
  "description"       TEXT NOT NULL,
  "normalizedKey"     TEXT NOT NULL,
  "category"          TEXT,
  "statusStated"      TEXT,
  "evidence"          JSONB NOT NULL,
  "confidence"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "extractionVersion" INTEGER,
  "promptVersion"     TEXT,
  "modelId"           TEXT,
  "fromOverlap"       BOOLEAN NOT NULL DEFAULT false,
  "mergedIntoId"      TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"         TIMESTAMP(3),

  CONSTRAINT "MeetingStuckFact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MeetingStuckFact_orgId_idx"
  ON "app_quikscale"."MeetingStuckFact" ("orgId");
CREATE INDEX "MeetingStuckFact_orgId_transcriptId_idx"
  ON "app_quikscale"."MeetingStuckFact" ("orgId", "transcriptId");
CREATE INDEX "MeetingStuckFact_orgId_clientId_meetingDate_idx"
  ON "app_quikscale"."MeetingStuckFact" ("orgId", "clientId", "meetingDate");
CREATE INDEX "MeetingStuckFact_orgId_normalizedKey_idx"
  ON "app_quikscale"."MeetingStuckFact" ("orgId", "normalizedKey");

ALTER TABLE "app_quikscale"."MeetingStuckFact"
  ADD CONSTRAINT "MeetingStuckFact_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_quikscale"."MeetingStuckFact"
  ADD CONSTRAINT "MeetingStuckFact_transcriptId_fkey"
  FOREIGN KEY ("transcriptId") REFERENCES "app_quikscale"."ClientMeetingTranscript"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. MeetingWwwFact — a Who/What/When candidate
--
-- Serves BOTH report sections and the link to the business record, which is why
-- doc 15's separately-planned ClientHuddleReportWwwLink is unnecessary: one
-- table, not two.
--
-- whenMissing is NOT NULL with a default of true, deliberately the cautious
-- direction: a row whose completeness was never established reads as "no date
-- stated" rather than silently implying one was.
--
-- dismissedAt persists so a rejected suggestion never reappears after a
-- regenerate; otherwise the facilitator re-rejects it every week.
-- ---------------------------------------------------------------------------
CREATE TABLE "app_quikscale"."MeetingWwwFact" (
  "id"                TEXT NOT NULL,
  "orgId"             TEXT NOT NULL,
  "clientId"          TEXT,
  "transcriptId"      TEXT NOT NULL,
  "runId"             TEXT,
  "meetingDate"       TIMESTAMP(3),
  "cadence"           TEXT,
  "chunkIdx"          INTEGER,
  "whoRaw"            TEXT,
  "whoMemberId"       TEXT,
  "whoUserId"         TEXT,
  "what"              TEXT NOT NULL,
  "normalizedKey"     TEXT NOT NULL,
  "whenText"          TEXT,
  "whenDate"          TIMESTAMP(3),
  "whenMissing"       BOOLEAN NOT NULL DEFAULT true,
  "completeness"      TEXT NOT NULL,
  "evidence"          JSONB NOT NULL,
  "confidence"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "linkedWwwItemId"   TEXT,
  "dismissedAt"       TIMESTAMP(3),
  "dismissedBy"       TEXT,
  "dismissReason"     TEXT,
  "extractionVersion" INTEGER,
  "promptVersion"     TEXT,
  "modelId"           TEXT,
  "fromOverlap"       BOOLEAN NOT NULL DEFAULT false,
  "mergedIntoId"      TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"         TIMESTAMP(3),

  CONSTRAINT "MeetingWwwFact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MeetingWwwFact_orgId_idx"
  ON "app_quikscale"."MeetingWwwFact" ("orgId");
CREATE INDEX "MeetingWwwFact_orgId_transcriptId_idx"
  ON "app_quikscale"."MeetingWwwFact" ("orgId", "transcriptId");
CREATE INDEX "MeetingWwwFact_orgId_clientId_meetingDate_idx"
  ON "app_quikscale"."MeetingWwwFact" ("orgId", "clientId", "meetingDate");
CREATE INDEX "MeetingWwwFact_orgId_linkedWwwItemId_idx"
  ON "app_quikscale"."MeetingWwwFact" ("orgId", "linkedWwwItemId");
CREATE INDEX "MeetingWwwFact_orgId_normalizedKey_idx"
  ON "app_quikscale"."MeetingWwwFact" ("orgId", "normalizedKey");

ALTER TABLE "app_quikscale"."MeetingWwwFact"
  ADD CONSTRAINT "MeetingWwwFact_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_quikscale"."MeetingWwwFact"
  ADD CONSTRAINT "MeetingWwwFact_transcriptId_fkey"
  FOREIGN KEY ("transcriptId") REFERENCES "app_quikscale"."ClientMeetingTranscript"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. MeetingFactMerge — audit of one consolidation decision
--
-- A bad merge is the most damaging failure in consolidation: two distinct
-- blockers merged into one produce a FALSE report and destroy an evidence
-- trail. Merged facts are soft-deleted rather than removed, and this table
-- records why, so a merge is inspectable and reversible.
--
-- decidedBy separates free deterministic merges from bounded LLM adjudication,
-- so the adjudicator's accuracy is measurable rather than assumed.
-- ---------------------------------------------------------------------------
CREATE TABLE "app_quikscale"."MeetingFactMerge" (
  "id"             TEXT NOT NULL,
  "orgId"          TEXT NOT NULL,
  "transcriptId"   TEXT NOT NULL,
  "runId"          TEXT,
  "factType"       TEXT NOT NULL,
  "survivorFactId" TEXT NOT NULL,
  "mergedFactId"   TEXT NOT NULL,
  "rule"           TEXT NOT NULL,
  "similarity"     DOUBLE PRECISION,
  "decidedBy"      TEXT NOT NULL,
  "confidence"     DOUBLE PRECISION,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MeetingFactMerge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MeetingFactMerge_orgId_idx"
  ON "app_quikscale"."MeetingFactMerge" ("orgId");
CREATE INDEX "MeetingFactMerge_orgId_transcriptId_idx"
  ON "app_quikscale"."MeetingFactMerge" ("orgId", "transcriptId");
CREATE INDEX "MeetingFactMerge_survivorFactId_idx"
  ON "app_quikscale"."MeetingFactMerge" ("survivorFactId");

ALTER TABLE "app_quikscale"."MeetingFactMerge"
  ADD CONSTRAINT "MeetingFactMerge_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
