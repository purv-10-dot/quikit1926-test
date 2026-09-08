-- =============================================================================
-- Raw SQL for the QiReportSnapshot table added in schema.prisma
-- (Phase 1 of the report comparison feature).
--
-- Scope: creates exactly one new table plus its FK/unique constraint and
-- index. Does not alter QiReport or any other existing table.
--
-- id uses no DB-side default (matches every other model in this schema —
-- Prisma's cuid() is generated client-side, not by Postgres), so any raw
-- INSERT against this table (outside Prisma) must supply its own id.
--
-- Idempotent (IF NOT EXISTS / DO blocks) — same convention as
-- migrations/20260817130000_quikinsight_reports/migration.sql (QiReport's own
-- original migration) — safe to re-run against an environment that already
-- has this table.
-- =============================================================================

CREATE TABLE IF NOT EXISTS app_quikinsight."QiReportSnapshot" (
    "id"           TEXT NOT NULL,
    "reportId"     TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "windowStart"  TIMESTAMP(3) NOT NULL,
    "windowEnd"    TIMESTAMP(3) NOT NULL,
    "data"         JSONB NOT NULL,
    "generatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QiReportSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "QiReportSnapshot_reportId_snapshotDate_key"
    ON app_quikinsight."QiReportSnapshot" ("reportId", "snapshotDate");

CREATE INDEX IF NOT EXISTS "QiReportSnapshot_reportId_idx"
    ON app_quikinsight."QiReportSnapshot" ("reportId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'QiReportSnapshot_reportId_fkey'
    ) THEN
        ALTER TABLE app_quikinsight."QiReportSnapshot"
            ADD CONSTRAINT "QiReportSnapshot_reportId_fkey"
            FOREIGN KEY ("reportId") REFERENCES app_quikinsight."QiReport"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ── Post-run verification ────────────────────────────────────────────────────
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'app_quikinsight' AND table_name = 'QiReportSnapshot'
-- ORDER BY ordinal_position;
