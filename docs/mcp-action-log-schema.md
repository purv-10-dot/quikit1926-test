# Schema change for QUIKTR-121 — MCP action audit log

**Status: schema + application wiring both included in this PR**, unlike
QUIKTR-119's schema-only first pass — the model and its `logMcpAction()`
call sites are small enough to review together. Per this app's rule ("Add
Prisma models — but discuss the schema with the integration owner first"),
the model addition below still needs the integration owner's sign-off
before its migration is applied to any real database.

## New model: `QtMcpActionLog`

Added to `packages/database/prisma/schema.prisma`, right after
`QtMcpAccessLog` (QUIKTR-119):

```prisma
model QtMcpActionLog {
  id           String   @id @default(cuid())
  orgId        String
  userId       String
  actorType    String
  source       String   @default("mcp")
  projectId    String?
  tool         String
  action       String
  entityType   String
  entityId     String?
  entityKey    String?
  payload      Json?
  before       Json?
  after        Json?
  result       String
  errorMessage String?
  createdAt    DateTime @default(now())

  @@index([orgId, createdAt])
  @@index([userId, createdAt])
  @@index([projectId, createdAt])
  @@index([entityType, entityId])
  @@schema("app_quiktrack")
}
```

## Why a new table, not an extension of `QtMcpAccessLog`

`QtMcpAccessLog` (QUIKTR-119) logs **permission gate decisions** — it fires
from `checkProjectMembership`/`checkWritePermission`, once or twice per
tool call, before the tool's own work runs, and carries only
`tool`/`resource`/`action`/`decision`/`reason`. `QtMcpActionLog` logs
**actions** — it fires exactly once per mutating tool invocation, from
inside the tool handler after the gates pass, with the actual entity,
request payload, before/after diff, and outcome. Overloading one table with
both would force every access-log row (the much higher-volume of the two,
since it also covers every read) to carry nullable `entityId`/`payload`/
`before`/`after` columns it never uses, and would make "exactly one row per
mutating call" — an explicit acceptance criterion — hard to verify against
a table that can legitimately hold two rows per call for unrelated reasons.

## Scope decision: mutations only, reads stay on `QtMcpAccessLog`

QUIKTR-121's acceptance criteria ask for either full read-tool coverage or
"an explicitly documented decision" to exclude them. This implementation
takes the latter: **only the 10 mutating MCP tools write to
`QtMcpActionLog`.** The 15 read-only tools remain covered exclusively by
the existing `QtMcpAccessLog`, which already logs every read call's
allow/deny decision, actor, tool name, and timestamp.

Reasoning: read tools have no before/after state by definition (a lookup
isn't a diff), so the only fields a read-tool `QtMcpActionLog` row would
add beyond what `QtMcpAccessLog` already has are `payload` (the query args,
already implicit in `resource`/`action` for writes but never populated for
reads today) and a `result` that's redundant with `decision`. Read tools
are also called far more often than write tools in typical agent usage, so
full coverage would meaningfully increase write volume for content the
ticket doesn't require detailed diffs on. If this decision needs to be
revisited (e.g. a future compliance requirement demands read coverage too),
extending `QtMcpActionLog` to `action: "READ"` rows is a small, additive
change — `entityId`/`before`/`after` would simply stay null.

## Field-by-field

| Field | Purpose |
|---|---|
| `orgId` / `userId` | Who made the call. Same no-FK convention as `QtMcpAccessLog` and every other `Qt*` table. |
| `actorType` | `"user"` \| `"agent"` — always `"agent"` for MCP calls today (mirrors `QtIssueHistory`/`QtIssueComment`'s existing convention), kept generic for a hypothetical future non-MCP caller. |
| `source` | `"mcp"` today, defaulted — reserved so a future non-MCP writer of this same table doesn't need a schema change. |
| `projectId` | The resolved project the mutation targeted. Nullable only for the theoretical case where a tool call somehow succeeds without one (none do today). |
| `tool` | The MCP tool name (`"create_issue"`, `"move_issue"`, etc.). |
| `action` | `"CREATE"` \| `"UPDATE"` \| `"MOVE"` \| `"DELETE"` (the last is unused today — no MCP tool deletes anything, per QUIKTR-118 — but kept in the enum for completeness/future-proofing). |
| `entityType` | `"issue"` \| `"sprint"` \| `"comment"` \| `"worklog"` \| `"remote_link"` \| `"issue_link"`. |
| `entityId` / `entityKey` | The affected record. `entityKey` is null for entity types without a human-readable key (sprint, comment, worklog, remote_link, issue_link). |
| `payload` | The tool's (sanitized — see `lib/mcp/actionLog.ts`'s `sanitize()`) input args. |
| `before` / `after` | Field-level snapshots. `before` is null for pure creates; `after` is null when `result = "error"` and the mutation never ran. |
| `result` / `errorMessage` | `"success"` \| `"error"`, with the error text when applicable — every failed write-tool call is logged, never silently dropped. |

## Migration file

`packages/database/prisma/migrations/20260817100000_quiktrack_mcp_action_log/migration.sql`
— hand-written, idempotent (`IF NOT EXISTS` throughout), same convention as
QUIKTR-119's migration: meant to be run by hand against the shared UAT/prod
Neon database, since this repo's build pipeline doesn't run `prisma migrate
deploy`. **Not applied to any real database from this repo** — the
integration owner applies it, same as QUIKTR-118/119.

## Application wiring

`apps/quiktrack/lib/mcp/actionLog.ts` exports `logMcpAction()`, called from
`apps/quiktrack/lib/mcp/server.ts` at every success and failure branch of
the 10 write tools (`create_issue`, `start_sprint`, `move_issue`,
`create_sprint`, `add_comment`, `add_worklog`, `complete_sprint`,
`quiktrack_update_issue`, `add_remote_link`, `link_issues`) — after
`checkWritePermission` passes, mirroring where `QtMcpAccessLog`'s own
"allow" row is written. A logging failure (e.g. the migration not yet
applied) never breaks the actual tool call — same never-throws pattern as
`accessLog.ts`.

Surfaced via `apps/quiktrack/app/api/mcp-audit-log/route.ts` in two places:
a project-level, admin/Space-Admin-gated "Audit Log" page under Settings,
and a per-issue "MCP Log" tab on the issue detail page (gated by ordinary
project membership, like the existing Comments/History tabs, since it's
just that one entity's own action history).
