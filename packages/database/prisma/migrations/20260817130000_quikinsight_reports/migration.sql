-- QuikInsight: saved reports.
--
-- A QiReport is a first-class document (brand, range, channel mix, recipients),
-- unlike QiEmailReportSettings which is the single legacy per-user schedule the
-- crons read. Both exist for now; wiring the crons to these rows is a follow-up.
--
-- Idempotent so it is safe to re-run against an environment that already has it.

CREATE TABLE IF NOT EXISTS app_quikinsight."QiReport" (
  "id"            TEXT NOT NULL,
  "orgId"         TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "type"          TEXT NOT NULL DEFAULT 'executive',
  "workspaceId"   TEXT,
  "dateRange"     TEXT NOT NULL DEFAULT '30',
  "channels"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "audience"      TEXT NOT NULL DEFAULT 'internal',
  "customSummary" TEXT,
  "customMetrics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "recipients"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "frequency"     TEXT NOT NULL DEFAULT 'none',
  "status"        TEXT NOT NULL DEFAULT 'Ready',
  "lastSentAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QiReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "QiReport_orgId_idx"           ON app_quikinsight."QiReport" ("orgId");
CREATE INDEX IF NOT EXISTS "QiReport_orgId_createdAt_idx" ON app_quikinsight."QiReport" ("orgId", "createdAt");
