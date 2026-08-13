# MCP database role setup — QUIKTR-118 layer 2

**Audience:** whoever owns the managed Postgres instance (Neon in
UAT/production) — the integration owner, not app developers. This is a
runbook to execute against the real database; it is not applied by any
code in this repo or by CI.

**Companion doc:** `docs/mcp-security.md` — the full three-layer guardrail
write-up. This document is the detailed how-to for layer 2 specifically
("Database-level enforcement"), which that doc leaves as a documented,
not-yet-applied follow-up.

## Why this is needed

The QuikTrack MCP server (`apps/quiktrack/lib/mcp/server.ts`) is driven by
AI agents and external clients. Layer 3 (an application-level guard,
already implemented — see `apps/quiktrack/lib/mcp/guardedDb.ts`) blocks
delete calls in code, but that's a software guarantee: a bug or a future
code change could bypass it. Layer 2 makes deletion **impossible at the
database level**, independent of anything the application code does —
the real guarantee the ticket calls for.

## Current state

Every app in this monorepo — every REST route and the MCP route alike —
connects through **one** Postgres role via a single `DATABASE_URL`
(`packages/database/index.ts`). That role has full `DELETE`/`TRUNCATE`
privileges, because roughly 29 legitimate call sites elsewhere in the app
depend on them (org/project role and permission management, workflow and
board-column editing, report-view deletion, issue-link removal, the ideas
module, GitHub-integration cleanup, among others — none of them related to
MCP). **You cannot revoke `DELETE`/`TRUNCATE` on the existing shared role**
without breaking all of that. This is why a **separate, new** role scoped
specifically to MCP traffic is required, rather than modifying the
existing one.

## What MCP actually touches

Traced directly from every one of the 25 registered MCP tools and the
service helpers they call. Three schemas, with different privilege needs:

| Schema | Access needed | Why |
|---|---|---|
| `app_quiktrack` | `SELECT`, `INSERT`, `UPDATE` | All QuikTrack domain tables — issues, comments, worklogs, sprints, links, custom fields, PATs, permissions, etc. This is where every MCP write happens (`create_issue`, `add_comment`, `add_worklog`, `move_issue`, `link_issues`, and so on). |
| `quikit` | `SELECT` only | `Org`, `OrgMember`, `App` — read for tenant-admin / app-admin permission checks (`loadProjectAccess`, `userCanInProject`, `hasAdminAccess`). MCP never writes here. |
| `auth` | `SELECT` only | `User` — read for author/assignee/reporter profile lookups (e.g. `add_comment` resolving the commenter's name). MCP never writes here. |

No other schema is touched by any MCP tool.

## SQL to run

Adjust the role name/password to your actual secrets-management convention
before running. Run this against the real database (Neon UAT first, then
production once verified) — **not** through a Prisma migration, since this
is a role/privilege change, not a schema change, and shouldn't be
version-controlled as a `migration.sql` that `prisma migrate` could ever
attempt to replay.

```sql
-- 1. Create the role. Use a generated, secrets-managed password —
--    never commit the real value anywhere.
CREATE ROLE quiktrack_mcp_role LOGIN PASSWORD '<set-via-secrets-manager>';

-- 2. app_quiktrack: read + non-destructive write, explicitly no delete/truncate.
GRANT USAGE ON SCHEMA app_quiktrack TO quiktrack_mcp_role;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA app_quiktrack TO quiktrack_mcp_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app_quiktrack TO quiktrack_mcp_role;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA app_quiktrack FROM quiktrack_mcp_role;

-- 3. quikit and auth: read-only, no write/delete of any kind.
GRANT USAGE ON SCHEMA quikit TO quiktrack_mcp_role;
GRANT SELECT ON ALL TABLES IN SCHEMA quikit TO quiktrack_mcp_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA quikit FROM quiktrack_mcp_role;

GRANT USAGE ON SCHEMA auth TO quiktrack_mcp_role;
GRANT SELECT ON ALL TABLES IN SCHEMA auth TO quiktrack_mcp_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA auth FROM quiktrack_mcp_role;

-- 4. Make the grants apply automatically to any FUTURE table added to
--    these schemas (new Prisma models), so a forgotten re-grant after a
--    migration doesn't silently leave a table inaccessible to MCP (or,
--    worse, silently re-open DELETE via a default-privilege gap). Run
--    this as whichever role normally creates tables (the migration role).
ALTER DEFAULT PRIVILEGES IN SCHEMA app_quiktrack GRANT SELECT, INSERT, UPDATE ON TABLES TO quiktrack_mcp_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA quikit GRANT SELECT ON TABLES TO quiktrack_mcp_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT ON TABLES TO quiktrack_mcp_role;
```

Notes:

- `REVOKE ... FROM quiktrack_mcp_role` after the broader `GRANT SELECT,
  INSERT, UPDATE` is intentional and explicit — Postgres's `GRANT ... ON
  ALL TABLES` never implies `DELETE`/`TRUNCATE` on its own, but the
  `REVOKE` lines are kept anyway so the privilege set is asserted
  positively rather than relying on "we just never granted it."
- If this Postgres instance is behind a connection pooler in transaction
  mode (the comment in `packages/database/index.ts` describes exactly this
  setup — `DATABASE_URL` → pooler, `DATABASE_URL_DIRECT` → bypasses it for
  migrations), confirm the new role is permitted through the pooler the
  same way the existing app role is; poolers sometimes gate which roles
  may connect through them separately from Postgres-level GRANTs.

## Connection string / env var

Once the role exists, a new connection string is needed:

```
MCP_DATABASE_URL="postgresql://quiktrack_mcp_role:<password>@<pooler-host>/<db>?<same-pooler-params-as-DATABASE_URL>"
```

This should point at the **pooled** endpoint (the same one `DATABASE_URL`
uses today), not the direct one (`DATABASE_URL_DIRECT` is for migrations
only). Add it to whatever secrets store feeds this app's `DATABASE_URL`
today (UAT and production separately), alongside the existing variable —
don't replace `DATABASE_URL`, since every other route in the app still
needs the original role.

## Verification (run this before telling anyone it's live)

Confirm reads/writes still work and deletes are actually rejected, using
the new role's own credentials directly (not through the app):

```bash
# Should succeed (read):
psql "$MCP_DATABASE_URL" -c 'SELECT id FROM app_quiktrack."QtIssue" LIMIT 1;'

# Should succeed (non-destructive write) — use a real project/status id,
# then clean up with an UPDATE back, not a DELETE:
psql "$MCP_DATABASE_URL" -c 'UPDATE app_quiktrack."QtIssue" SET title = title WHERE id = '\''<some-issue-id>'\'';'

# Should FAIL with "permission denied for table QtIssue":
psql "$MCP_DATABASE_URL" -c 'DELETE FROM app_quiktrack."QtIssue" WHERE id = '\''<some-issue-id>'\'';'

# Should also FAIL:
psql "$MCP_DATABASE_URL" -c 'TRUNCATE app_quiktrack."QtIssue";'

# Cross-schema reads should succeed, writes should FAIL:
psql "$MCP_DATABASE_URL" -c 'SELECT id FROM quikit."Org" LIMIT 1;'
psql "$MCP_DATABASE_URL" -c 'UPDATE quikit."Org" SET name = name WHERE id = '\''<some-org-id>'\'';'
# ^ expect "permission denied for table Org"
```

If any of the "should FAIL" queries succeed, stop — the grants aren't
correctly scoped and MCP would still be able to delete data once wired up.

## What this document does NOT cover

Wiring the application code to actually use `MCP_DATABASE_URL` (a second
`PrismaClient` instance dedicated to the MCP route, replacing the shared
`@quikit/database` client only for `apps/quiktrack/app/api/mcp/route.ts`)
is a separate, follow-up change — deliberately not made yet. This document
only covers provisioning the role and connection string so that follow-up
becomes possible. Once this is done and verified, file a ticket for the
app-side wiring change and reference this document.
