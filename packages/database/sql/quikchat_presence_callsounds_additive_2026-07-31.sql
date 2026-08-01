-- ============================================================================
-- QuikChat — additive schema changes (2026-07-31)
-- ============================================================================
-- Baseline : app_quikchat as live on Neon UAT (21 tables, verified 2026-07-31)
-- Target   : packages/database/prisma/schema.prisma @ common_setup69
-- Scope    : the `app_quikchat` Postgres schema ONLY. No other schema, app or
--            shared table is touched. Purely additive — one new column, one
--            new table, one new unique index. No drops, no type changes, no
--            data rewrites, no backfills.
--
-- Source commit: af344a5a "feat(db): quikchat schema additions + moreyeahs chat seed"
--
-- Changes included:
--   1. QcUserNotificationSettings.callSoundsEnabled   (new column)
--   2. QcUserPresence                                 (new table + unique index)
--
-- Idempotent: every statement is guarded (ADD COLUMN IF NOT EXISTS /
-- CREATE TABLE IF NOT EXISTS / CREATE UNIQUE INDEX IF NOT EXISTS), so the file
-- is safe to run repeatedly and safe to re-run after a partial prior apply.
-- Wrapped in one transaction — all-or-nothing.
--
-- Prereq: schema `app_quikchat` and table `app_quikchat."QcUserNotificationSettings"`
-- must already exist (both verified present on UAT).
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Call sounds toggle  (QcUserNotificationSettings.callSoundsEnabled)
--    Splits call audio (ringtone / ringback / in-call tones) out from the
--    existing `soundEnabled` flag, which now covers message chimes only.
--    NOT NULL DEFAULT true — existing rows inherit `true`, preserving today's
--    behaviour where call sounds followed the single sound switch.
--    Postgres 11+ applies this without a table rewrite.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE "app_quikchat"."QcUserNotificationSettings"
  ADD COLUMN IF NOT EXISTS "callSoundsEnabled" BOOLEAN NOT NULL DEFAULT true;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. Rich presence set-status  (QcUserPresence)
--    Stores ONLY the durable, user-set status. The ephemeral `on_call` /
--    `online` / `offline` states are derived by the realtime gateway and are
--    never written here. `status` is TEXT (not an enum) to match every other
--    Qc* table — allowed values: available | busy | dnd | brb | away |
--    appear_offline.
--
--    Column shapes follow the app_quikchat conventions already on UAT:
--      • id           TEXT, no DB default — Prisma @default(uuid()) is app-side
--      • timestamps   TIMESTAMP(3)
--      • createdAt    DEFAULT CURRENT_TIMESTAMP
--      • updatedAt    NOT NULL, no default — Prisma @updatedAt is app-side
--    (identical to QcUserUiPrefs / QcUserNotificationSettings).
--
--    `statusExpiresAt` is nullable: an absolute instant for timed statuses
--    ("Busy for 30 min"). Expiry is evaluated LAZILY at read time — there is no
--    sweeper job, so this migration adds no scheduled work.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "app_quikchat"."QcUserPresence" (
    "id"              TEXT         NOT NULL,
    "orgId"           TEXT         NOT NULL,
    "userId"          TEXT         NOT NULL,
    "status"          TEXT         NOT NULL DEFAULT 'available',
    "statusMessage"   TEXT,
    "statusExpiresAt" TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QcUserPresence_pkey" PRIMARY KEY ("id")
);

-- One presence row per user per org (backs the Prisma @@unique([orgId, userId])
-- and the upsert the set-status endpoint performs).
CREATE UNIQUE INDEX IF NOT EXISTS "QcUserPresence_orgId_userId_key"
  ON "app_quikchat"."QcUserPresence"("orgId", "userId");

COMMIT;

-- ============================================================================
-- Post-apply verification (read-only — run separately, outside the transaction)
-- ============================================================================
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'app_quikchat'
--    AND table_name   = 'QcUserNotificationSettings'
--    AND column_name  = 'callSoundsEnabled';
--
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'app_quikchat'
--    AND table_name   = 'QcUserPresence'
--  ORDER BY ordinal_position;
--
-- SELECT indexname, indexdef FROM pg_indexes
--  WHERE schemaname = 'app_quikchat' AND tablename = 'QcUserPresence';
-- ============================================================================
