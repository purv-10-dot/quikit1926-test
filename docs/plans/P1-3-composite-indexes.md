---
id: P1-3
title: Composite indexes for hot multi-column queries
wave: 2
priority: P1
status: Draft
owner: unassigned
created: 2026-04-17
updated: 2026-04-17
targets: [packages/database]
depends_on: [P0-1]
---

# P1-3 — Composite indexes for hot multi-column queries

> **TL;DR** — Three models have composite WHERE clauses that currently hit only single-column indexes, forcing Postgres into index-filter-then-scan. Adding three composite indexes turns those into index-only lookups. Low risk, measurable latency win. The migration must use `CREATE INDEX CONCURRENTLY` to avoid write locks on the affected tables; Prisma doesn't emit this automatically so we write the migration SQL by hand.

---

## 1. Context

### 1.1 Evidence

The audit (`docs/architecture/10k-users-iaas-rollout.md` §2) flagged four missing composites. On closer inspection one of them (`TalentAssessment`) already has equivalent coverage via the `@@unique([tenantId, userId, quarter, year])` constraint (unique = index). So the real list is three:

| Table | Current indexes | Missing composite | Why |
|---|---|---|---|
| `Notification` | `(tenantId)`, `(userId)`, `(read)` | `(tenantId, userId, read)` | Inbox query `WHERE tenantId=? AND userId=? AND read=false` today hits either the `userId` or `read` index, filters in memory. At 10K-100K notifications per tenant this is a full-tenant scan. |
| `PerformanceReview` | `(tenantId)`, `(revieweeId)` | `(tenantId, revieweeId, year, quarter)` | Per-reviewee quarterly history / aggregations. Today: tenant-scoped index + revieweeId filter. Better: direct tuple hit. |
| `HabitAssessment` | `(tenantId)`, `(quarter, year)`, `(assessmentDate)` | `(tenantId, quarter, year)` | Dashboard widget "habit score this quarter" — `(quarter, year)` index exists but has no leading `tenantId`, so cross-tenant rows are scanned and filtered. |

`TalentAssessment` already has `@@unique([tenantId, userId, quarter, year])` which covers `(tenantId)` and `(tenantId, userId)` as left-prefixes. Not on this list.

### 1.2 Why now

- **Depends on P0-1.** We want the connection pool in place before we move more load to the DB.
- **Biggest one — Notification inbox.** The inbox-unread count is called on every dashboard page load. At 1 000 CCU with average 50 notifications per user that's ~1K scan rows / second, cheap today; as notifications accumulate (tens of thousands per tenant after a year) it becomes noticeable.
- **Cheap to add, cheap to revert.** Indexes are fire-and-forget in Postgres if added `CONCURRENTLY`.

---

## 2. Goal / Non-goals

**Goal.** The three flagged queries hit composite indexes directly (verified via `EXPLAIN ANALYZE`). No table write-locks during the migration. Rollback is a single `DROP INDEX`.

**Non-goals.**
- Not rewriting any query code. Prisma chooses indexes automatically; we're adding what the planner wants.
- Not tuning other tables. Each index added has a write cost; don't sprinkle them.
- Not dropping any existing indexes. If one becomes redundant in future, address it separately.

---

## 3. Options considered

### Option A — Prisma-generated migration with `CREATE INDEX` (non-concurrent)
Run `npx prisma migrate dev --name add_hot_path_indexes` and let Prisma write the SQL.

- ✅ Zero hand-written SQL.
- ❌ Takes an `ACCESS EXCLUSIVE` lock on the table for the duration of the index build. On Notification (growing rapidly), a lock is bad.
- **Rejected** for prod; fine for dev-only migrations.

### Option B — Hand-written migration with `CREATE INDEX CONCURRENTLY` (RECOMMENDED)
Add the `@@index` lines to `schema.prisma` (for type-safety + future-generated migrations). Write the actual migration SQL manually with `CONCURRENTLY`. Mark the migration as already applied in dev to keep the history clean.

- ✅ No write lock; prod is unaffected during the build.
- ⚠ Requires us to write the migration file ourselves and ensure Prisma's migration runner doesn't re-apply.
- ⚠ `CREATE INDEX CONCURRENTLY` cannot run inside a transaction.

### Option C — Apply indexes via Prisma Studio or manual `psql`, skip migration file
- ❌ Undocumented; breaks the "schema is the source of truth" invariant.
- **Rejected.**

**Chosen: Option B.**

---

## 4. Design

### 4.1 Schema changes

**File:** `packages/database/prisma/schema.prisma`

```prisma
model Notification {
  // …existing fields…
  @@index([tenantId])
  @@index([userId])
  @@index([read])
  @@index([tenantId, userId, read])   // NEW — inbox-unread query
}

model PerformanceReview {
  // …existing fields…
  @@index([tenantId])
  @@index([revieweeId])
  @@index([tenantId, revieweeId, year, quarter])  // NEW — per-reviewee history
}

model HabitAssessment {
  // …existing fields…
  @@index([tenantId])
  @@index([quarter, year])
  @@index([assessmentDate])
  @@index([tenantId, quarter, year])  // NEW — per-tenant quarterly dashboard
}
```

### 4.2 Hand-written migration SQL

**File:** `packages/database/prisma/migrations/YYYYMMDDHHMMSS_add_hot_path_indexes/migration.sql`

The timestamp in the folder name follows Prisma's convention; we pick one at generation time.

```sql
-- CONCURRENTLY avoids an ACCESS EXCLUSIVE lock on the table during the index
-- build. Required here because Notification is on the hot write path and
-- locking it even briefly causes customer-visible 5xx's. See
-- docs/plans/P1-3-composite-indexes.md.
--
-- NOTE: Prisma migrations run each statement in its own transaction per
-- migration file. CONCURRENTLY cannot run inside a transaction, so each
-- statement here MUST stand alone. We check `prisma migrate status`
-- post-run to confirm the migration was recorded.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Notification_tenantId_userId_read_idx"
  ON "Notification" ("tenantId", "userId", "read");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "PerformanceReview_tenantId_revieweeId_year_quarter_idx"
  ON "PerformanceReview" ("tenantId", "revieweeId", "year", "quarter");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "HabitAssessment_tenantId_quarter_year_idx"
  ON "HabitAssessment" ("tenantId", "quarter", "year");
```

### 4.3 Why `CONCURRENTLY` matters

A normal `CREATE INDEX` takes an `ACCESS EXCLUSIVE` lock — writes to the table block for the duration. For small tables that's < 1 second; for `Notification` at scale it could be minutes. `CONCURRENTLY` builds the index with only a shared lock, so writes continue.

**Trade-off:** a `CONCURRENTLY` build can fail (duplicates, deadlock) leaving an invalid index behind. We guard with `IF NOT EXISTS` so a retry is clean. If an invalid index appears, drop it with `DROP INDEX CONCURRENTLY IF EXISTS "…"` and re-run.

### 4.4 Applying the migration

Run from a laptop with `DATABASE_URL_DIRECT` pointed at the **direct** (unpooled) Neon hostname — Prisma migrate needs a real session for advisory locks:

```bash
DATABASE_URL="$DATABASE_URL_DIRECT" npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
```

On Vercel we can skip this because migrations aren't in the build step; they're a manual pre-deploy ritual.

### 4.5 Verification after migration

```sql
-- Inbox unread query — should use Notification_tenantId_userId_read_idx
EXPLAIN ANALYZE
SELECT * FROM "Notification"
WHERE "tenantId" = 'xxx' AND "userId" = 'yyy' AND "read" = false
ORDER BY "createdAt" DESC LIMIT 50;

-- Performance review history — should use the new 4-col composite
EXPLAIN ANALYZE
SELECT * FROM "PerformanceReview"
WHERE "tenantId" = 'xxx' AND "revieweeId" = 'yyy'
ORDER BY "year" DESC, "quarter" DESC;

-- Habit dashboard — should use HabitAssessment_tenantId_quarter_year_idx
EXPLAIN ANALYZE
SELECT AVG("averageScore") FROM "HabitAssessment"
WHERE "tenantId" = 'xxx' AND "quarter" = 'Q1' AND "year" = 2026;
```

Expect `Index Scan using <new-index-name>` in each plan.

---

## 5. Risks & mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | `CREATE INDEX CONCURRENTLY` fails mid-build leaving an invalid index | Low | Medium | `IF NOT EXISTS` + documented retry (`DROP INDEX CONCURRENTLY IF EXISTS` then re-run). |
| R2 | The new composite makes an existing index redundant and write cost creeps up | Low | Low | Indexes are additive. We can always drop obsolete ones in a later migration. |
| R3 | Prisma tries to re-apply the migration because it's marked pending | Low | Low | `prisma migrate deploy` records each applied migration in `_prisma_migrations`. First run marks it; subsequent runs are no-ops. |
| R4 | The composite doesn't help because Postgres chose a different plan | Low | Low | Verified via `EXPLAIN` post-migration; drop the unused one if so. |
| R5 | DBA later regenerates the schema from a fresh `prisma migrate dev`, and the CONCURRENTLY annotation is lost | Medium | Medium | Document in the migration SQL comment; add a line to README pointing here. Future-safety: we could add a pre-commit check that `CREATE INDEX` without `CONCURRENTLY` is forbidden in migrations. Out of scope here. |

---

## 6. Rollback

```sql
DROP INDEX CONCURRENTLY IF EXISTS "Notification_tenantId_userId_read_idx";
DROP INDEX CONCURRENTLY IF EXISTS "PerformanceReview_tenantId_revieweeId_year_quarter_idx";
DROP INDEX CONCURRENTLY IF EXISTS "HabitAssessment_tenantId_quarter_year_idx";
```

Plus revert the `@@index` lines in `schema.prisma`. Query planner reverts to the pre-existing indexes automatically.

Rollback time: < 5 minutes.

---

## 7. Effort

| Task | Estimate |
|---|---|
| Add `@@index` lines to schema.prisma | 5 min |
| Write migration SQL with CONCURRENTLY | 15 min |
| Apply against dev Neon branch (staging data) | 10 min |
| Verify with `EXPLAIN ANALYZE` | 20 min |
| Apply against prod Neon + verify | 15 min |

**Total:** ~1 hour.

---

## 8. Sign-off

- [ ] Schema edited; Prisma client regenerated (`npx prisma generate`)
- [ ] Migration SQL reviewed
- [ ] Applied to dev; `prisma migrate status` clean
- [ ] `EXPLAIN ANALYZE` shows new indexes being used
- [ ] Applied to prod; no 5xx spike during apply
- [ ] Status flipped to `✔ Done`
