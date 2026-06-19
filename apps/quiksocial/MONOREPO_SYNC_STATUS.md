# QuikSocial Monorepo Sync — Status Snapshot

> Saved before context compaction. Resume from this file + the existing
> `MIGRATION_PROGRESS.md` and `HANDOFF_CHECKLIST.md`.

## Branches

| | Branch |
|---|---|
| Active work | `feature/quiksocial-v2-port` |
| Safety backup | `feature/quiksocial-v2-port-backup` |

## What's done so far

### v2 → monorepo port (23 commits on `feature/quiksocial-v2-port`)
Already shipped:
- Phase A schema (Offering + 4 AutoReply* models; Product/Service dropped)
- Batches 1–7 of the original migration (lib utils, offerings, brands/posts/campaigns adapted, components, auto-reply subsystem, meta/cron, deps/.env)
- Post-batch fixes: sidebar (catalog dropdown → single link; Auto-reply nav added), Brand Creation Wizard (5 → 6 steps with CatalogDiscoveryStep), prisma migration guard for missing PerformanceReview table.
- Sprint 2 v2-fix sync (5 commits May 27–28): SelectMediaModal Offering UX, calendar 4 bugs, dark select theme + festival pre-fill, content-hub deep-link, drop demo env-fallback + Post-Now platform.
- Sprint 3 v2-fix sync (4 commits May 29 – Jun 3): IG Business Account ID (schema + dispatch self-heal + callback + backfill script), drop deprecated Facebook publish_video scope, Cloudinary fl_attachment + platform-at-scheduling, posts/create regenerate forwards attachment + stale-closure dep fixes.
- QuiKit app-switcher added to the dashboard header (local styled version respecting quiksocial design tokens).

### After the v2 port
- **Pre-Prod branch merge** brought in changes from `Pre-Prod`.
- **`lenis` dependency fix** — added/repaired the missing dep so the build resolves.

For the full per-commit ledger see `MIGRATION_PROGRESS.md`.

## What's next: QuiKit RBAC provisioning layer

**Goal**: bolt QuikIT's RBAC v2 onto QuikSocial so the super-admin "grant org access to QuikSocial" flow auto-provisions roles, mirroring how `apps/quikscale` works.

**Reference implementation**: `apps/quikscale` is the canonical pattern — copy its shape.

### Key finding from the investigation
QuikScale's RBAC sits across these tables (all in `app_quikscale` schema):
- **`AppRole`** `{ orgId, appId, name, description, isSystem, isDefault }` — named role definitions per (org, app).
- **`UserAppRole`** `{ userId, orgId, roleId }` — join table; assigns a user to a role.
- **`RolePermission`** `{ roleId, resource, action }` — flat permission grants on a role.
- **`RoleNavigation`** `{ roleId, navKey }` — sidebar visibility flags per role.
- **`UserPermissionExtra`** `{ orgId, userId, resource, action }` — additive per-user grants on top of role.

Provisioning is layered (no webhooks; all push-at-write-time + lazy fallback):

1. **Super-admin grants app access in QuikIT** → `apps/quikit/app/api/super/orgs/[id]/members/route.ts` writes `quikit.UserAppAccess`, then calls:
   - `assignAppRoles(db, orgId, ...)` from `@quikit/auth/assign-app-roles` (raw-SQL inserts into `app_<slug>.UserAppRole`; silently skips apps whose schema has no `AppRole` table).
   - `provisionAppRoles({slug, baseUrl}, orgId, adminUserIds)` from `apps/quikit/lib/provisionAppRoles.ts` (HTTP POST to `<app>/api/internal/provision-roles` with `INTERNAL_SECRET` header).
2. **App-side seed endpoint** `apps/quikscale/app/api/internal/provision-roles/route.ts` calls `seedAllDefaultRoles(orgId)` (idempotent — creates admin + User roles with full permission grants) then `ensureUserOnRole(adminUserId, orgId, adminRoleId)` for each supplied admin.
3. **Org-admin invite path** `apps/admin/app/api/members/route.ts` does the same: writes UserAppAccess, calls `assignNamedRolesForAccess` (wraps `assignAppRoles`).
4. **App-internal invite path** `apps/quikscale/app/api/org/users/route.ts` writes everything in a single Prisma transaction (Org + auth.User + OrgMember + UserAppAccess + UserAppRole + email).
5. **Lazy-seed safety net**: every authenticated QuikScale client fetches `/api/me/permissions` on mount, which calls `seedAllDefaultRoles(orgId)` first (5-min in-process cache). Catches any org that was provisioned without the central flow firing.
6. **Runtime enforcement**: `userCan(userId, orgId, resource, action)` joins through `UserAppRole → AppRole → RolePermission` plus checks `UserPermissionExtra`. The route wrapper `withOrgAuthForResource("module", "Resource")` curries it onto every HTTP verb.

### Critical constraint: QuikSocial's BrandMembership stays unchanged

QuikScale's RBAC is **org-scoped** (one workspace = one org). QuikSocial is **brand-scoped** (N workspaces per org, each a `Brand`). The existing `BrandMembership` table is the per-brand role assignment and **must not be replaced**.

The new RBAC layer sits **on top of** BrandMembership, not in place of it. Two cleanest options for adapting (decide before building):

- **Option A — Org-level AppRole, brand-level BrandMembership.** Add the QuikScale 5-table set as-is (org-scoped) for a "QuikSocial admin for the whole org" concept that's separate from per-brand admin/approver/member. Useful if you want a billing-admin-style role that sees all brands.
- **Option B — Convert BrandMembership.role from string → FK to BrandRole.** Add `BrandRole` + `BrandRolePermission` tables scoped to `(orgId, brandId)`. Replaces the current hardcoded `admin/approver/member` enum with editable role definitions per brand. Preserves brand scoping; gains per-resource permissions.

Investigation report in conversation history is the authoritative source — re-read it before deciding.

### Files to create when adapting
Mirroring quikscale's structure:
- `packages/database/prisma/schema.prisma` — add 4–5 models under `app_quiksocial` (or 5 brand-scoped equivalents per Option B).
- `apps/quiksocial/lib/api/permissions.ts` — `userCan`, `loadMyPermissions`.
- `apps/quiksocial/lib/api/permissionsRegistry.ts` — TS source of truth for every `(resource, action)` pair.
- `apps/quiksocial/lib/api/seedAdminAppRole.ts` (or `seedDefaultRoles.ts`) — idempotent seeder.
- `apps/quiksocial/app/api/internal/provision-roles/route.ts` — INTERNAL_SECRET-guarded seed endpoint.
- `apps/quiksocial/app/api/me/permissions/route.ts` — lazy-seed safety net + return effective permissions.
- `apps/quiksocial/app/api/org/users/route.ts` + `[id]/route.ts` + `search/` — user list / invite / link existing / role-change.
- `apps/quiksocial/app/api/org/roles/route.ts` + `[id]/route.ts` — AppRole CRUD UI backing.
- `apps/quiksocial/app/api/org/invitations/route.ts` — org-internal invite list (the central accept flow at `apps/auth/.../invitations/accept` already exists — no change there).
- Update `apps/quiksocial/lib/api/withOrgAuth.ts` to expose `withOrgAuthForResource(moduleKey, resource)` curry.
- Register `quiksocial: "QUIKSOCIAL_URL"` in `apps/quikit/lib/provisionAppRoles.ts`'s `APP_URL_OVERRIDE` map.

The `assignAppRoles` helper in `packages/auth/` already supports any app slug via raw SQL + `information_schema` probe — no change to that file needed.

## Reference paths (one-liners)

| Concern | File |
|---|---|
| Schema models | `packages/database/prisma/schema.prisma` lines 777–855 |
| Cross-app role assignment (raw SQL, schema-agnostic) | `packages/auth/assign-app-roles.ts` |
| QuikIT side super-admin grant flow | `apps/quikit/app/api/super/orgs/[id]/members/route.ts` |
| HTTP-push to apps for seeding | `apps/quikit/lib/provisionAppRoles.ts` |
| QuikScale receive-and-seed endpoint | `apps/quikscale/app/api/internal/provision-roles/route.ts` |
| QuikScale idempotent seeder | `apps/quikscale/lib/api/seedAdminAppRole.ts` |
| QuikScale permission check + effective-set loader | `apps/quikscale/lib/api/permissions.ts` |
| QuikScale lazy-seed safety net | `apps/quikscale/app/api/me/permissions/route.ts` |
| QuikScale invite endpoint (writes everything in one tx) | `apps/quikscale/app/api/org/users/route.ts` |
| Route-level RBAC wrapper | `apps/quikscale/lib/api/withOrgAuth.ts` (`withOrgAuthForResource`) |
| Org-admin invite (apps/admin) | `apps/admin/app/api/members/route.ts` + `apps/admin/lib/roles-helpers.ts` |
| Invitation accept (apps/auth) | `apps/auth/app/api/invitations/accept/route.ts` |
| QuikSocial current per-brand RBAC | `apps/quiksocial/lib/auth/rbac.ts` |
| QuikSocial existing membership model | `app_quiksocial.BrandMembership` in `packages/database/prisma/schema.prisma` |

## Resume instructions after compact

1. Read this file + `apps/quiksocial/MIGRATION_PROGRESS.md` + `apps/quiksocial/HANDOFF_CHECKLIST.md`.
2. Confirm branch: `git rev-parse --abbrev-ref HEAD` should report `feature/quiksocial-v2-port`.
3. Pull latest if needed: `git pull --ff-only origin feature/quiksocial-v2-port`.
4. Before adapting RBAC, decide Option A vs Option B (org-scope vs brand-scope) — that's a product-shape question, not a code-shape question.
5. Then mirror the QuikScale file list above, scoped to whichever option was chosen.
