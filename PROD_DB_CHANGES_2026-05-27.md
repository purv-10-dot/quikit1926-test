# Production DB Migration — 2026-05-27

**Scope:** schema-level (DDL) changes made today to be applied to the production Neon database.
**Apps in scope:** QuikInfra, QuikTrack.
**Out of scope:** row-level data inserted in dev (test users, demo orgs, demo project rows, dev-only OAuth callback URIs). Do not copy any of that to production.

---

## Summary

| App | DDL changes today | Action for production |
|---|---|---|
| **QuikInfra** | Schema renamed: `app_quikconstruction` → `app_quikinfra` | Run the single `ALTER SCHEMA` below |
| **QuikTrack** | None | No DDL migration required |

The QuikInfra rename is **metadata-only** — every table, column, index, constraint, sequence, and FK inside the schema is preserved as-is. No row data is touched.

---

## QuikInfra — schema rename

### What changed

The Postgres schema that holds the construction/infrastructure ERP tables was renamed from `app_quikconstruction` to `app_quikinfra`. All 78 tables and their constituent objects (columns, PKs, FKs, indexes, defaults) inside that schema are unchanged structurally — only the enclosing schema namespace was renamed.

### Production migration

Run inside a single transaction (already atomic — `ALTER SCHEMA RENAME` is a metadata-only Postgres operation, no row rewrites):

```sql
-- Pre-check: confirm source exists and target doesn't (idempotency-safe).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'app_quikconstruction') THEN
    RAISE NOTICE 'Source schema app_quikconstruction not found — already renamed?';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'app_quikinfra') THEN
    RAISE EXCEPTION 'Target schema app_quikinfra already exists — aborting to avoid collision';
  END IF;
END $$;

-- Perform the rename.
ALTER SCHEMA app_quikconstruction RENAME TO app_quikinfra;

-- Verify post-state.
SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'app_quik%' ORDER BY schema_name;
SELECT count(*) AS table_count FROM information_schema.tables WHERE table_schema = 'app_quikinfra';
-- Expected: app_quikinfra in the schemas list, table_count matches your previous schema's count.
```

### Things to coordinate with this migration

The schema rename is breaking if code that references the old name is still deployed. Make sure the **same release** ships:

| Layer | Change |
|---|---|
| `apps/quikinfra/prisma/schema.prisma` | All `@@schema("app_quikconstruction")` directives → `@@schema("app_quikinfra")`; `datasource.schemas` list updated |
| `apps/quikinfra/src/**/*.ts` raw SQL | All `app_quikconstruction."<Table>"` literals → `app_quikinfra."<Table>"` |
| `packages/database/prisma/schema.prisma` (shared workspace client) | Same `@@schema` updates |
| `DATABASE_URL` | If your prod connection string pins `?schema=app_quikconstruction` or `search_path=app_quikconstruction`, update to `app_quikinfra`. If no schema is pinned, Prisma reads it from `schema.prisma` and no env change is needed. |
| `prisma generate` | Regenerate the client after the schema rename so the generated types target the new schema name. |

All of these were updated in the code today; the schema rename is the only DB-side action.

### Rollback

The rename is fully reversible:

```sql
ALTER SCHEMA app_quikinfra RENAME TO app_quikconstruction;
```

Do this **before** redeploying old code if you need to roll back.

---

## QuikTrack — no DDL changes today

No `CREATE TABLE`, `ALTER TABLE`, or `DROP TABLE` was issued against the `app_quiktrack` schema today. The QuikTrack work today was:

- OAuth callback URI updates on `quikit.OAuthClient` (a metadata row, not DDL).
- One `quikit.UserAppAccess` row added for a test user — **dev-only data, do not copy to prod**.

No production schema migration is needed for QuikTrack.

---

## What NOT to copy from dev

Explicitly excluded from this migration — these were created in dev for testing and should not be applied to production:

- Test users / dummy users in `auth."User"`, `app_quikinfra."User"`, `app_quikinfra."Demo_users"`.
- Dev orgs in `quikit."Org"` (e.g. `neworg123`) and their `OrgMember` / `OrgAppAccess` / `UserAppAccess` rows.
- Localhost callback URIs added to `quikit.OAuthClient.redirectUris` (e.g. `http://localhost:3002/api/auth/callback/quikit` for `admin`, `http://localhost:3003/...` for `quikscale`, `http://localhost:3004/...` for `quiktrack`, etc.). Production only needs the existing Vercel URLs.
- Empty `app_quikinfra` table re-creates that happened in dev only — dev's schema briefly held Cn-prefixed orphan tables which were dropped and replaced; production's `app_quikconstruction` already has the correct plain-named tables, so the rename alone is sufficient.

---

## Recommended deploy order

1. **Stop / pause** writes to `app_quikconstruction` in production (brief maintenance window — the rename itself is sub-second).
2. Run the `ALTER SCHEMA app_quikconstruction RENAME TO app_quikinfra;` statement.
3. **Deploy** the application release that contains the code-side updates (Prisma `@@schema`, raw SQL literals, regenerated Prisma client).
4. Confirm with the post-state SELECTs above.
5. Smoke-test: log into QuikInfra via the launcher → load dashboard → verify reads/writes against the renamed schema succeed.

If steps 2 and 3 land out of order, you'll briefly see one side referencing a non-existent schema name — either roll back the rename (SQL above) or hold the app at a maintenance page until both halves are in place.

---

## Verification checklist (post-deploy)

- [ ] `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'app_quik%';` returns `app_quikinfra` (not `app_quikconstruction`).
- [ ] `SELECT count(*) FROM information_schema.tables WHERE table_schema='app_quikinfra';` returns the same count it returned for `app_quikconstruction` pre-migration.
- [ ] A spot-checked tenant's row counts in `app_quikinfra."Companies"`, `app_quikinfra."Projects"`, `app_quikinfra."User"`, etc. match the previous values.
- [ ] App-side `GET /api/ready` returns `{ ok: true, status: "ready" }` with `schema.ok = true`.
- [ ] Launcher tile → QuikInfra → dashboard renders with the org's existing data.
