-- AI Meeting Rhythm — WWW Review as a historical meeting record.
--
-- See docs/17-ai-meeting-rhythm-architecture.md section I.3 and
-- docs/15-daily-huddle-weekly-report.md defect B6.
--
-- FULLY ADDITIVE, NO BACKFILL, ROLLBACK-LOSSLESS.
--   * Three nullable columns and one index. Nothing is dropped, renamed or
--     re-typed, and no existing row is written.
--   * Rollback is a DROP of the three columns and the index.
--
-- WHY THIS EXISTS
-- ---------------
-- `MeetingWwwFact.linkedWwwItemId` was written in exactly one place —
-- linkCandidate(), AFTER a human turned a candidate into a brand-new WWWItem.
-- Nothing ever recorded that a meeting DISCUSSED an item that already existed.
--
-- That left WWW Review unable to select "the items this meeting talked about",
-- so it fell back to listing every open WWW the viewer could see — a status
-- list wearing a meeting report's clothing.
--
-- With `linkOrigin`, one column separates the two reasons a fact points at an
-- item, and the Review selector becomes exact:
--
--     WHERE transcriptId = <this meeting> AND linkOrigin = 'MATCHED_EXISTING'
--
-- Without it, an item created from Monday's huddle would appear as a "review"
-- of itself in the same week's report.

-- ---------------------------------------------------------------------------
-- 1. The columns
--
-- All nullable with no default. A NULL `linkOrigin` on a pre-existing row is
-- read by the application as 'CREATED', which is exactly what every existing
-- linked row is: linkCandidate() was the only writer. Defaulting the column to
-- 'CREATED' in SQL would be equivalent but would rewrite every row on a large
-- table for no gain, and would lose the ability to tell "written before this
-- feature" from "written by it".
--
-- `matchRule` and `matchConfidence` record WHY the matcher linked a fact to an
-- item. A link that cannot be explained cannot be safely reversed, and this
-- link is a claim about what was said in a meeting.
-- ---------------------------------------------------------------------------

ALTER TABLE "app_quikscale"."MeetingWwwFact"
  ADD COLUMN IF NOT EXISTS "linkOrigin"      TEXT,
  ADD COLUMN IF NOT EXISTS "matchRule"       TEXT,
  ADD COLUMN IF NOT EXISTS "matchConfidence" DOUBLE PRECISION;

-- ---------------------------------------------------------------------------
-- 2. The WWW Review selector index
--
-- Every read of the section is "facts for this transcript, matched to an
-- existing item". Without the index that is a scan of the org's facts on a
-- table that grows with every meeting.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "MeetingWwwFact_orgId_transcriptId_linkOrigin_idx"
  ON "app_quikscale"."MeetingWwwFact" ("orgId", "transcriptId", "linkOrigin");

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- DROP INDEX IF EXISTS "app_quikscale"."MeetingWwwFact_orgId_transcriptId_linkOrigin_idx";
-- ALTER TABLE "app_quikscale"."MeetingWwwFact"
--   DROP COLUMN IF EXISTS "linkOrigin",
--   DROP COLUMN IF EXISTS "matchRule",
--   DROP COLUMN IF EXISTS "matchConfidence";
