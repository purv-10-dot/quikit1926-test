# QuikVC full-schema migration

This is the **first** migration that creates the entire `app_quikvc` schema. It captures Sprints 1-5b in one file:

- 28 tables (deals, applications, IC memos, votes, investors, commitments, capital calls, allocations, repayments, term sheets, sourcing, notifications, audit log, etc.)
- 59 indexes (tenant-scoped composite indexes for hot-path queries)
- 54 foreign-key constraints (tenant-cascade + investor-restrict + deal-cascade)

## Why one big migration?

Sprints 1-5b were developed locally with `prisma generate` only — no `prisma migrate` runs. Before this app reaches Neon dev / staging / production, the schema needs to be applied. Splitting into 5 sprint-sized migrations after the fact is more work than benefit; we ship as one file and start incremental migrations from here.

## How to apply

### Neon dev branch (first)

```bash
# 1. Set DATABASE_URL to the Neon dev branch
export DATABASE_URL="postgresql://..."

# 2. Apply
cd packages/database
npx prisma migrate deploy

# 3. Verify
npx prisma migrate status
# Should show: 1 migration found, applied successfully

# 4. Seed (optional but recommended for E2E)
npm run db:seed:quikvc
```

### Production (after smoke test passes on dev)

Same `migrate deploy` — no schema diff, just the same migration applied to the prod branch.

**Do not use `migrate dev`** — it expects a shadow database and may try to reset prod data if the schema/migration history disagree.

## Rollback

```sql
-- Drop the entire app_quikvc schema. NUKES ALL VC DATA.
DROP SCHEMA "app_quikvc" CASCADE;
```

Then `DELETE FROM "_prisma_migrations" WHERE migration_name = '20260428120000_quikvc_full_schema'` to clear the history. Only do this on dev / staging — never on prod with real data.

## Verification checklist after apply

```sql
-- 28 tables in app_quikvc
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'app_quikvc';
-- expect: 28

-- All FK constraints to public.Tenant in place
SELECT count(*) FROM information_schema.table_constraints
WHERE constraint_schema = 'app_quikvc' AND constraint_type = 'FOREIGN KEY';
-- expect: 54

-- Composite uniques exist
SELECT indexname FROM pg_indexes
WHERE schemaname = 'app_quikvc' AND indexname LIKE '%_key' LIMIT 5;
-- expect: at least 5 unique indexes
```

If any check fails, investigate before letting the app start writing data.
