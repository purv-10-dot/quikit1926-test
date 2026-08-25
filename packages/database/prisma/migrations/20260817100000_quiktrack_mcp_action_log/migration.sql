-- QuikTrack: QUIKTR-121 MCP action audit log.
--
-- One row per MUTATING MCP tool invocation (create/update/move), written
-- by apps/quiktrack/lib/mcp/server.ts via lib/mcp/actionLog.ts's
-- logMcpAction(). Distinct from QtMcpAccessLog (QUIKTR-119), which logs
-- permission gate decisions (allow/deny) only, not entity/payload/diff
-- data. See docs/mcp-action-log-schema.md for the full rationale,
-- including the "reads stay on QtMcpAccessLog only" scope decision.
--
-- Idempotent so it is safe to apply to the shared UAT/prod Neon DB by hand
-- (the build pipeline does not run `migrate deploy`). Not applied to any
-- real database from this repo — the integration owner applies this, same
-- as QUIKTR-118/119's migrations.

CREATE TABLE IF NOT EXISTS app_quiktrack."QtMcpActionLog" (
  id            text PRIMARY KEY,
  "orgId"       text NOT NULL,
  "userId"      text NOT NULL,
  "actorType"   text NOT NULL,
  source        text NOT NULL DEFAULT 'mcp',
  "projectId"   text,
  tool          text NOT NULL,
  action        text NOT NULL,
  "entityType"  text NOT NULL,
  "entityId"    text,
  "entityKey"   text,
  payload       jsonb,
  before        jsonb,
  after         jsonb,
  result        text NOT NULL,
  "errorMessage" text,
  "createdAt"   timestamp(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "QtMcpActionLog_orgId_createdAt_idx"
  ON app_quiktrack."QtMcpActionLog" ("orgId", "createdAt");

CREATE INDEX IF NOT EXISTS "QtMcpActionLog_userId_createdAt_idx"
  ON app_quiktrack."QtMcpActionLog" ("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "QtMcpActionLog_projectId_createdAt_idx"
  ON app_quiktrack."QtMcpActionLog" ("projectId", "createdAt");

CREATE INDEX IF NOT EXISTS "QtMcpActionLog_entityType_entityId_idx"
  ON app_quiktrack."QtMcpActionLog" ("entityType", "entityId");
