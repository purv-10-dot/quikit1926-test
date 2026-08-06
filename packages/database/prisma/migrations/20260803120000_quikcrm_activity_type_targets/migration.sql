-- QuikCRM: Activity Type-wise daily targets (per user × activity type).
--
-- The OVERALL daily target stays where it is — CrmOrgWorkspaceSettings
-- .settings.activityTargets — and is not touched by this migration. This table
-- adds an INDEPENDENT, additive layer: a daily target for one salesperson on
-- one activity type. Activity types are the admin-managed CrmActivityType rows,
-- so a type created in Settings → Activity Types can receive targets with no
-- code or schema change.
--
-- Deleting an activity type cascades its targets away (ON DELETE CASCADE on
-- activityTypeId), so a removed type never leaves orphaned target rows behind.
-- Deactivating a type (isActive = false) keeps the rows: the admin screen hides
-- inactive types but their stored targets survive a re-activation.
--
-- Idempotent (CREATE TABLE/INDEX IF NOT EXISTS) so it is safe to apply to the
-- shared DB by hand; the build pipeline does not run `migrate deploy`. Index
-- names match Prisma's generated names for @@unique / @@index so the client
-- stays in sync with the DB.

CREATE TABLE IF NOT EXISTS app_quikcrm."CrmActivityTypeTarget" (
  id               text PRIMARY KEY,
  "orgId"          text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "userId"         text NOT NULL,
  "activityTypeId" text NOT NULL REFERENCES app_quikcrm."CrmActivityType"(id) ON DELETE CASCADE,
  "dailyTarget"    integer NOT NULL DEFAULT 0,
  "createdAt"      timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"      timestamp(3) NOT NULL
);

-- @@unique([orgId, userId, activityTypeId]) — one target per (user, type).
-- Also the conflict target for the settings upsert.
CREATE UNIQUE INDEX IF NOT EXISTS "CrmActivityTypeTarget_orgId_userId_activityTypeId_key"
  ON app_quikcrm."CrmActivityTypeTarget" ("orgId", "userId", "activityTypeId");
-- @@index([orgId]) — org scoping.
CREATE INDEX IF NOT EXISTS "CrmActivityTypeTarget_orgId_idx"
  ON app_quikcrm."CrmActivityTypeTarget" ("orgId");
-- @@index([orgId, userId]) — the tracker's per-salesperson lookup.
CREATE INDEX IF NOT EXISTS "CrmActivityTypeTarget_orgId_userId_idx"
  ON app_quikcrm."CrmActivityTypeTarget" ("orgId", "userId");
-- @@index([activityTypeId]) — cascade + "who targets this type" lookups.
CREATE INDEX IF NOT EXISTS "CrmActivityTypeTarget_activityTypeId_idx"
  ON app_quikcrm."CrmActivityTypeTarget" ("activityTypeId");
