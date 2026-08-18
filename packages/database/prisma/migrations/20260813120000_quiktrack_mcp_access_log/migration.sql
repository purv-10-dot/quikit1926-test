-- QuikTrack: QUIKTR-119 access-decision audit log.
--
-- One row per MCP access-control check (allow/deny), written by the MCP
-- server on every gate — not just denials — so a full request trail exists
-- for security review. See docs/mcp-access-log-schema.md for the full
-- rationale and the application-side wiring this table is proposed for.
--
-- PROPOSED, NOT YET WIRED IN: apps/quiktrack/lib/mcp/server.ts does not
-- write to this table yet. Adding this table is safe/no-op on its own
-- (nothing reads or writes it until that follow-up lands) — it's included
-- now so the schema change itself can be reviewed independently of the
-- application code that will use it.
--
-- Idempotent so it is safe to apply to the shared UAT/prod Neon DB by hand
-- (the build pipeline does not run `migrate deploy`).

CREATE TABLE IF NOT EXISTS app_quiktrack."QtMcpAccessLog" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL,
  "userId"    text NOT NULL,
  "projectId" text,
  tool        text NOT NULL,
  resource    text,
  action      text,
  decision    text NOT NULL,
  reason      text,
  "createdAt" timestamp(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "QtMcpAccessLog_orgId_createdAt_idx"
  ON app_quiktrack."QtMcpAccessLog" ("orgId", "createdAt");

CREATE INDEX IF NOT EXISTS "QtMcpAccessLog_userId_createdAt_idx"
  ON app_quiktrack."QtMcpAccessLog" ("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "QtMcpAccessLog_projectId_idx"
  ON app_quiktrack."QtMcpAccessLog" ("projectId");
