-- Client-scoped attendance classification.
--
-- The same person is routinely REQUIRED on one client's huddle and OPTIONAL on
-- another's, so this belongs on the client<->member LINK, not on the member.
--
-- Only REQUIRED members enter the attendance percentage, in the numerator and
-- the denominator both. Excluding an optional member's absence while counting
-- their presence would let attendance exceed 100%.
--
-- Additive: the column default makes every existing link REQUIRED, which is
-- exactly the behaviour before this change.

DO $$ BEGIN
  CREATE TYPE "app_quikscale"."ClientAttendanceType" AS ENUM ('REQUIRED', 'OPTIONAL', 'EXTERNAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "app_quikscale"."ClientTeamMember"
  ADD COLUMN IF NOT EXISTS "attendanceType" "app_quikscale"."ClientAttendanceType"
  NOT NULL DEFAULT 'REQUIRED';

-- Carry over the short-lived global ClientMember.isExternal flag, if the
-- migration that added it has been applied here. Guarded because
-- 20260821140000 may not have run on every environment yet, and because the
-- flag was never written to in practice — this is correctness insurance, not a
-- data migration anyone should be relying on.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'app_quikscale'
       AND table_name   = 'ClientMember'
       AND column_name  = 'isExternal'
  ) THEN
    UPDATE "app_quikscale"."ClientTeamMember" tm
       SET "attendanceType" = 'EXTERNAL'
      FROM "app_quikscale"."ClientMember" m
     WHERE m."id" = tm."clientMemberId"
       AND m."isExternal" = true;
  END IF;
END $$;
