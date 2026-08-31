-- Client member identity, for the Daily Huddle attendance rewrite.
--
-- `role`       -> the job title the Adherence Snapshot shows ("Senior Coach").
-- `isExternal` -> attends but is not measured (client staff, vendor); excluded
--                 from the attendance denominator rather than counted absent.
-- ClientMemberAlias -> the one-time human answer to "Bobby is Harjinder (Bobby)
--                 Kohli". No matcher can infer that; without somewhere to record
--                 it, the same mismatch is re-resolved every week.
--
-- All additive. `normalizedAlias` is unique per org so one spelling can never
-- point at two people — an ambiguous alias is worse than no alias.

ALTER TABLE "app_quikscale"."ClientMember"
  ADD COLUMN IF NOT EXISTS "role"       TEXT,
  ADD COLUMN IF NOT EXISTS "isExternal" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "app_quikscale"."ClientMemberAlias" (
  "id"              TEXT         NOT NULL,
  "orgId"           TEXT         NOT NULL,
  "clientMemberId"  TEXT         NOT NULL,
  "alias"           TEXT         NOT NULL,
  "normalizedAlias" TEXT         NOT NULL,
  "source"          TEXT         NOT NULL DEFAULT 'manual',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"       TEXT         NOT NULL,
  CONSTRAINT "ClientMemberAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClientMemberAlias_orgId_normalizedAlias_key"
  ON "app_quikscale"."ClientMemberAlias" ("orgId", "normalizedAlias");
CREATE INDEX IF NOT EXISTS "ClientMemberAlias_clientMemberId_idx"
  ON "app_quikscale"."ClientMemberAlias" ("clientMemberId");
CREATE INDEX IF NOT EXISTS "ClientMemberAlias_orgId_idx"
  ON "app_quikscale"."ClientMemberAlias" ("orgId");

DO $$ BEGIN
  ALTER TABLE "app_quikscale"."ClientMemberAlias"
    ADD CONSTRAINT "ClientMemberAlias_clientMemberId_fkey"
    FOREIGN KEY ("clientMemberId") REFERENCES "app_quikscale"."ClientMember"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quikscale"."ClientMemberAlias"
    ADD CONSTRAINT "ClientMemberAlias_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
