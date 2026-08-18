-- QuikTrack: per-user "starred" (favourite) spaces.
--
-- Backs the star toggle on the Projects list and the sidebar's "Starred" group.
-- A row = this user has starred this project; deleting it un-stars. Composite PK
-- on (userId, projectId) enforces one star per user per project. Idempotent so
-- it is safe to run where the table was already added out-of-band (dev).

-- CreateTable
CREATE TABLE IF NOT EXISTS "app_quiktrack"."QtProjectStar" (
  "orgId"     TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "QtProjectStar_pkey" PRIMARY KEY ("userId", "projectId")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "QtProjectStar_orgId_userId_idx"
  ON "app_quiktrack"."QtProjectStar" ("orgId", "userId");

-- AddForeignKey (guarded: ADD CONSTRAINT has no IF NOT EXISTS, so wrap in a
-- DO block that skips when the constraint already exists).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'QtProjectStar_orgId_fkey'
  ) THEN
    ALTER TABLE "app_quiktrack"."QtProjectStar"
      ADD CONSTRAINT "QtProjectStar_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'QtProjectStar_projectId_fkey'
  ) THEN
    ALTER TABLE "app_quiktrack"."QtProjectStar"
      ADD CONSTRAINT "QtProjectStar_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "app_quiktrack"."QtProject"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
