# MCP server security — no-delete guardrail (QUIKTR-118)

The QuikTrack MCP server (`apps/quiktrack/lib/mcp/server.ts`, mounted at
`apps/quiktrack/app/api/mcp/route.ts`) must never be able to delete any
QuikTrack data, under any circumstance, for any caller. MCP tools are driven
by AI agents and external clients; deletion is irreversible and
high-blast-radius, so destructive actions must be structurally unreachable
through the MCP surface — not just avoided by convention.

This is enforced in three layers, per the ticket's defense-in-depth
requirement.

## Layer 1 — No delete-capable tools

Every one of the 25 registered tools (`list_projects`, `get_issue`,
`get_project`, `list_custom_fields`, `list_issue_types`,
`get_create_field_metadata`, `list_link_types`, `get_member`,
`search_users`, `create_issue`, `list_comments`, `list_transitions`,
`start_sprint`, `move_issue`, `add_worklog`, `list_worklogs`,
`create_sprint`, `add_comment`, `complete_sprint`, `search_issues`,
`link_issues`, `list_issue_links`, `quiktrack_update_issue`,
`list_remote_links`, `add_remote_link`) was audited by tracing every Prisma
call each one makes, directly and through the service helpers it calls.
**None call `.delete()`, `.deleteMany()`, or raw SQL.**

Two tools worth calling out specifically, since they sound the most
delete-adjacent:

- **`complete_sprint`** only nulls `sprintId` on non-done issues (moving
  them to the backlog) and updates the sprint's own `status` to
  `"COMPLETED"`. It never deletes the sprint row or any issue.
- **`move_issue`** / **`quiktrack_update_issue`** only ever call
  `.update(...)` inside their transactions.

**One reviewed exception, not a gap**: `apps/quiktrack/lib/services/customFieldValues.ts`'s
`writeIssueValues` (reachable from `quiktrack_update_issue` when the caller
passes `customFields`) does `qtIssueFieldValue.deleteMany({ where: { orgId,
issueId, fieldId } })` as part of replacing a custom field's stored value.
This deletes zero primary entities and zero user-authored content — it's the
delete-old-row/insert-new-row mechanic of "update a field's value," not a
destructive operation in the sense this guardrail targets. It isn't covered
by the layer-3 guard below because doing so would mean changing a shared
service function also used by the REST PATCH route, for a false positive.

Going forward, no MCP tool may ever call `.delete()`/`.deleteMany()`
directly. If a legitimate "remove" is ever needed (unlinking two issues,
detaching a remote link), it must be a reviewed, explicitly-scoped
soft-delete/relationship-removal — never a hard delete of a primary entity.
(QUIKTR-113's worklog tool and QUIKTR-116's `link_issues` both explicitly
deferred edit/delete for exactly this reason — see their ticket notes.)

This is checked automatically by
`apps/quiktrack/__tests__/unit/mcp-tool-source-audit.test.ts`, which fails
CI if a future edit ever introduces a delete/raw-SQL call into
`lib/mcp/server.ts`.

## Layer 2 — Database-level enforcement (documented only, not yet applied)

**Status: not applied.** This requires infrastructure work against the real
managed Postgres instance (Neon in UAT/production) that application code in
this repo can't apply or verify on its own — it's the integration owner's
action, not something to attempt from this branch.

**Full runbook**: `docs/mcp-db-role-setup.md` — exact SQL (role creation,
per-schema grants/revokes), the connection-string/env-var convention, and
verification steps to run before considering this layer live.

Today, every app in this monorepo — every REST route and the MCP route
alike — connects through **one** Postgres role via a single `DATABASE_URL`
(`packages/database/index.ts`). Revoking `DELETE`/`TRUNCATE` on that role
would break roughly 29 legitimate hard-delete call sites elsewhere in the
app that are unrelated to MCP: org/project role and permission management,
workflow/board-column editing, report-view deletion, issue-link removal,
the ideas module, and GitHub-integration cleanup, among others.

What would need to happen before this layer can be applied:

1. A new, separate Postgres role (e.g. `quiktrack_mcp_role`) scoped to the
   schemas the MCP server reads/writes.
2. `GRANT SELECT, INSERT, UPDATE` — explicitly **no** `DELETE`, no
   `TRUNCATE` — on that role.
3. A second `DATABASE_URL` (using that role's credentials) and a second
   `PrismaClient` instance wired specifically into the MCP route, separate
   from the shared `@quikit/database` client every other route uses.

Until this exists, layer 3 (below) is the enforced, tested guarantee for
this repo's code; layer 2 remains a tracked follow-up.

## Layer 3 — Service-layer guard

`apps/quiktrack/lib/mcp/guardedDb.ts` exports `mcpDb`: the shared `db`
client wrapped in a hand-rolled JS `Proxy` that throws
`McpDeleteGuardrailError` before any `.delete()`/`.deleteMany()` reaches the
database, on **every** model. `lib/mcp/server.ts` imports this in place of
the raw `db`:

```ts
import { mcpDb as db } from "@/lib/mcp/guardedDb";
```

Every existing `db.xxx.yyy(...)` call in that file is unchanged
syntactically — they all now run through the guarded client. `$transaction`
is special-cased so the `tx` handed to an interactive-transaction callback
is guarded too (the tx client isn't `mcpDb` itself, it's whatever
`db.$transaction` constructs internally, so it's wrapped on the way in) —
this covers `move_issue`/`quiktrack_update_issue`/`complete_sprint`'s
transactional writes with no other special-casing needed.

This is a plain Proxy rather than a Prisma Client Extension (`$extends`):
this repo's test harness (`apps/quiktrack/__tests__/helpers/mockDb.ts`)
deep-mocks `PrismaClient` with `vitest-mock-extended`, which does not
implement `$extends` semantics — calling it on the mock silently returns
another mock rather than an extended client, breaking every query in tests.
A Proxy works identically over a real Prisma client or the deep-mocked test
client, since it only relies on standard JS property access.

If a future tool (or a bug, or a modified tool) ever calls `.delete()` or
`.deleteMany()` through this client, it throws immediately with a clear,
named error — the MCP SDK converts this into a normal `isError` tool result
or JSON-RPC error, never an uncaught 500.

Tested directly in `apps/quiktrack/__tests__/unit/mcp-no-delete-guardrail.test.ts`
(`mcpDb.qtIssue.delete(...)`/`.deleteMany(...)` throw synchronously;
reads/creates/updates are unaffected) and end-to-end in
`apps/quiktrack/__tests__/api/mcp.test.ts` (a plausible-but-nonexistent
destructive tool name like `"delete_issue"` is unreachable via the real
`/api/mcp` route).

## Checklist for adding a new MCP tool

- Never call `.delete()` or `.deleteMany()` directly, or via a helper that
  does — the layer-3 guard will throw, and the layer-1 static test will
  fail CI before that ships.
- If you need a "remove" semantic, make it a reviewed, explicitly-scoped
  soft-delete or relationship-removal (flip a flag, null a foreign key,
  delete a join row that represents a *relationship* rather than a primary
  entity) — never a hard delete of an issue, comment, sprint, project,
  attachment, or user/member record.
- Add the new tool to the audit list at the top of this document.
