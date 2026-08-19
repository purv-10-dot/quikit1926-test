# 15 — App Role Permissions (RBAC v2)

> **Audience:** a developer wiring fine-grained roles & permissions for an app in this monorepo.
> Uses QuikTrack (`Qt*`) as the reference implementation and QuikAsset (`Ast*`) as the app being wired.

---

## The three authorization layers (don't confuse them)

| Layer | Storage | Granularity | Who edits it |
|---|---|---|---|
| **1. Platform membership** | `quikit.OrgMember.role` (one string) | Org-wide, coarse (`super_admin` / `org_admin` / `app_admin` / `member`) | Super-admin / invite flow |
| **2. App entitlement** | `quikit.OrgAppAccess` (org) + `quikit.UserAppAccess` (user) | "Can this org / user open this app at all" | Super-admin / provisioning |
| **3. App RBAC v2** | per-app `AppRole` → `RolePermission(resource, action)`, assigned via `UserAppRole` | Fine-grained `resource:action` inside the app | Org admins, in the app's "Roles & Permissions" UI |

A fourth thing — the static `manifest.ts` `permissions[]` array (dot-strings like `quikasset.asset.read`)
— is a **build-time platform contract** read by the launcher, **not** the runtime engine. Do not
conflate it with `RolePermission`.

> **Key fact:** a user can be `OrgMember.role = "member"` platform-wide yet hold the app's `admin`
> AppRole. The two tiers are independent; app RBAC is the one that gates features inside the app.

---

## The data model (RBAC v2)

Each app owns a **private copy** of the RBAC tables in its own Postgres schema, all `@@map`'d to the
same logical names but exposed under a prefixed Prisma model name. QuikAsset's family (the schema you
supplied) lives in `app_quikasset`:

| Prisma model | `@@map` | Purpose |
|---|---|---|
| `AstAppRole` | `AppRole` | A named role, scoped to `(orgId, appId)`. |
| `AstRolePermission` | `RolePermission` | One grant on a role: `(roleId, resource, action)`. |
| `AstRoleNavigation` | `RoleNavigation` | Sidebar visibility grant: `(roleId, navKey)`. |
| `AstUserAppRole` | `UserAppRole` | Assigns a user to a role: `(userId, orgId, roleId)`. |
| `AstUserPermissionExtra` | `UserPermissionExtra` | **Per-user additive** grant, on top of role grants. |

Reference copies: `AppRole` family (unprefixed) in `app_quikscale` — `schema.prisma` lines 974–1053;
`Qt*` family in `app_quiktrack` — lines 6141–6333.

### AstAppRole — the flags that matter

```prisma
model AstAppRole {
  id          String   @id @default(cuid())
  orgId       String
  appId       String
  name        String
  isSystem    Boolean  @default(false)   // protects the row from rename/delete — NOT a permission bypass
  isDefault   Boolean  @default(false)   // new invitees auto-land on this role
  permissions AstRolePermission[]
  navigations AstRoleNavigation[]
  members     AstUserAppRole[]
  @@unique([orgId, appId, name])
  @@schema("app_quikasset")
}
```

- **`isSystem`** — guards the seeded `admin` role from rename/delete. It is **not** an admin bypass; an
  admin can act only because its role holds *every* `RolePermission` grant (see seeding below).
- **`isDefault`** — exactly one role per `(orgId, appId)` should carry this; new invitees are auto-bound
  to it.

### How it relates to identity/entitlement

- **`quikit.App`** — the registry; `AppRole.appId` points here (or, for a self-contained schema like
  QuikAsset's, `appId` is a plain string with no FK — additive, never touches shared tables).
- **`quikit.OrgAppAccess`** `(orgId, appId, enabled)` — the org's entitlement to the app.
- **`quikit.UserAppAccess`** `(userId, orgId, appId)` — the user's entitlement. **A user must have this
  row before an `AppRole` can be assigned** (enforced at assignment time — see below).

---

## Runtime permission resolution

The effective decision is **`role grants ∪ per-user extras`** — there is **no admin bypass** in the
engine. Reference: `apps/quiktrack/lib/api/permissions.ts` (`userCan`, lines 106–135):

```ts
export async function userCan(userId, orgId, resource, action): Promise<boolean> {
  if (!isResource(resource) || !isAction(action)) return false;   // validate against the registry
  const appId = await getAppId();                                 // cached App.id by slug
  // 1. role grant — via the UserAppRole → AppRole → RolePermission join
  const roleHit = await db.astRolePermission.findFirst({
    where: { resource, action, role: { appId, members: { some: { userId, orgId } } } },
  });
  if (roleHit) return true;
  // 2. per-user additive grant
  const extraHit = await db.astUserPermissionExtra.findFirst({
    where: { userId, orgId, resource, action },
  });
  return !!extraHit;
}
```

**Shared platform guards** (`packages/auth`):
- `createRequireAdmin(authOptions, { extraAdminCheck })` — checks `ROLE_HIERARCHY[membership.role] >=
  admin`, with an **`extraAdminCheck` escape hatch** so the app can promote a caller to admin from its
  *own* RBAC tables without the shared package knowing about them. Wire it in `lib/api/requireAdmin.ts`:
  ```ts
  export const requireAdmin = createRequireAdmin(authOptions, {
    extraAdminCheck: ({ userId, orgId }) => isQuikAssetAppAdmin(userId, orgId),
  });
  ```
- `createRequireSuperAdmin(...)` — pure `session.user.isSuperAdmin`.
- `packages/shared/lib/constants.ts` — `ROLE_HIERARCHY` (super_admin:6, admin/org_admin:5, app_admin:4,
  manager:3, member:2), `ADMIN_TIER_ROLES` (`{super_admin, org_admin, admin}`).

**Canonical predicates** to mirror in `lib/api/permissions.ts`:
- `isQuikAssetAppAdmin(userId, orgId)` — holds the v2 `admin` AppRole.
- `hasAdminAccess(userId, orgId)` — `OrgMember.role ∈ ADMIN_TIER_ROLES` **OR** app-admin via v2. Use
  this instead of scattered `role === "admin"` checks.

**Entitlement guard** (`packages/auth/app-access.ts`): `getAppAccess` / `requireAppAccess` resolve
"can this user open this app" — org must have `OrgAppAccess.enabled`; non-admins additionally need a
`UserAppAccess` row; expired per-app trials revoke access. This runs *before* any RBAC check.

**Client-side:** `app/api/me/permissions/route.ts` serves the effective set via
`loadMyPermissions(userId, orgId)`; the `useMyPermissions` hook (React Query, 5-min stale) exposes
`.has(resource, action)` and `.hasNav(navKey)`; the `RequirePerm` component gates client routes.

---

## The permission vocabulary — `lib/api/permissionsRegistry.ts`

This file is the **single source of truth** for an app's `(resource, action)` tree. Model it on
`apps/quiktrack/lib/api/permissionsRegistry.ts`:

```ts
export const ACTIONS = ["view", "create", "update", "delete"] as const;

export const PERMISSION_TREE: PermissionModule[] = [
  { module: "Inventory", leaves: [
    { resource: "Asset",       label: "Assets",       actions: ACTIONS },
    { resource: "Category",    label: "Categories",   actions: ACTIONS },
    { resource: "Assignment",  label: "Assignments",  actions: ACTIONS },
    { resource: "Repair",      label: "Repairs",      actions: ACTIONS },
    { resource: "Employee",    label: "Employees",    actions: ACTIONS },
    { resource: "FiscalBudget",label: "Budgets",      actions: ACTIONS },
    { resource: "Report",      label: "Reports",      actions: ["view"] },
  ]},
];

export const allPermissionPairs = flattenPermissions(PERMISSION_TREE); // every (resource, action)
export const isResource = (r: string) => /* r ∈ tree */;
export const isAction   = (a: string) => (ACTIONS as readonly string[]).includes(a);
export const isValidPermissionPair = (r, a) => isResource(r) && isAction(a);
```

`isResource`/`isAction`/`isValidPermissionPair` are the validators `userCan` and the role-edit API use
to reject garbage pairs — keep the registry in sync with your resources.

---

## Seeding default roles — `lib/api/seedAdminAppRole.ts`

Idempotent, minted **lazily** (the DB `seed*.ts` scripts do **not** create app roles). Mirror
QuikTrack's three-role setup:

| Seeder | Role | Flags | Grants |
|---|---|---|---|
| `seedAdminAppRole(orgId)` | `admin` | `isSystem:true` | **every** pair from `allPermissionPairs()` |
| `seedUserAppRole(orgId)` | `Member` | `isDefault:true` | `view` on every leaf + `update` on chosen resources |
| `seedAllDefaultRoles(orgId)` | orchestrator | — | seeds both + backfills (cached ~5 min/process) |

`ensureUserOnRole(userId, orgId, roleId)` — idempotent `AstUserAppRole` insert.

**Where seeding is triggered:**
1. `app/api/me/permissions/route.ts` — fires `seedAllDefaultRoles(orgId)` on first permission fetch; can
   self-bind a fresh org/super admin to `admin` if they hold no role.
2. `app/api/internal/provision-roles/route.ts` — **service-to-service** (`x-internal-secret`-guarded);
   called by the central invite/provision flow. Seeds roles + assigns `adminUserIds`. Register the app
   in `apps/quikit/lib/provisionAppRoles.ts` (`APP_URL_OVERRIDE`) so this fires on org grant.
3. `packages/auth/assign-app-roles.ts` — cross-app helper used by every invite flow; detects RBAC tables
   via `information_schema`, resolves role id by name, inserts `UserAppRole` via raw SQL (default `"Admin"`).

---

## Navigation → sidebar (`navKey`)

Modern apps **derive nav from `view` grants** rather than storing explicit `RoleNavigation` rows:

```ts
export const NAV_ITEMS = [];                       // pure-nav rows needing an explicit grant (usually empty)
export const ENTITY_TO_NAV = {                     // granting <entity>:view surfaces the sidebar row
  Asset: "inventory", Assignment: "assignments", Repair: "repairs", Report: "reports",
};
```

Resolver `userHasNav(userId, orgId, navKey)`: if the navKey maps to an entity → delegate to
`userCan(entity, "view")`; else require an explicit `AstRoleNavigation` row. The sidebar gates each row
with `perms.hasNav(key)` from `useMyPermissions`. Reserve `AstRoleNavigation` for nav that has **no**
backing entity `view`.

---

## Role & assignment APIs (mirror QuikTrack)

| Route | Method | Behavior |
|---|---|---|
| `app/api/org/roles/route.ts` | `GET` / `POST` | List roles (`_count` of permissions/members); create custom role (`isSystem:false`; enforce single `isDefault`). |
| `app/api/org/roles/[id]/permissions/route.ts` | `PUT` | **Atomic replace** of a role's grants — `deleteMany + createMany` in a transaction, filtered through `isValidPermissionPair`. |
| `app/api/org/roles/[id]/members/route.ts` | — | Manage role membership. |
| `app/api/org/users/[id]/role/route.ts` | `PUT` | Assign a role to a user. **Two guards below.** |

Two guards the assignment route **must** enforce (from QuikTrack `.../role/route.ts`):

1. **Entitlement precondition** — cannot assign an `AppRole` to a user with no `UserAppAccess` row:
   ```ts
   const access = await db.userAppAccess.findFirst({ where: { orgId, appId, userId } });
   if (!access) return 409 "This user does not have access to QuikAsset yet. Add them as a user first.";
   ```
2. **Admin-lockout guard** — refuse to remove the **last** holder of the `admin` role. Then
   `deleteMany` existing roles + `ensureUserOnRole` for the new one.

---

## Worked example — how the rows are actually stored

Scenario: org **MoreYeahs** onboards **QuikAsset**. **Ashwin** is an admin; **Priya** is a regular
member who is additionally allowed to edit assets. Below is the exact row-level state across the
**common (shared) `quikit` tables** and the **per-app `app_quikasset` RBAC tables**.

### Layer 1–2 — common/shared tables (schema `quikit`)

These are shared by every app; identity + entitlement live here. All ids are **cuid (text)**.

**`quikit.Org`** — the tenant
| id | name |
|---|---|
| `cmpgz253x0001…` | MoreYeahs |

**`quikit.App`** — the launcher registry (seeded by `seed-oauth.ts`)
| id | slug | name | baseUrl | status |
|---|---|---|---|---|
| `app_ast01…` | `quikasset` | QuikAsset | http://localhost:3012 | active |

**`quikit.OrgMember`** — platform membership (the coarse, org-wide role)
| orgId | userId | role |
|---|---|---|
| `cmpgz253x…` | `usr_ashwin…` | `org_admin` |
| `cmpgz253x…` | `usr_priya…` | `member` |

**`quikit.OrgAppAccess`** — does the **org** get QuikAsset? (makes the tile appear)
| orgId | appId | enabled |
|---|---|---|
| `cmpgz253x…` | `app_ast01…` | `true` |

**`quikit.UserAppAccess`** — may **this user** open QuikAsset? (precondition for any AppRole)
| userId | orgId | appId | role |
|---|---|---|---|
| `usr_ashwin…` | `cmpgz253x…` | `app_ast01…` | `member` |
| `usr_priya…` | `cmpgz253x…` | `app_ast01…` | `member` |

### Layer 3 — per-app RBAC tables (schema `app_quikasset`, models `Ast*`)

**`AstAppRole`** (`@@map("AppRole")`) — the named roles for `(orgId, appId)`, seeded by `seedAllDefaultRoles`
| id | orgId | appId | name | isSystem | isDefault |
|---|---|---|---|---|---|
| `role_admin…` | `cmpgz253x…` | `app_ast01…` | `admin` | `true` | `false` |
| `role_member…` | `cmpgz253x…` | `app_ast01…` | `Member` | `false` | `true` |

**`AstRolePermission`** (`@@map("RolePermission")`) — the flat `(roleId, resource, action)` grants.
`admin` holds **every** pair (that's why it's "all-powerful" — no bypass); `Member` holds only `view`:
| id | roleId | resource | action |
|---|---|---|---|
| … | `role_admin…` | `Asset` | `view` |
| … | `role_admin…` | `Asset` | `create` |
| … | `role_admin…` | `Asset` | `update` |
| … | `role_admin…` | `Asset` | `delete` |
| … | `role_admin…` | `Repair` | `create` |
| … | *(…every resource × every action…)* | | |
| … | `role_member…` | `Asset` | `view` |
| … | `role_member…` | `Repair` | `view` |
| … | `role_member…` | `Assignment` | `view` |

**`AstUserAppRole`** (`@@map("UserAppRole")`) — which role each user holds (the join to `AppRole`)
| id | userId | orgId | roleId |
|---|---|---|---|
| … | `usr_ashwin…` | `cmpgz253x…` | `role_admin…` |
| … | `usr_priya…` | `cmpgz253x…` | `role_member…` |

**`AstUserPermissionExtra`** (`@@map("UserPermissionExtra")`) — per-user **additive** grant, no role change.
Priya keeps the `Member` role but individually gains `Asset:update`:
| id | orgId | userId | resource | action |
|---|---|---|---|---|
| … | `cmpgz253x…` | `usr_priya…` | `Asset` | `update` |

**`AstRoleNavigation`** (`@@map("RoleNavigation")`) — usually **empty**: nav is derived from `<entity>:view`
grants via `ENTITY_TO_NAV`. Only add a row for a nav item with no backing entity `view`.

### How `userCan()` reads these rows

| Question | Rows consulted | Result |
|---|---|---|
| Can **Ashwin** delete an asset? (`Asset`,`delete`) | `AstRolePermission` join `AstUserAppRole` → `role_admin` has it | ✅ role grant |
| Can **Priya** view a repair? (`Repair`,`view`) | `role_member` has `Repair:view` | ✅ role grant |
| Can **Priya** update an asset? (`Asset`,`update`) | `role_member` does **not** have it → falls through to `AstUserPermissionExtra` → row exists | ✅ per-user extra |
| Can **Priya** delete an asset? (`Asset`,`delete`) | not in role, not in extras | ❌ denied |

Effective permission = **role grants (via `UserAppRole`) ∪ per-user extras**. Layers 1–2
(`OrgAppAccess` + `UserAppAccess`) are checked earlier by `requireAppAccess`, before `userCan` ever runs.

---

## How the three layers stack (end-to-end)

```
1. OrgAppAccess.enabled=true          → the org can use QuikAsset (launcher tile appears)
2. UserAppAccess row exists           → this user may open QuikAsset
3. UserAppRole → AstAppRole           → which role the user holds
4. AstRolePermission(resource,action) → what that role can do   ┐ union
5. AstUserPermissionExtra             → per-user additive grants ┘ = effective permission
```

`userCan()` evaluates 4 ∪ 5. Layers 1–2 are checked earlier by `requireAppAccess`. The `admin` role is
"all-powerful" only because it was seeded with every grant — not through any bypass.

---

## Wiring checklist for a new app

- [ ] Add the `<Prefix>*` RBAC models to `schema.prisma` under `app_<slug>` (already present for QuikAsset as `Ast*`).
- [ ] `lib/api/permissionsRegistry.ts` — `ACTIONS`, `PERMISSION_TREE`, `allPermissionPairs`, validators.
- [ ] `lib/api/permissions.ts` — `userCan`, `hasAdminAccess`, `is<App>AppAdmin`, `getAppId` (cached).
- [ ] `lib/api/requireAdmin.ts` — `createRequireAdmin(authOptions, { extraAdminCheck })`.
- [ ] `lib/api/seedAdminAppRole.ts` — `seedAdminAppRole` / `seedUserAppRole` / `seedAllDefaultRoles` / `ensureUserOnRole`.
- [ ] `app/api/me/permissions/route.ts` — serve effective set + lazy seed on first fetch.
- [ ] `app/api/internal/provision-roles/route.ts` — INTERNAL_SECRET-guarded service seed; register in `apps/quikit/lib/provisionAppRoles.ts`.
- [ ] `app/api/org/roles/**` + `app/api/org/users/[id]/role/route.ts` — role CRUD + assignment (with both guards).
- [ ] `useMyPermissions` hook + `RequirePerm` component + sidebar `hasNav` gating.

---

*Caveat: the header comments in the `permissions.ts` files reference `app_quikscale.*` even in
QuikTrack's copy — that comment is stale; the Prisma model names (`Qt*`, `Ast*`) are authoritative.*
