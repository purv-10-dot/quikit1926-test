# Schema changes for QUIKTR-118 and QUIKTR-119

**Status: proposed, not yet wired into application code.** Per this app's
own rule ("Add Prisma models — but discuss the schema with the integration
owner first"), this is written as a reviewable proposal, not something
silently applied. Nothing in `apps/quiktrack/lib/mcp/server.ts` writes to
the new table yet — that's a deliberate follow-up, kept separate so the
schema change itself can be reviewed on its own.

## QUIKTR-118 (no-delete guardrail): no schema change

Layers 1 (no delete-capable tools) and 3 (the `guardedDb` Proxy) are pure
application code — see `docs/mcp-security.md`. Layer 2 (the database-role
lockdown) is a Postgres **role/privilege** change (`CREATE ROLE`, `GRANT`,
`REVOKE`) — see `docs/mcp-db-role-setup.md` for the exact SQL. That's not a
schema change in the Prisma sense (no table is added or altered), so there
is **no migration for QUIKTR-118**.

## QUIKTR-119 (access control): one new table

The only piece of QUIKTR-119 that needs a schema change is the "log access
decisions (allow/deny) with the acting user for audit" requirement. Nothing
else in that ticket needs one — the actual project/role scoping already
runs entirely on existing tables (`QtProjectMember`, `QtProjectUserRole`,
`QtProjectRolePermission`, etc.), confirmed during the earlier audit of all
25 MCP tools.

### New model: `QtMcpAccessLog`

Added to `packages/database/prisma/schema.prisma`, right after
`QtPersonalAccessToken`:

```prisma
model QtMcpAccessLog {
  id        String   @id @default(cuid())
  orgId     String
  userId    String
  projectId String?
  tool      String
  resource  String?
  action    String?
  decision  String
  reason    String?
  createdAt DateTime @default(now())

  @@index([orgId, createdAt])
  @@index([userId, createdAt])
  @@index([projectId])
  @@schema("app_quiktrack")
}
```

**Field-by-field:**

| Field | Purpose |
|---|---|
| `orgId` / `userId` | Who made the call. No Prisma relation to `Org`/`User` — matches the existing convention on `QtPersonalAccessToken` and every other `Qt*` table (raw id + index, resolved via app-level joins, not a cross-schema FK). |
| `projectId` | Which project the call targeted. Nullable — a user-scoped token calling a tool without a `projectId` argument fails before a project is even resolved; that failure is still worth logging. |
| `tool` | The MCP tool name (`"create_issue"`, `"search_issues"`, etc.). |
| `resource` / `action` | The `(resource, action)` pair checked via `userCanInProject` for write tools (e.g. `"Issue"`, `"create"`). Null for read tools, which today only gate on project membership, not a specific action. |
| `decision` | `"allow"` or `"deny"`. |
| `reason` | A short, human-readable reason (`"not a project member"`, `"lacks Issue:create"`, `"ok"`) — enough to read the log without cross-referencing code. |
| `createdAt` | When. |

**Design choices worth flagging for review:**

- **No foreign keys.** `projectId` isn't a hard FK to `QtProject`. This is
  deliberate: `app/api/cron/purge-trashed-projects/route.ts` hard-deletes
  `QtProject` rows on a retention cron, and an audit log should survive
  that (you still want to know "the MCP server was asked to touch project
  X" even after X is gone) rather than either blocking the purge or being
  cascade-deleted along with it.
- **Logs every decision, not just denials.** The ticket asks for an audit
  trail; a log that only records denials can't answer "did this even run a
  check" for an allowed call. Storage growth is the tradeoff — no retention
  policy is proposed here, matching the fact that this app doesn't have one
  for its comparable tables (`QtIssueHistory`, `QtIssueTransitionLog`)
  either.
- **`resource`/`action` typed as plain `String`**, matching
  `QtProjectRolePermission`'s existing columns of the same name — not a
  new enum, so this stays trivially in sync with whatever resource/action
  pairs `lib/api/permissions.ts` already defines.

### Migration file

`packages/database/prisma/migrations/20260813120000_quiktrack_mcp_access_log/migration.sql`
— hand-written to match this repo's existing convention (see e.g. the
`..._quiktrack_board_settings` migration): idempotent (`IF NOT EXISTS`
throughout), meant to be run by hand against the shared UAT/prod Neon
database, since this repo's build pipeline doesn't run `prisma migrate
deploy`.

```sql
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
```

Validated with `npx prisma validate` (schema parses correctly). **Not run
against any real database from this session** — applying it is the same
category of action as the QUIKTR-118 DB-role SQL: something for whoever
owns the shared Neon instance to run, once the model itself is approved.

### What's still needed after this lands

This table being created doesn't do anything by itself. The follow-up
(not included here, kept separate on purpose) is a small `logAccessDecision(...)`
call added at each of the existing gate checks in
`apps/quiktrack/lib/mcp/server.ts` (`loadProjectAccess` / `userCanInProject`
call sites), writing one row per decision. That's pure application code —
no further schema change needed once this table exists.
