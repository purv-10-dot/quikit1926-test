-- The topic dimension, for bounded fact reduction (doc 17 §R1).
--
-- WHY THIS EXISTS
-- ---------------
-- A six-hour weekly meeting produces hundreds of facts spanning several
-- workstreams. Feeding all of them to the analysis model recreates the very
-- context problem chunked extraction was built to avoid, so facts must be
-- REDUCED before that call — and a reduction is only meaningful if it happens
-- within a coherent group. Reducing a hiring gap against a deployment gap would
-- merge two unrelated problems into one sentence.
--
-- The signal was already being paid for and thrown away: the chunk extractor
-- returns `topicsOpen` on every chunk and nothing persisted it. This migration
-- keeps it, then lets consolidation stamp each fact with the topic its own
-- chunks named.
--
-- `topicKey` is deliberately NULLABLE with no default. A fact whose topic could
-- not be matched stays null and reduces inside the untopiced group; guessing a
-- topic would silently reduce unrelated facts against each other, which is the
-- exact failure this column exists to prevent.
--
-- Additive only. Safe to apply while the app is running: existing rows get an
-- empty array and a null topic, which is the correct reading of "we never
-- captured this".

-- Chunk-scoped topic labels, parked like `segmentMarkers` and reconciled
-- globally during consolidation.
ALTER TABLE "app_quikscale"."MeetingChunk"
  ADD COLUMN IF NOT EXISTS "topicsOpen" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "app_quikscale"."MeetingStuckFact"
  ADD COLUMN IF NOT EXISTS "topicKey" TEXT;

ALTER TABLE "app_quikscale"."MeetingGapFact"
  ADD COLUMN IF NOT EXISTS "topicKey" TEXT;

ALTER TABLE "app_quikscale"."MeetingDiscussionFact"
  ADD COLUMN IF NOT EXISTS "topicKey" TEXT;

-- The grouping query reduction runs: one meeting's facts of one type, by topic.
CREATE INDEX IF NOT EXISTS "MeetingStuckFact_orgId_transcriptId_topicKey_idx"
  ON "app_quikscale"."MeetingStuckFact" ("orgId", "transcriptId", "topicKey");

CREATE INDEX IF NOT EXISTS "MeetingGapFact_orgId_transcriptId_topicKey_idx"
  ON "app_quikscale"."MeetingGapFact" ("orgId", "transcriptId", "topicKey");

CREATE INDEX IF NOT EXISTS "MeetingDiscussionFact_orgId_transcriptId_topicKey_idx"
  ON "app_quikscale"."MeetingDiscussionFact" ("orgId", "transcriptId", "topicKey");
