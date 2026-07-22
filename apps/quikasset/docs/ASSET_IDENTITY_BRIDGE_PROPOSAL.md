# Proposal: Asset Identity Bridge (`AstEmployee.userId`)

**Status:** Proposal — needs integration-owner (Kanishka / Ashwin) sign-off before any code.
**Author:** (fill in) · **Date:** 2026-07-10
**Scope of change:** `packages/database` Prisma schema + a data backfill migration.

> ⚠️ This touches `packages/database`, which app teams may not modify without
> integration-owner approval (root + app CLAUDE.md hard rule). Nothing here has
> been implemented. This document exists so the owner can approve the schema
> change; the migration lands **separately** from app code.

---

## Problem

QuikAsset's "a Member sees only their assigned assets" rule requires answering
*"which assets is the signed-in user assigned?"* But the two identities involved
are not linked:

- The **signed-in user** is a platform `User` / `OrgMember` — the auth identity
  behind `session.user.id`.
- **Asset assignments** point at `AstEmployee` (`AstAssignment.userId →
  AstEmployee.id`) — the QuikAsset-local employee directory (`app_quikasset`
  schema).

`AstEmployee` has **no foreign key to `User`**. The only shared field is `email`
(`@@unique([orgId, email])`).

### Current stopgap (shipped, fragile)

`apps/quikasset/lib/api/assetScope.ts` bridges the two by **email match**:
`session email → AstEmployee (case-insensitive email) → Active AstAssignment →
assetIds`. This is flagged in-code as a stopgap because:

- a signed-in user whose email doesn't **exactly** match an `AstEmployee.email`
  for the org resolves to no employee → **sees nothing** (false empty);
- it depends on email being unique **and stable** per org — a changed employee
  email silently breaks their access;
- it costs an extra lookup on every scoped asset read.

## Proposed change

Add a nullable FK on `AstEmployee` pointing at the platform `User`:

```prisma
model AstEmployee {
  // … existing fields …
  userId String?
  user   User?   @relation(fields: [userId], references: [id])

  @@unique([orgId, userId])   // a platform user maps to at most one employee per org
  @@index([userId])
}
```

- **Nullable** on purpose: not every employee is a login user (contractors,
  shared/asset-custodian records, historical rows).
- `@@unique([orgId, userId])` prevents double-linking. Postgres allows multiple
  NULLs, so unlinked employees are unaffected.
- **Cross-schema relation:** `AstEmployee` lives in `app_quikasset`; `User` in
  the `quikit`/`public` schema. Prisma multi-schema relations within one
  datasource are supported, but the owner should confirm this is acceptable and
  that the reverse relation field on `User` (if required by Prisma) is
  acceptable to add.

### Migration (lands separately from app code)

1. **Additive DDL** — add nullable `userId` column + index + unique constraint.
   Non-breaking; deploy-safe on its own.
2. **Backfill** — for each `AstEmployee`, match by email to a `User` that is an
   `OrgMember` of the same org; set `userId`. **Log every unmatched row** for
   manual review. Do **not** fail the migration on unmatched rows.
3. **Keep nullable** — do not enforce `NOT NULL`.

### Follow-up code (after the FK exists — separate PR)

- Replace the email lookup in `assetScope.ts` with `where: { orgId, userId }`
  and delete the stopgap warning.
- Decide how the link is **maintained going forward** (see open questions).

## What breaks / what doesn't

**Does NOT break:**

- Existing assignments — they stay keyed on `AstEmployee.id`; no assignment data
  changes.
- The current email-match stopgap keeps working during and after rollout, so
  there is no flag-day cutover.
- Employees with no matching user simply keep `userId = null`.

**What it enables / improves:**

- Robust, exact "my assets" resolution independent of email drift.
- Removes the false-empty failure mode members hit today.

## Open questions for sign-off

1. **Cross-schema FK** (`app_quikasset.AstEmployee` → `quikit.User`) — acceptable
   in this Prisma datasource, and is the reverse relation on `User` acceptable?
2. **Link maintenance going forward:** set `userId` at employee-creation time
   (when created from/for a known platform user), a periodic reconciliation job,
   or both?
3. **Unmatched/contractor employees:** confirm "no `User` → `userId` stays null →
   cannot sign in to see assets" is the intended behavior.
4. **Multi-org users:** a `User` in several orgs maps to one `AstEmployee` *per
   org* — the `@@unique([orgId, userId])` scoping handles this; confirm it fits
   the directory model.

## Related

- Stopgap implementation: `apps/quikasset/lib/api/assetScope.ts`
- Consumers to migrate: `app/api/assets/route.ts`, `app/api/assets/mine/route.ts`
