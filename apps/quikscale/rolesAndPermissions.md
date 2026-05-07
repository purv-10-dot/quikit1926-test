# Dynamic Roles & Permissions — Technical Reference

> Branch: `feature/dynamic-roles-permissions`
> Companion to [`emailIntegration.md`](./emailIntegration.md) and [`bugsResolve.md`](./bugsResolve.md). For a non-technical walkthrough of the same feature aimed at admins / business users, see [`rolesAndPermissions-Guide.md`](./rolesAndPermissions-Guide.md).

End-to-end record of every change made on this branch to ship the
admin-managed dynamic-roles system inside QuikScale.

---

## 1. Goals

1. Replace the hard-coded `Membership.role` enum (`SUPER_ADMIN | ADMIN | EXECUTIVE | …`) with **per-tenant, per-app custom roles** an admin can create + edit from the UI.
2. Each role carries:
   - An **entity × action grid** of grants (Create / Update / Delete / View on KPI, Priority, WWW, Team, Quarter, …).
   - A separate list of **sidebar items** the role can see (`navKey` whitelist).
3. The seeded `admin` role is a `CustomRole` row with `isSystem=true`. Permission checks short-circuit on it — no rows in the grid tables.
4. Admins manage everything from a single page (`/dashboard/org-setup/roles`).

---

## 2. Where the data lives — schema placement

Postgres has multiple schemas in `quikscale_dev`:

| Schema | What's in it |
|---|---|
| `public` | Identity / platform — `User`, `Tenant`, `App`, `Membership`, `UserAppAccess`, `OAuth*` |
| `app_quikscale` | QuikScale-specific data — `KPI`, `Priority`, `WWWItem`, `OPSP*`, etc. |
| `app_quikvc` | QuikVC-specific data |
| `app_quikconstruction` | QuikConstruction-specific data |

**The three new role tables live in `app_quikscale`.** Reasoning:
- Roles are app-specific (a QuikScale "Manager" grants permissions on KPI / Priority / WWW; a QuikVC "Manager" would grant Deal / Portfolio).
- The codebase already uses cross-schema FKs in the *opposite* direction (`app_quikscale.KPI.tenantId → public.Tenant.id`), so adding one in the new direction (`public.UserAppAccess.appRoleId → app_quikscale.CustomRole.id`) is a known-supported pattern.
- When QuikVC ships the same feature, the migration is a copy-paste into `app_quikvc` — no contention on shared tables.

---

## 3. Tables added (all `@@schema("app_quikscale")`)

### 3.1 `CustomRole`

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | `cuid()` |
| `tenantId` | `text` | FK → `public.Tenant.id`, ON DELETE CASCADE |
| `appId` | `text` | FK → `public.App.id`, ON DELETE CASCADE |
| `name` | `text` | "admin" / "User" / "Manager" / … |
| `description` | `text?` | optional |
| `isSystem` | `boolean` | `true` → permission checks bypass; cannot be deleted/renamed |
| `isDefault` | `boolean` | `true` → role to auto-assign to new invitees |
| `createdAt` / `updatedAt` / `createdBy` | meta | |

**Constraints**
- `UNIQUE (tenantId, appId, name)`
- `INDEX (tenantId, appId)`

### 3.2 `RolePermission` — entity × action grid

| Column | Type |
|---|---|
| `id` | `text` PK |
| `roleId` | `text` FK → `CustomRole.id` ON DELETE CASCADE |
| `resource` | `text` (one of `RESOURCES`) |
| `action` | `text` (one of `ACTIONS` — `create | update | delete | view`) |

**Semantics**
- *Presence of a row = permission granted.* Absence = deny.
- The seeded `admin` (`isSystem=true`) has **zero rows here on purpose** — `userCan(...)` short-circuits before reaching this table.

`UNIQUE (roleId, resource, action)` + `INDEX (roleId)`.

### 3.3 `RoleNavigation` — sidebar visibility

| Column | Type |
|---|---|
| `id` | `text` PK |
| `roleId` | `text` FK → `CustomRole.id` ON DELETE CASCADE |
| `navKey` | `text` (one of `NAV_KEYS`) |

`UNIQUE (roleId, navKey)` + `INDEX (roleId)`.

Separate from `RolePermission` because navigation visibility and CRUD are independent axes.

### 3.4 `public.UserAppAccess` — extended (one new column)

```prisma
model UserAppAccess {
  // …existing columns unchanged…
  appRoleId String?

  appRole CustomRole? @relation("AppAccessAppRole",
                                    fields: [appRoleId],
                                    references: [id],
                                    onDelete: SetNull)
}
```

`SET NULL` on delete means deleting a role doesn't block — affected users keep their `UserAppAccess` row but lose the role pointer.

---

## 4. Shared registry — `@quikit/shared`

[`packages/shared/lib/permissionsRegistry.ts`](../../packages/shared/lib/permissionsRegistry.ts) — single source of truth, consumed by both the server gate and the matrix UI.

```ts
export const ACTIONS = ["create", "update", "delete", "view"] as const;

export const RESOURCES = [
  "WWW", "Team", "Individual", "TeamKPI", "Quarter",
  "Priority", "User", "ClientMaster", "ClientMember",
  "DailyHuddle", "WeeklyMeeting", "OPSP",
] as const;

export const NAV_ITEMS = [
  { key: "dashboard",              label: "Dashboard",            group: "main" },
  { key: "kpi.individual",         label: "Individual KPI",       group: "kpi" },
  { key: "kpi.team",               label: "Teams KPI",            group: "kpi" },
  { key: "priority",               label: "Priority",             group: "main" },
  { key: "www",                    label: "WWW",                  group: "main" },
  { key: "org.teams",              label: "Teams",                group: "org" },
  { key: "org.users",              label: "Users",                group: "org" },
  { key: "org.quarter",            label: "Quarter Settings",     group: "org" },
  { key: "meeting.dashboard",      label: "Meeting Dashboard",    group: "meeting" },
  { key: "meeting.client_master",  label: "Client Master",        group: "meeting" },
  { key: "meeting.client_members", label: "Client Members",       group: "meeting" },
  { key: "meeting.daily",          label: "Daily Huddle",         group: "meeting" },
  { key: "meeting.weekly",         label: "Weekly Meeting",       group: "meeting" },
  { key: "opsp",                   label: "OPSP",                 group: "opsp" },
] as const;

export function isResource(v: string): v is Resource;
export function isAction(v: string): v is Action;
export function isNavKey(v: string): boolean;
```

Adding a new entity → append to `RESOURCES`. Adding a new sidebar entry → append to `NAV_ITEMS`. The Manage Permission UI re-renders automatically.

---

## 5. Server gate — [`apps/quikscale/lib/api/permissions.ts`](./lib/api/permissions.ts)

| Export | Purpose |
|---|---|
| `userCan(userId, tenantId, resource, action)` | Class-level CRUD check. Returns `true` for system admin, or when a `RolePermission` row exists. |
| `userHasNav(userId, tenantId, navKey)` | Sidebar-visibility check, same shape. |
| `loadMyPermissions(userId, tenantId)` | Returns `{ isAdmin, roleId, roleName, permissions: string[], navigation: string[] }` for a single client-side fetch. |
| `forbidden(message?)` | Standard 403 response. |
| `getQuikScaleAppId()` | Cached lookup of the QuikScale `App.id` by slug. |

The check is one round-trip:

```sql
SELECT 1
FROM "public"."UserAppAccess" uaa
JOIN "app_quikscale"."CustomRole" cr ON cr.id = uaa."appRoleId"
LEFT JOIN "app_quikscale"."RolePermission" rp
  ON rp."roleId" = cr.id AND rp.resource = $r AND rp.action = $a
WHERE uaa."userId"   = $u
  AND uaa."tenantId" = $t
  AND uaa."appId"    = (SELECT id FROM public."App" WHERE slug = 'quikscale')
  AND (cr."isSystem" = true AND cr.name = 'admin'
       OR rp.id IS NOT NULL)
LIMIT 1
```

Hits the `(roleId, resource, action)` unique index — O(1) effective.

---

## 6. API endpoints (all `requireAdmin`)

### Role management

| Route | Methods | Purpose |
|---|---|---|
| `/api/org/roles` | `GET`, `POST` | List roles with counts; create new role (auto-demotes any existing default if `isDefault=true`). |
| `/api/org/roles/[id]` | `GET`, `PATCH`, `DELETE` | Detail (incl. permissions+navigation+counts); rename / set default; delete. System roles refuse mutate/delete with 400. |
| `/api/org/roles/[id]/permissions` | `GET`, `PUT` | Read entity grid; PUT replaces the entire `(resource, action)` set in a single transaction. |
| `/api/org/roles/[id]/navigation` | `GET`, `PUT` | Read nav set; PUT replaces it atomically. |
| `/api/org/roles/[id]/members` | `GET`, `PUT` | List users assigned to this role; PUT reconciles — detaches users no longer in the body, attaches users in the body who already have a `UserAppAccess` row. Reports `skippedUserIds` for users without app access yet. |
| `/api/me/permissions` | `GET` | Current user's effective set; client caches via React Query. |

### User management (extended for the Users list)

| Route | Methods | Purpose |
|---|---|---|
| `/api/org/users` | `GET`, `POST` | **GET extended** — response now includes `appRoleId` + `appRoleName` per user (joined from `UserAppAccess.appRole`). Powers the role-dropdown column on the Users list. |
| `/api/org/users/[id]/role` | `PATCH` | Body `{ roleId: string \| null }`. Inline single-user role assignment. Returns **409** if the user has no `UserAppAccess` row yet — the UI surfaces a clear "invite to QuikScale first" message. Sanity-checks that the supplied `roleId` belongs to this tenant + app. |
| `/api/org/users/[id]/status` | `PATCH` | Body `{ status: "active" \| "inactive" }`. Toggles `Membership.status` — inactive users keep all data but lose sign-in. |

### Atomic-replace pattern

Both `PUT permissions` and `PUT navigation` use the same shape:

```ts
await db.$transaction([
  db.rolePermission.deleteMany({ where: { roleId } }),
  desired.length > 0
    ? db.rolePermission.createMany({ data: desired.map(d => ({ roleId, ...d })) })
    : null,
].filter(Boolean));
```

Half-applied saves are impossible — either the new set lands fully or nothing changes.

### System-role guards (server-side)

`PATCH /api/org/roles/[id]` and `DELETE /api/org/roles/[id]` both look up the role and return 400 if `isSystem=true`. The matrix PUT endpoints reject system roles too — admin's permissions live in code (the bypass), not in the table.

---

## 7. UI — two pages under `/org-setup/roles`

The feature is split across two pages so admins can manage *people* and
*roles* independently:

| Path | Component | What it does |
|---|---|---|
| `/org-setup/roles` | [`page.tsx`](./app/(dashboard)/org-setup/roles/page.tsx) | **Users list** — default landing for the *User Permission* dropdown. Inline role-dropdown + status switch + Add User modal. |
| `/org-setup/roles/manage` | [`manage/page.tsx`](./app/(dashboard)/org-setup/roles/manage/page.tsx) | **Manage Permission matrix** — role list + Entities/Navigation tabs. Reachable from the *Manage Roles* button on the Users list. |

The single `layout.tsx` at `/org-setup/roles/layout.tsx` (the FF-1 module
gate for `orgSetup.roles`) cascades to both routes — one gate, two views.

### 7.1 Users list — `/org-setup/roles`

```
┌─ Search… ─────────┬─ Filter by Org ─┐                  [+ Add User] [🛡 Manage Roles]
│ All Users  GOAL                                                                       │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Users           │ Email                  │ Account Type │ Roles ▾      │ Status      │
│ AS Ashwin       │ ashwin@…               │ Org Account  │ admin     ▾  │ ACTIVE  ●─  │
│ RD Rohit D      │ rohit@…                │ User Account │ — No role ▾  │ INACTIVE ─● │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Showing 1-10 of 84  Rows per page [10 ▾]      ‹ Previous   Page 1 of 9   Next ›      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- **Inline role change** — `<select>` posts `PATCH /api/org/users/[id]/role` with `{ roleId }`. Optimistic update; reverts on error; bottom-right toast `Role updated to <name>`.
- **Inline status toggle** — switch posts `PATCH /api/org/users/[id]/status`. Same optimistic + toast pattern.
- **Add User button** — opens the multi-row modal (Email + Name + App + Role per row, `+ Add another user` to extend). Submits each row to `POST /api/org/users` and follows up with `PATCH …/role` to assign the picked role.
- **Manage Roles button** — `router.push("/org-setup/roles/manage")`.
- **Pagination** — global shared `<Pagination>` from `@quikit/ui`. Defaults to **10 rows per page**; supports 10/20/30/50. Slicing is client-side against the `?pageSize=200` fetch (good enough up to a few hundred members; switch to server-side paging when tenants exceed that).
- **Tabs** — *All Users* + *GOAL*. Both currently show the same list (cross-app filter is a follow-up).
- **Filter by Organization** — disabled with a tooltip until the cross-org user model lands.

### 7.2 Manage Permission matrix — `/org-setup/roles/manage`

```
← Manage Permission
┌── Roles list (left, 280px) ─┬── Permissions panel (right, flex-1) ──┐
│  ROLES                  [+] │  Permissions — <role name>     [Save] │
│  🛡 admin                   │  Tabs: Entities | Navigation          │
│  ▸ User       DEFAULT   🗑  │  ─────────────────────────────────────│
│    Manager              🗑  │  ⓘ  Tick the action this role can…    │
│                             │  Entities → cards w/ count badge      │
│                             │  Navigation → grouped list of navKeys │
└─────────────────────────────┴───────────────────────────────────────┘
```

- **Header** — back arrow → `/org-setup/roles`, then "Manage Permission".
- **Add Role modal** — name + optional *Make this the default role*. 409 on duplicate name.
- **Delete confirm** — surfaces `_count.members` so the admin sees how many users will lose their assignment.
- **Bulk-toggle row** — clicking the entity label in Entities tab toggles all four checkboxes.
- **Save** — disabled when no edits pending; one atomic PUT for permissions + one for navigation, fired in parallel.
- **System role view** — `admin` renders as a centered "Administrator Role" banner (vertically centered via `flex-1 min-h-0`) with no checkboxes and no save button. Server also refuses mutations on it.
- **Entities cards** — each entity is its own bordered row card with a chevron + label + dark count badge (`⚫ N` = number of granted actions) + the four CRUD checkboxes right-aligned. Replaces the old single-table layout for cleaner per-row scanning.

### 7.3 Sidebar / dropdown destinations

| Place | File | Lands on |
|---|---|---|
| Sidebar `Org Setup → Roles & Permissions` | [`components/dashboard/sidebar.tsx`](./components/dashboard/sidebar.tsx) | `/org-setup/roles` (Users list). Hidden when `orgSetup.roles` module disabled. |
| Header dropdown → "User Permission" | [`components/dashboard/header.tsx`](./components/dashboard/header.tsx) | `/org-setup/roles` (Users list). |
| "Manage Roles" button on Users list | this branch | `/org-setup/roles/manage` (matrix). |
| ← back arrow on Manage Permission | this branch | `/org-setup/roles` (Users list). |

### 7.4 Sticky-layout pattern (shared by both pages)

Both pages use the same Flexbox chain so headers / role list / pagination
stay pinned and only the inner content area scrolls:

```
<page (h-full flex flex-col)>           ← fills the dashboard <main>
  <header (flex-shrink-0)/>             ← toolbar / back arrow
  <nav (flex-shrink-0)/>                ← tabs (Users list only)
  <card (flex-1 min-h-0 flex-col)>      ← grows to fill remaining height
    <scroll (flex-1 min-h-0             ← the ONLY scrolling region
              overflow-y-auto)>
      …rows / matrix…
    </scroll>
    <footer />                          ← Pagination (Users list)
                                          stays pinned at the bottom
  </card>
</page>
```

Key Tailwind incantations:

| Class | Why |
|---|---|
| `h-full` on the page | Fill the dashboard `<main>`'s visible viewport so the page itself doesn't trigger main-level scroll. |
| `flex flex-col` everywhere | Stack children vertically and let `flex-1` claim remaining height. |
| `flex-1 min-h-0` on growing children | **`min-h-0` is the magic.** Without it, Flexbox's default `min-height: auto` lets children grow past the parent and overflow lands at page level instead of inside the scroll wrapper. |
| `flex-shrink-0` on pinned strips | Prevents the toolbar / tabs / pagination from getting squeezed. |
| `overflow-y-auto` on the inner scroll | The single place where overflow happens. |
| `sticky top-0 z-10` on `<thead>` (Users list) | Keeps the column headers visible while the body scrolls. |

This pattern was applied to both pages in the same commit — internalize it
once, every layered scroll works the same way.

---

## 8. Migration & seed

[`packages/database/prisma/migrations/20260504130000_dynamic_roles/migration.sql`](../../packages/database/prisma/migrations/20260504130000_dynamic_roles/migration.sql)

1. `CREATE TABLE "app_quikscale"."CustomRole"` + unique + indexes + FKs to `public.Tenant` / `public.App`.
2. `CREATE TABLE "app_quikscale"."RolePermission"` + unique + index + FK to `CustomRole`.
3. `CREATE TABLE "app_quikscale"."RoleNavigation"` + unique + index + FK to `CustomRole`.
4. `ALTER TABLE "public"."UserAppAccess" ADD COLUMN "appRoleId" TEXT NULL` + FK to `app_quikscale.CustomRole` (`ON DELETE SET NULL`).
5. **Seed step (idempotent `DO $$ … $$` block):**
   - For every distinct `(tenantId)` in `UserAppAccess` filtered to `appId = (SELECT id FROM App WHERE slug='quikscale')`, insert one `CustomRole` with `name='admin', isSystem=true`.
   - `UPDATE UserAppAccess SET appRoleId = <admin role id>` for every row whose legacy `role='admin'`.
   - Non-admin existing rows are left with `appRoleId = NULL` deliberately — admin must assign roles explicitly.

Re-running the migration is safe (`ON CONFLICT DO NOTHING` on the role insert; `appRoleId IS NULL` predicate on the update).

---

## 9. Verification — SQL playbook

### A. List every custom role with row counts

```sql
SELECT
  cr.name,
  cr."isSystem",
  cr."isDefault",
  cr."createdAt",
  (SELECT COUNT(*) FROM app_quikscale."RolePermission" rp WHERE rp."roleId" = cr.id) AS perm_rows,
  (SELECT COUNT(*) FROM app_quikscale."RoleNavigation" rn WHERE rn."roleId" = cr.id) AS nav_rows,
  (SELECT COUNT(*) FROM public."UserAppAccess" uaa WHERE uaa."appRoleId" = cr.id) AS members
FROM app_quikscale."CustomRole" cr
ORDER BY cr."isSystem" DESC, cr.name;
```

### B. Show the entity grants for a role

```sql
SELECT resource, action
FROM app_quikscale."RolePermission" rp
JOIN app_quikscale."CustomRole" cr ON cr.id = rp."roleId"
WHERE cr.name = 'User'
ORDER BY resource, action;
```

### C. Pivoted matrix view (mirrors the UI's Entities tab)

```sql
SELECT
  resource AS "Entity",
  BOOL_OR(action = 'create') AS "Create",
  BOOL_OR(action = 'update') AS "Update",
  BOOL_OR(action = 'delete') AS "Delete",
  BOOL_OR(action = 'view')   AS "View"
FROM app_quikscale."RolePermission" rp
JOIN app_quikscale."CustomRole" cr ON cr.id = rp."roleId"
WHERE cr.name = 'User'
GROUP BY resource
ORDER BY resource;
```

### D. Navigation state

```sql
SELECT rn."navKey"
FROM app_quikscale."RoleNavigation" rn
JOIN app_quikscale."CustomRole" cr ON cr.id = rn."roleId"
WHERE cr.name = 'User'
ORDER BY rn."navKey";
```

### E. Who has which role?

```sql
SELECT u.email, cr.name AS role_name, cr."isSystem", cr."isDefault"
FROM public."UserAppAccess" uaa
JOIN public."User" u ON u.id = uaa."userId"
LEFT JOIN app_quikscale."CustomRole" cr ON cr.id = uaa."appRoleId"
JOIN public."App" a ON a.id = uaa."appId" AND a.slug = 'quikscale'
ORDER BY cr.name NULLS FIRST, u.email;
```

### F. Cascade behaviour smoke test

```sql
-- Pick a non-system role.
SELECT id, name FROM app_quikscale."CustomRole" WHERE "isSystem" = false LIMIT 1;

-- Count what will cascade.
SELECT
  (SELECT COUNT(*) FROM app_quikscale."RolePermission" WHERE "roleId" = '<id>') AS perms_will_drop,
  (SELECT COUNT(*) FROM app_quikscale."RoleNavigation" WHERE "roleId" = '<id>') AS navs_will_drop,
  (SELECT COUNT(*) FROM public."UserAppAccess" WHERE "appRoleId" = '<id>') AS users_will_unlink;

-- Delete the role.
DELETE FROM app_quikscale."CustomRole" WHERE id = '<id>';

-- Re-run the count — perms and navs should be 0; users should still exist with appRoleId = NULL.
```

---

## 10. Files touched (full list)

| Path | Change |
|---|---|
| `packages/database/prisma/schema.prisma` | Added 3 models + `appRoleId` column + inverse relations on `Tenant` / `App`. |
| `packages/database/prisma/migrations/20260504130000_dynamic_roles/migration.sql` | DDL + seed. |
| `packages/shared/lib/permissionsRegistry.ts` | New — `RESOURCES`, `ACTIONS`, `NAV_ITEMS`, type guards. |
| `packages/shared/index.ts` | Re-export the registry. |
| `packages/shared/lib/moduleRegistry.ts` | Added `orgSetup.roles` module entry. |
| `apps/quikscale/lib/api/permissions.ts` | New — `userCan`, `userHasNav`, `loadMyPermissions`, `forbidden`, `getQuikScaleAppId`. |
| `apps/quikscale/app/api/org/roles/route.ts` | New — list + create. |
| `apps/quikscale/app/api/org/roles/[id]/route.ts` | New — detail + patch + delete. |
| `apps/quikscale/app/api/org/roles/[id]/permissions/route.ts` | New — entity grid GET/PUT. |
| `apps/quikscale/app/api/org/roles/[id]/navigation/route.ts` | New — nav GET/PUT. |
| `apps/quikscale/app/api/org/roles/[id]/members/route.ts` | New — members GET/PUT. |
| `apps/quikscale/app/api/me/permissions/route.ts` | New — effective permissions for current user. |
| `apps/quikscale/app/api/org/users/route.ts` | **Extended** — GET response now joins `UserAppAccess.appRole` to surface `appRoleId` + `appRoleName` per user. POST returns the same shape. Used by the Users list role dropdown. |
| `apps/quikscale/app/api/org/users/[id]/role/route.ts` | New — `PATCH` to assign / clear a user's CustomRole. 409 if no `UserAppAccess` row exists yet. |
| `apps/quikscale/app/api/org/users/[id]/status/route.ts` | New — `PATCH` to flip `Membership.status` between `active` ↔ `inactive`. |
| `apps/quikscale/app/(dashboard)/org-setup/roles/layout.tsx` | New — FF-1 module gate (cascades to `/manage`). |
| `apps/quikscale/app/(dashboard)/org-setup/roles/page.tsx` | **New (rewritten)** — Users list with inline role dropdown, status toggle, Add User multi-row modal, global pagination, sticky-layout wrappers. Replaces the previous Manage Permission landing here. |
| `apps/quikscale/app/(dashboard)/org-setup/roles/manage/page.tsx` | **Moved + reworked** from the old `…/roles/page.tsx`. Tightened layout (no 600px floor), per-row Entities **cards** (chevron + label + count badge + 4 checkboxes), pinned header / tabs / info banner via the same `flex-col + min-h-0` chain, scroll-only-the-matrix region. Admin role banner now centered vertically. |
| `apps/quikscale/components/dashboard/sidebar.tsx` | Added `Roles & Permissions` link → `/org-setup/roles` (Users list). |
| `apps/quikscale/components/dashboard/header.tsx` | Added `User Permission` item to user dropdown → `/org-setup/roles`. |

---

## 11. Out of scope (deferred follow-ups)

These are intentionally not done in this branch and need their own batches:

1. **Per-feature permission helpers still read legacy roles.** `canEditKPI`, `canEditPriority`, `canEditWWW`, etc. still read `Membership.role`. Sweeping them to call `userCan(...)` is a separate batch — needs careful test coverage so existing behaviour doesn't regress.
2. **Sidebar visibility filter on the client.** `<Sidebar>` filters by FF-1 module flags only. Wiring it to also honour `loadMyPermissions().navigation` is one client hook + a render check.
3. **Per-button hides on existing pages.** `<AddButton>` on KPI/Priority/WWW should hide when `useMyPermissions().can("KPI", "create")` is false.
4. **Cross-org filter + All Users vs GOAL split.** The `Filter by Organization` dropdown is disabled and both tabs return the same list today. Wiring needs the cross-org user model.
5. **Server-side pagination for the Users list.** Current implementation fetches `?pageSize=200` and slices client-side — fine up to a few hundred members. Switch to server-side paging (`?page=&pageSize=`) when tenants exceed that.
6. **Invitation-based Add User flow.** The Add User modal generates a temp password client-side because `POST /api/org/users` requires one. Replace with the proper invitation flow (email link + first-login password set) in a follow-up.
7. **Drop legacy columns.** `Membership.role` and `UserAppAccess.role` mirror the new world during transition; drop them in a later cleanup migration once every consumer uses `userCan(...)`.

---

## 12. Quick reference

| Need to… | File |
|---|---|
| Add a new entity to the matrix | Append to `RESOURCES` in `permissionsRegistry.ts`; add a label in `RESOURCE_LABELS` map in the page. |
| Add a new sidebar item to the matrix | Append to `NAV_ITEMS` in `permissionsRegistry.ts`. |
| Gate an existing API route | `if (!await userCan(userId, tenantId, "Foo", "create")) return forbidden();` |
| Hide a button client-side | (after Batch-4 hook) `useMyPermissions().can("Foo", "create")` |
| Inspect what's in the DB | Run query A in §9 — gives one line per role with all counts. |
| Reset everything to "fresh seed" | `TRUNCATE app_quikscale."CustomRole" CASCADE;` then re-run the migration's seed `DO $$` block. |
