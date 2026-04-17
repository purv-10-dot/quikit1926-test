---
id: P0-2
title: Eliminate N+1 in POST /api/apps/enable
wave: 1
priority: P0
status: Draft
owner: unassigned
created: 2026-04-17
updated: 2026-04-17
targets: [quikit]
depends_on: []
unblocks: []
---

# P0-2 — Eliminate N+1 in `POST /api/apps/enable`

> **TL;DR** — `apps/quikit/app/api/apps/enable/route.ts` does `findMany(members)` then, in a `for` loop, `findUnique` + `create` per member. At 500 active members, that's ~1 001 sequential DB round-trips per call. Replace the loop with a single `createMany({ skipDuplicates: true })`. The code change is ~15 lines; the plan exists because we need a regression test, tenant-isolation sanity, and confirmation that `skipDuplicates` is semantically correct.

---

## 1. Context

### 1.1 Evidence

**File:** `apps/quikit/app/api/apps/enable/route.ts`

Lines 47-70:

```ts
// Get all active members of this tenant
const members = await db.membership.findMany({
  where: { tenantId, status: "active" },
  select: { userId: true },
});

// Create UserAppAccess for each member (skip if already exists)
let created = 0;
for (const member of members) {
  const existing = await db.userAppAccess.findUnique({
    where: { userId_tenantId_appId: { userId: member.userId, tenantId, appId } },
  });
  if (!existing) {
    await db.userAppAccess.create({
      data: {
        userId: member.userId,
        tenantId,
        appId,
        role: "member",
        grantedBy: session.user.id,
      },
    });
    created++;
  }
}
```

Per call: `M` members → `1 + 2M` DB calls sequential, worst case. At M=500 that's 1 001 round-trips. On a pooled connection (see P0-1), each round-trip is 1-3 ms locally + Vercel-to-pooler latency (~3-6 ms in us-east). Practical lower bound per call: ~5 seconds. Under concurrent use with other admins, the endpoint blocks the pool and starves the rest of the app.

### 1.2 What triggers this at scale

- Tenant has 50-500+ members.
- An admin clicks "Enable for org" on the `/apps` launcher.
- Endpoint is invoked exactly once per enable click — **but** the first enable for a newly-purchased app is usually on the same day the tenant onboards, when other traffic is elevated.

Symptom: the admin's enable-click hangs for 5-10 seconds; during that time, concurrent Prisma requests backed up behind this lambda timeout with `connection pool timeout`.

### 1.3 Why it's P0

This is the one endpoint in the audit that has a **linear-in-tenant-size** blast radius. Every other flagged list endpoint can be patched with pagination and clients keep working; this one blocks the lambda and cascades. And once P0-1 (pooling) ships, pool contention gets more visible, not less.

---

## 2. Goal / Non-goals

**Goal.** Enabling an app for a tenant with N members takes at most **3 DB round-trips** (membership check, membership list, bulk insert) regardless of N. Response returns within 500 ms at N=1 000.

**Non-goals.**
- Not redesigning the `UserAppAccess` model.
- Not changing the semantics of "enable for org" (still grants `member` role to all active members, skipping those who already have access).
- Not paginating — we want one bulk insert; `createMany` has no row-count limit that matters at realistic N.
- Not changing who is allowed to call this endpoint (admin / super_admin / owner remain the allowed roles).

---

## 3. Options considered

### Option A — `createMany({ skipDuplicates: true })` (RECOMMENDED)
Single bulk insert. Postgres via Prisma supports `ON CONFLICT DO NOTHING`, which is what `skipDuplicates` compiles to.

- ✅ 3 DB calls total: existing `findFirst` (admin check) + new `findMany` (members) + new `createMany`.
- ✅ Prisma 5 supports it on PostgreSQL (our provider).
- ✅ Idempotent — re-clicking "Enable" is safe.
- ⚠ Returns `{ count: N }` but `N` is **rows inserted**, not rows intended. That's fine for our response contract but we should not use `N` as a "members granted" count without a nuance.
- ⚠ `skipDuplicates` requires a unique constraint — our `UserAppAccess` already has `@@unique([userId, tenantId, appId])` so it works.

### Option B — Raw SQL `INSERT … ON CONFLICT DO NOTHING RETURNING`
Prisma `$queryRaw` to get both insert and accurate "how many new rows" count in one trip.

- ✅ Two DB calls total (membership list + insert-returning).
- ❌ Loses Prisma type safety on writes.
- ❌ Harder to test with the Prisma mock.
- **Deferred.** Only worth it if we need the exact "granted" count, which UI doesn't require.

### Option C — Pre-filter existing access, then `createMany` the diff
Fetch existing access records, diff, bulk-create.

- ✅ Accurate `membersGranted` count without `RETURNING`.
- ✅ No reliance on `skipDuplicates`.
- ❌ 4 DB calls: membership check + members + existing access + createMany.
- ❌ More code, more test surface.
- **Rejected.** Option A is simpler and the UI count is non-critical.

### Option D — Queue it; enable asynchronously
Push to BullMQ / pg-boss, return 202, backfill in background.

- ✅ UI is instant.
- ❌ Requires job runner infra (doesn't exist yet) — that's P2.
- ❌ Overkill: at N=1 000 with `createMany`, response is < 500 ms.
- **Deferred.** If we ever hit tenants with 10 000+ members, revisit.

**Chosen: Option A.**

---

## 4. Design

### 4.1 New handler shape

```ts
// Lines 40-76 (replacement)

// Verify app exists
const app = await db.app.findUnique({ where: { id: appId }, select: { id: true } });
if (!app) {
  return NextResponse.json({ success: false, error: "App not found" }, { status: 404 });
}

// Get all active members of this tenant (ID only — that's all we insert)
const members = await db.membership.findMany({
  where: { tenantId, status: "active" },
  select: { userId: true },
});

// Bulk-create access records; ON CONFLICT DO NOTHING for anyone who already has access.
// Returns { count } = number of rows actually inserted (new grants).
const { count: granted } = await db.userAppAccess.createMany({
  data: members.map((m) => ({
    userId: m.userId,
    tenantId,
    appId,
    role: "member",
    grantedBy: session.user.id,
  })),
  skipDuplicates: true,
});

return NextResponse.json({
  success: true,
  data: { appId, membersGranted: granted, totalEligibleMembers: members.length },
});
```

### 4.2 Response contract change

Before:
```json
{ "success": true, "data": { "appId": "…", "membersGranted": 12 } }
```

After:
```json
{ "success": true, "data": { "appId": "…", "membersGranted": 12, "totalEligibleMembers": 42 } }
```

`membersGranted` keeps its old meaning (newly inserted rows). `totalEligibleMembers` is added so the UI can show "12 of 42 members newly granted (30 already had access)."

**Backwards-compatibility:** existing UI consumers that only read `membersGranted` are unaffected (property still present, same type, same semantics). Adding a property is safe.

### 4.3 Edge cases

| Case | Before | After |
|---|---|---|
| Tenant has 0 active members | `membersGranted: 0`, no DB writes | Same — `createMany` with empty `data` is a no-op that returns `{ count: 0 }` |
| App was already enabled for all members | `membersGranted: 0`, 501 wasted queries | `membersGranted: 0`, 1 no-op bulk insert |
| Same admin clicks "Enable" twice quickly | Second click creates 0 new rows | Same — idempotent |
| Member count > `createMany` chunk limit (Postgres max 65,535 parameters / 5 cols = 13,107 rows) | Works but slow | Works up to ~13k; flag to revisit in P2 if any tenant grows past that |
| `createMany` fails partway (constraint violation other than unique) | Unchanged — Postgres rolls back the statement | Bulk insert is atomic; either all-or-nothing |

### 4.4 Auditability concern

The existing code implicitly "audit logs" by creating rows one at a time with `grantedBy: session.user.id`. The new code preserves `grantedBy` on every row. No other audit log exists in this route — if product wants an AuditLog entry per bulk-enable, that's a P1 add (out of scope here), and we'd add it as **one** AuditLog write, not N.

---

## 5. Code changes

### 5.1 File touched
- `apps/quikit/app/api/apps/enable/route.ts` — replace lines 46-75 (inclusive) with the handler in §4.1.

Nothing else changes. No schema migration. No shared package edit.

### 5.2 Diff sketch

```diff
-  // Get all active members of this tenant
   const members = await db.membership.findMany({
     where: { tenantId, status: "active" },
     select: { userId: true },
   });

-  // Create UserAppAccess for each member (skip if already exists)
-  let created = 0;
-  for (const member of members) {
-    const existing = await db.userAppAccess.findUnique({
-      where: { userId_tenantId_appId: { userId: member.userId, tenantId, appId } },
-    });
-    if (!existing) {
-      await db.userAppAccess.create({
-        data: {
-          userId: member.userId,
-          tenantId,
-          appId,
-          role: "member",
-          grantedBy: session.user.id,
-        },
-      });
-      created++;
-    }
-  }
+  // Bulk-create access rows; ON CONFLICT DO NOTHING via skipDuplicates.
+  // `count` is the number of *new* rows inserted (i.e., members who didn't already have access).
+  const { count: granted } = await db.userAppAccess.createMany({
+    data: members.map((m) => ({
+      userId: m.userId,
+      tenantId,
+      appId,
+      role: "member",
+      grantedBy: session.user.id,
+    })),
+    skipDuplicates: true,
+  });

   return NextResponse.json({
     success: true,
-    data: { appId, membersGranted: created },
+    data: {
+      appId,
+      membersGranted: granted,
+      totalEligibleMembers: members.length,
+    },
   });
```

---

## 6. Test plan

### 6.1 New regression test

**File:** `apps/quikit/__tests__/api/apps-enable.test.ts` (new)

**Env:** node + mocked Prisma (per `CLAUDE.md` testing standard — `__tests__/helpers/mockDb.ts`, `setSession` helper).

Required cases:

1. **Unauthenticated → 401.** No session.
2. **Authenticated but no tenantId → 403.** Session has user, no tenant selected.
3. **Member (non-admin) → 403.** Role is `member` — enable must be denied.
4. **Admin, app doesn't exist → 404.**
5. **Admin, happy path, all members new → 200 with `membersGranted === totalEligibleMembers`.** Verify `createMany` called with the correct data shape and `skipDuplicates: true`.
6. **Admin, happy path, some members already have access → 200 with `membersGranted < totalEligibleMembers`.** Mock `createMany` to return `{ count: N - overlap }`.
7. **Zero active members → 200 with `membersGranted: 0, totalEligibleMembers: 0`.** Ensure we don't crash on empty array.
8. **DB call count assertion.** Mock counter; assert total Prisma calls = 4 (session lookup + membership admin check + app lookup + members findMany + createMany — 4 or 5 depending on how we count; spec the exact number to catch a regression).

### 6.2 Manual verification (staging)

- On a uat tenant with ≥ 50 seeded members, click "Enable for org" on an app. Response time in DevTools Network tab should be < 500 ms (was ~5 s before).
- Click again — `membersGranted` should be `0`, `totalEligibleMembers` unchanged.

### 6.3 Production verification

- After prod deploy, an internal admin enables an app on a 5-member test tenant. Confirm response < 500 ms.
- Grep logs for `apps/enable` entries; p95 should be < 500 ms.

---

## 7. Rollback

**Trigger:** 5xx rate on `/api/apps/enable` > 0.5% for > 5 minutes, OR a customer report that a bulk-enable didn't grant access to everyone.

**Procedure:** `git revert <commit sha>`; push to `main`; Vercel redeploys (< 3 min). No data cleanup needed — the old code and new code produce the same database state (just in different numbers of round-trips).

**Rollback time:** < 5 minutes.

**Data-integrity note:** `createMany` with `skipDuplicates: true` cannot under-grant. Either the row exists (it does nothing) or the row doesn't (it inserts). There is no scenario where the new code grants *less* access than the old code.

---

## 8. Risks & mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | A future schema change removes the `@@unique([userId, tenantId, appId])` constraint → `skipDuplicates` silently becomes `skipNothing` | Low | High | Add an index-assertion to the regression test that fails if the unique constraint is missing from `schema.prisma`. |
| R2 | UI consumer somewhere reads `data.membersGranted` and expects it to equal total membership count | Low | Low | The old code already returned "new grants only" (via `if (!existing)`) so semantics are unchanged. Audit `grep -r "membersGranted"` in the repo to be sure. |
| R3 | A Prisma upgrade changes `skipDuplicates` behavior or removes it | Low | High | We pin Prisma in `package.json`; CHANGELOG review on upgrades is already standard. |
| R4 | Postgres parameter limit (65,535) at huge tenants | Very low | Medium | At ~13k members we hit the limit. We're orders of magnitude below this. Add a TODO to chunk at 10k members in Wave 3. |
| R5 | `createMany` inserts that raise a non-uniqueness error (e.g., FK violation because a userId was deleted between the `findMany` and the `createMany`) | Very low | Medium | Wrap in try/catch; on P2002 surface 409; on any other Prisma error, log and 500. |

---

## 9. Effort

| Task | Estimate |
|---|---|
| Implement the code change | 15 min |
| Write the regression test | 45 min |
| Manual verification on uat | 15 min |
| Code review + merge | 30 min (reviewer time) |

**Total:** ~1.5 hours engineer time. **Calendar time:** same day.

---

## 10. Open questions

- [ ] Do we want to emit an AuditLog entry on bulk enable? _(Recommendation: out of scope for P0-2; propose as P1.)_
- [ ] Should the UI surface `totalEligibleMembers` to the admin ("12 of 42 members granted access")? _(Design decision for frontend; spec the API support here, FE can consume later.)_

---

## 11. Sign-off

- [ ] Code change reviewed
- [ ] Regression test green in CI
- [ ] Manual verification on uat
- [ ] Prod deployed
- [ ] One real bulk-enable observed < 500 ms in prod logs
- [ ] Status flipped to `✔ Done` in index

## Appendix — Prisma `createMany` + `skipDuplicates` docs
- https://www.prisma.io/docs/orm/reference/prisma-client-reference#createmany
- Requires PostgreSQL, CockroachDB, MongoDB, or MySQL. We're on PostgreSQL. ✅
