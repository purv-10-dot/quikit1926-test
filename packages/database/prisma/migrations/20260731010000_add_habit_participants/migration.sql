-- Team scope + explicit participant list for a Rockefeller Habits assessment.
--
-- `participantUserIds` defaults to an EMPTY array, which the application reads
-- as "every active org member" — exactly what every campaign created before
-- this column already assumed. Existing rows therefore keep their current
-- participation semantics with no backfill required.
--
-- `teamId` is display/filtering context for the picker; the participant list is
-- the authoritative set, so no FK is added (a team can be deleted without
-- invalidating a historical assessment).
ALTER TABLE "app_quikscale"."HabitAssessment"
  ADD COLUMN "teamId" TEXT,
  ADD COLUMN "participantUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
