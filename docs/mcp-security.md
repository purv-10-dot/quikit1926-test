# MCP server security — no-delete guardrail (QUIKTR-118) & access control (QUIKTR-119)

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
- Gate every new tool through `checkProjectMembership` (reads) and, for
  writes, `checkWritePermission` too (see the QUIKTR-119 section below) —
  don't call `loadProjectAccess`/`userCanInProject` directly, or the tool
  won't get an audit-log entry.
- If the new tool takes a `projectId` or `issueId` argument, don't look it
  up by a raw `id` filter alone — resolve it via `checkProjectMembership`'s
  resolved `access.projectId` (for a project) or `resolveIssueIdOrKey()`
  (`lib/mcp/resolveIssue.ts`, for an issue) first, so it also accepts the
  human-readable key (e.g. `"QUIKTR"` / `"QUIKTR-119"`), not just the cuid.

# Access control (QUIKTR-119)

The MCP server enforces the **authenticated caller's own QuikTrack
permissions** on every request — a user can only see and act on the
projects and data they already have access to in QuikTrack itself. This
was largely already true by construction (every tool already resolved a
project and checked membership before touching data), but this ticket:
(1) closed two real cross-project disclosure gaps found during audit,
(2) added an audit-decision log, and (3) documents the actual permission
precedence model, since the ticket's framing of it didn't match reality.

## What was already correct (confirmed by audit, not changed)

Every one of the 25 tools resolves a `projectId` and checks the caller's
membership in it (`loadProjectAccess`) before returning or mutating any
data; all 10 write tools additionally check a specific `(resource, action)`
grant (`userCanInProject`). `list_projects` already scopes to the caller's
own project memberships for a non-admin caller (an org/app admin correctly
sees every project — that's their role, not a bypass). None of this needed
to change; see `apps/quiktrack/lib/mcp/server.ts`'s `checkProjectMembership`
/ `checkWritePermission` helpers, which every tool now routes through.

## Two disclosure gaps closed

1. **`link_issues`** only checked project access for the *outward* issue.
   The *inward* issue's own project was never access-checked, so a caller
   could confirm an issue id exists in a project they aren't a member of
   just by attempting to link to it. Fixed: the inward issue's project now
   goes through the same `checkProjectMembership` gate.
2. **`get_issue` / `list_issue_links`** (via the shared `loadIssueLinks`
   helper) could surface a linked issue's key/title/status even when that
   issue lived in a project the caller can't see (cross-project links are
   an intentional feature — see QUIKTR-116). Fixed: `loadIssueLinks` now
   filters out any linked issue whose own project the caller doesn't have
   access to, rather than exposing it.

## Permission precedence — documented as implemented, not changed

The ticket describes "project-level grants refine org-level defaults;
most-restrictive wins unless an explicit higher grant exists." **That is
not what `userCanInProject` (`apps/quiktrack/lib/api/permissions.ts`)
actually does, and this was a deliberate choice not to change it**: it's a
core, repo-wide RBAC function used by REST routes too, not something to
redefine as a side effect of an MCP-specific ticket. The actual, documented
behavior:

1. **App-admin bypasses everything.** A restrictive project role can never
   lock an admin out.
2. **A project-specific role, if assigned, is the entire story.** It does
   **not** merge with the caller's org-wide role — the org-wide role isn't
   consulted at all once a project role exists. This is intentional (see
   the comment at `permissions.ts`'s `userCanInProject`): it lets revoking
   a permission at the project level genuinely deny it, even when the
   org-wide role would otherwise grant it.
3. **No project role assigned** → the org-wide role's grants apply.

MCP enforces exactly this — the same `userCanInProject` call REST routes
use — so the MCP surface and the web app can never disagree about what a
given user is allowed to do.

## Audit log

Every `checkProjectMembership` / `checkWritePermission` decision — allow
**and** deny, not just denials — is written to `QtMcpAccessLog`
(`apps/quiktrack/lib/mcp/accessLog.ts`, schema proposed in
`docs/mcp-access-log-schema.md`): who, which org/project, which tool,
which `(resource, action)` for write tools, and a short human-readable
reason. A logging failure (e.g. the migration not yet applied) never
breaks the actual tool call — it falls back to a structured console line.

## Tests

- `apps/quiktrack/__tests__/unit/mcp-access-log.test.ts` — `logAccessDecision`
  writes the right fields and never throws.
- `apps/quiktrack/__tests__/api/mcp.test.ts`, `describe("QUIKTR-119 — access
  decision audit log")` — allow/deny logging end-to-end, and a role-ladder
  case proving a project role that actually holds the `Issue:create` grant
  succeeds (not just the org-admin bypass every other permission test uses).
- `describe("QUIKTR-119 — cross-project leakage fixes")` — both disclosure
  fixes above, verified directly.
- `describe("list_projects")` (already existing) — a non-admin's user-scoped
  token returns only their own project memberships, not every org project.
