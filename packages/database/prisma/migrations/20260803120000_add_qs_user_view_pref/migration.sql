-- QuikScale: generic per-user, per-org flag store (first use: onboarding
-- tour "completed" state). Additive + idempotent.

CREATE TABLE IF NOT EXISTS app_quikscale."QsUserViewPref" (
    "id"        TEXT NOT NULL,
    "orgId"     TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "viewKey"   TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QsUserViewPref_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "QsUserViewPref_userId_orgId_viewKey_key"
    ON app_quikscale."QsUserViewPref" ("userId", "orgId", "viewKey");

CREATE INDEX IF NOT EXISTS "QsUserViewPref_userId_orgId_idx"
    ON app_quikscale."QsUserViewPref" ("userId", "orgId");

ALTER TABLE app_quikscale."QsUserViewPref" DROP CONSTRAINT IF EXISTS "QsUserViewPref_userId_fkey";
ALTER TABLE app_quikscale."QsUserViewPref"
    ADD CONSTRAINT "QsUserViewPref_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES auth."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE app_quikscale."QsUserViewPref" DROP CONSTRAINT IF EXISTS "QsUserViewPref_orgId_fkey";
ALTER TABLE app_quikscale."QsUserViewPref"
    ADD CONSTRAINT "QsUserViewPref_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES quikit."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
