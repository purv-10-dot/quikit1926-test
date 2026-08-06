-- Add "To Be Decided" due-date flag to WWWItem.
--
-- `when` deliberately stays NOT NULL. When `dueDateTBD` is true the row still
-- carries a placeholder date (the creation date) so every existing reader,
-- ORDER BY and index on `when` keeps working unchanged; only the display layer
-- branches on this flag to render "To be decided".
--
-- Additive and backfill-safe: existing rows default to false, preserving their
-- current behaviour exactly.
ALTER TABLE "app_quikscale"."WWWItem"
  ADD COLUMN "dueDateTBD" BOOLEAN NOT NULL DEFAULT false;
