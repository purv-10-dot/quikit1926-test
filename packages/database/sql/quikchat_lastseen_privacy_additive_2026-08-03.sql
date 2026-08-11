-- ============================================================================
-- QuikChat — additive schema changes (2026-08-03): last-seen privacy
-- ============================================================================
-- Baseline : app_quikchat AFTER quikchat_presence_callsounds_additive_2026-07-31.sql
--            (22 tables: the 21 verified live on 2026-07-31 + QcUserPresence)
-- Target   : packages/database/prisma/schema.prisma @ HEAD
-- Scope    : the `app_quikchat` Postgres schema ONLY. No other schema, app or
--            shared table is touched. Purely additive — one new column. No
--            drops, no type changes, no data rewrites, no backfills.
--
-- Source commit: c9b1d4ef "feat(quikchat): last seen with mutual WhatsApp-style
--                privacy" (2026-08-03)
--
-- ── PROVENANCE — read before trusting this file ─────────────────────────────
-- RECONSTRUCTED from `schema.prisma` plus a LOCAL, Prisma-built dev database.
-- It has NEVER been diffed against UAT. This is not the SQL that was applied
-- anywhere; it is what the schema says the applied SQL should have been.
-- The specific assumption a reviewer must test: that UAT's
-- `app_quikchat."QcUserPresence"` matches what Prisma generates locally.
-- Run the pre-apply query below and compare before executing the transaction.
--
-- ── Why this is the only pending change ─────────────────────────────────────
-- A field-level diff of every `app_quikchat` model between 4e87cf93 (the 31 Jul
-- script's commit) and HEAD returns exactly one difference: this column. The
-- RBAC substrate tables (AppRole / UserAppRole / RolePermission /
-- UserPermissionExtra) are NOT part of this gap — they entered schema.prisma on
-- 2026-07-16 in commit 37651305, fifteen days BEFORE the 31 July script, and
-- are among the 21 tables that script names as its baseline. See
-- quikchat_rbac_substrate_additive_2026-07-16.sql, which is a reproducibility
-- backfill rather than a pending migration.
--
-- Changes included:
--   1. QcUserPresence.shareLastSeen   (new column)
--
-- Idempotent: the single statement is guarded (ADD COLUMN IF NOT EXISTS), so
-- the file is safe to run repeatedly. Wrapped in one transaction.
--
-- Prereq: schema `app_quikchat` and table `app_quikchat."QcUserPresence"` must
-- already exist — i.e. quikchat_presence_callsounds_additive_2026-07-31.sql has
-- been applied. This file will fail loudly if it has not.
-- ============================================================================


-- ── PRE-APPLY (read-only — run this FIRST, outside the transaction) ─────────
-- Confirms the prereq table exists and that the column is not already present
-- under a different shape. Expected: 8 rows, none of them `shareLastSeen`.
--
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'app_quikchat'
--    AND table_name   = 'QcUserPresence'
--  ORDER BY ordinal_position;


BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Last-seen visibility  (QcUserPresence.shareLastSeen)
--    Per-user opt-out for "last seen" in DM headers. The rule is MUTUAL,
--    WhatsApp-style: a viewer sees this user's last-seen only when BOTH sides
--    have the flag true (getEffectiveLastSeen in presence.service.ts). The
--    `appear_offline` status overrides it outright.
--
--    NOT NULL DEFAULT true — existing rows inherit `true`, preserving today's
--    behaviour, where last-seen was shown to every channel peer because no
--    opt-out existed. Defaulting to false would silently switch the feature off
--    for every current user on apply.
--
--    Postgres 11+ applies this without a table rewrite, so no backfill step and
--    no long lock on QcUserPresence. Mirrors the callSoundsEnabled column added
--    by the 31 July script.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE "app_quikchat"."QcUserPresence"
  ADD COLUMN IF NOT EXISTS "shareLastSeen" BOOLEAN NOT NULL DEFAULT true;

COMMIT;

-- ============================================================================
-- Post-apply verification (read-only — run separately, outside the transaction)
-- ============================================================================
-- Expect exactly one row: boolean / NO / true
--
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'app_quikchat'
--    AND table_name   = 'QcUserPresence'
--    AND column_name  = 'shareLastSeen';
--
-- Expect every existing row to have inherited `true` (n_false = 0):
--
-- SELECT COUNT(*) AS n_rows,
--        COUNT(*) FILTER (WHERE "shareLastSeen" IS NOT TRUE) AS n_false
--   FROM "app_quikchat"."QcUserPresence";
--
-- Full column list, to confirm nothing else moved (expect 9 rows):
--
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'app_quikchat'
--    AND table_name   = 'QcUserPresence'
--  ORDER BY ordinal_position;
-- ============================================================================
