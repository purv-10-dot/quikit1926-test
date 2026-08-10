-- READ-ONLY: reports which of the 16 un-migrated QuikTrack tables already
-- exist on the target DB (UAT). Run this FIRST. `exists = false` rows are the
-- ones the migration below will create. Nothing is modified by this query.
SELECT t.tbl AS table_name,
       to_regclass('app_quiktrack."' || t.tbl || '"') IS NOT NULL AS present
FROM (VALUES
  ('QtSprintSnapshot'),
  ('QtChecklistStatus'),
  ('QtChecklistItem'),
  ('QtSavedFilter'),
  ('QtFeedback'),
  ('QtIdeaStatus'),
  ('QtIdea'),
  ('QtIdeaFieldValue'),
  ('QtIdeaView'),
  ('QtIdeaComment'),
  ('QtIdeaCommentReaction'),
  ('QtIdeaInsight'),
  ('QtIdeaDelivery'),
  ('QtIdeaViewComment'),
  ('QtIdeaAttachment'),
  ('QtIdeaLink')
) AS t(tbl)
ORDER BY present, table_name;

-- Dependency sanity check: QtIdeaFieldValue FKs to app_quiktrack."QtCustomField"
-- (created by migration 20260611120000_quiktrack_custom_fields). If this is
-- NULL, apply the custom-fields migration first, or the QtIdeaFieldValue FK in
-- the migration below will be skipped (guarded).
SELECT to_regclass('app_quiktrack."QtCustomField"') IS NOT NULL AS qtcustomfield_present;
