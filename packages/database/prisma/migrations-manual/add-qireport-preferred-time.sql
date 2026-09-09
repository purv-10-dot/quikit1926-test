-- =============================================================================
-- Raw SQL for QiReport.preferredHour / QiReport.timezone, added in
-- schema.prisma (best-effort preferred-send-time feature, see PHASE_LOG.md).
--
-- Scope: adds exactly two new NULLABLE columns to the existing QiReport
-- table. No default, no NOT NULL, no backfill — every existing row gets
-- NULL for both, which is precisely the "no preference, behave exactly as
-- before" state isDue() (lib/reports/scope.ts) expects. Does not touch any
-- other table, column, constraint, or index on QiReport.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS) — same convention as
-- create-qireportsnapshot.sql — safe to re-run against an environment that
-- already has these columns.
-- =============================================================================

ALTER TABLE app_quikinsight."QiReport"
    ADD COLUMN IF NOT EXISTS "preferredHour" INTEGER,
    ADD COLUMN IF NOT EXISTS "timezone" TEXT;

-- ── Post-run verification ────────────────────────────────────────────────────
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'app_quikinsight' AND table_name = 'QiReport'
--   AND column_name IN ('preferredHour', 'timezone');
--
-- Every existing row should show NULL for both new columns:
-- SELECT count(*) FROM app_quikinsight."QiReport"
-- WHERE "preferredHour" IS NOT NULL OR "timezone" IS NOT NULL;
-- -- expected: 0, immediately after running this migration
