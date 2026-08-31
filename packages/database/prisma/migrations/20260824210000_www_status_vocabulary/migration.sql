-- AI Meeting Rhythm — Phase 4: reconcile the WWW status vocabulary.
--
-- See docs/17-ai-meeting-rhythm-architecture.md section I.1.
--
-- DATA MIGRATION. Read this before applying.
--
-- THE PROBLEM
-- -----------
-- Three vocabularies disagreed about what a WWW status is:
--
--   UI canon (lib/constants/status.ts)
--       not-applicable | not-yet-started | behind-schedule | on-track | completed
--   API schema (lib/schemas/wwwSchema.ts) — the five above PLUS
--       in-progress | blocked
--   Column DEFAULT and the internal create-www routes
--       not-started
--
-- The last three appear in NO enum the UI can render. `ITEM_STATUS_ORDER` does
-- not contain them, so the status <select> matches no option and silently falls
-- back to its FIRST option — displaying such an item as "Not Applicable"
-- regardless of what it actually is. `wwwStats.ts` drops them from every bucket
-- with a bare `continue`, so they vanish from the dashboard averages too.
--
-- An item stuck at "not-started" is therefore invisible in the stats and
-- mislabelled in the table, while still being a live commitment somebody owns.
--
-- THE FIX
-- -------
-- Map each orphan to its nearest renderable equivalent. The mappings preserve
-- meaning and, critically, none of them maps to a CLOSED status — mapping a
-- working item to "completed" or "not-applicable" would silently remove it from
-- overdue counts and completion rates, which is precisely the invisibility
-- being fixed.
--
--   not-started  -> not-yet-started    (same meaning, renderable spelling)
--   in-progress  -> on-track           (the app's "actively being worked")
--   blocked      -> behind-schedule    (the app's "at risk / not progressing")
--
-- Idempotent: re-running matches nothing. Reversible only in the sense that the
-- original spellings are recoverable from AuditChange where they were recorded;
-- the mapping itself is not automatically undoable, so review the counts from
-- the SELECT below before applying.

-- ---------------------------------------------------------------------------
-- 0. Inspect before applying (safe to run on its own).
-- ---------------------------------------------------------------------------
-- SELECT "status", COUNT(*)
--   FROM "app_quikscale"."WWWItem"
--  WHERE "status" NOT IN
--        ('not-applicable','not-yet-started','behind-schedule','on-track','completed')
--  GROUP BY "status";

-- ---------------------------------------------------------------------------
-- 1. Migrate the orphan values.
-- ---------------------------------------------------------------------------
UPDATE "app_quikscale"."WWWItem"
   SET "status" = 'not-yet-started'
 WHERE "status" = 'not-started';

UPDATE "app_quikscale"."WWWItem"
   SET "status" = 'on-track'
 WHERE "status" = 'in-progress';

UPDATE "app_quikscale"."WWWItem"
   SET "status" = 'behind-schedule'
 WHERE "status" = 'blocked';

-- Anything still outside the canonical five is unexpected. Send it to
-- not-yet-started rather than leaving it unrenderable — a visibly open item is
-- recoverable by its owner, an invisible one is not.
UPDATE "app_quikscale"."WWWItem"
   SET "status" = 'not-yet-started'
 WHERE "status" NOT IN
       ('not-applicable','not-yet-started','behind-schedule','on-track','completed');

-- ---------------------------------------------------------------------------
-- 2. Fix the column default.
--
-- The default was 'not-started', so every row created without an explicit
-- status inherited an unrenderable value. Both internal create-www action
-- routes also wrote it literally; those are fixed in the application code in
-- the same change.
-- ---------------------------------------------------------------------------
ALTER TABLE "app_quikscale"."WWWItem"
  ALTER COLUMN "status" SET DEFAULT 'not-yet-started';
