# Roles & Permissions — AppRole rename + auto-seed (2026-05-06)

Continuation of the `rolesAndPermissions.md` design. This doc captures the
post-merge changes needed to fit the new v4 schema layout (auth / quikit /
public / app_quikscale) and to make the admin role + grants work
auto-magically when QuikScale access is granted.

---

## 1. What changed and why

| Change | Reason |
|---|---|
| Renamed Prisma model `CustomRole` → **`AppRole`** | Match the actual DB table name `app_quikscale.AppRole` introduced by the v4 migration. The original `dynamic_roles` migration (which assumed `public.Tenant`) was incompatible with the user's new schema layout (`quikit.Org` / `quikit.App`), so the table was created via a custom migration with the new name. |
| Removed the `appRoleId` column from `quikit.UserAppAccess` and its prisma model | User's standing rule: *no new columns outside `app_quikscale`*. Cross-schema FK direction (public → app) is also fragile when production schemas diverge. |
| Added new model **`UserAppRole`** in `app_quikscale` | Replaces the removed `appRoleId` column. A standalone join table inside `app_quikscale` keeps the role-membership data in the same schema as the role catalogue. |
| Added auto-seed helper `lib/api/seedAdminAppRole.ts` | The Manage Permission UI was empty after the rename because the admin role had to be created manually. Now it self-seeds the first time any user is granted QuikScale access. |
| Wired auto-seed into `POST /api/org/users` | Creating a user from QuikScale now also (1) grants QuikScale `UserAppAccess`, (2) ensures the org has an admin AppRole + 48 RolePermissions + 14 RoleNavigations, and (3) assigns the new user to that admin role via UserAppRole. Single round-trip from the UI's perspective. |
| Rewrote `PATCH /api/org/users/[id]/role` | Used to update `UserAppAccess.appRoleId` (now removed). Now manages `UserAppRole` rows. Sending `roleId: "admin"` is a convenience — auto-seeds + assigns. |
| Rewrote `GET/PUT /api/org/roles/[id]/members` | Same migration: queries / mutations now go through `UserAppRole` instead of `UserAppAccess.appRoleId`. |
| Rewrote `lib/api/permissions.ts` (`userCan`, `userHasNav`, `loadMyPermissions`) | Reads through `UserAppRole.role` instead of the removed `UserAppAccess.appRole`. Behaviour unchanged for callers — same return shapes. |

---

## 2. Final schema (post-rename)

All four models live in `@@schema("app_quikscale")`. Cross-schema FKs only
go to `quikit.Org` and `quikit.App` (never to `public` or `auth`).

```prisma
model AppRole {                   // was CustomRole
  id          String   @id @default(cuid())
  orgId       String                                 // FK → quikit.Org.id
  appId       String                                 // FK → quikit.App.id
  name        String                                 // "admin", "Manager", …
  description String?
  isSystem    Boolean  @default(false)               // admin role = true → bypass
  isDefault   Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  createdBy   String?

  org         Org @relation(fields: [orgId], references: [id], onDelete: Cascade)
  app         App @relation(fields: [appId], references: [id], onDelete: Cascade)
  permissions RolePermission[]
  navigations RoleNavigation[]
  members     UserAppRole[]

  @@unique([orgId, appId, name])
  @@index([orgId, appId])
  @@schema("app_quikscale")
}

model RolePermission {            // unchanged shape, FK rename
  id       String  @id @default(cuid())
  roleId   String                                    // FK → AppRole.id
  resource String                                    // one of RESOURCES
  action   String                                    // create | update | delete | view
  role     AppRole @relation(fields: [roleId], references: [id], onDelete: Cascade)
  @@unique([roleId, resource, action])
  @@index([roleId])
  @@schema("app_quikscale")
}

model RoleNavigation {            // unchanged shape, FK rename
  id     String  @id @default(cuid())
  roleId String                                      // FK → AppRole.id
  navKey String                                      // one of NAV_KEYS
  role   AppRole @relation(fields: [roleId], references: [id], onDelete: Cascade)
  @@unique([roleId, navKey])
  @@index([roleId])
  @@schema("app_quikscale")
}

model UserAppRole {               // NEW — replaces UserAppAccess.appRoleId
  id         String   @id @default(cuid())
  userId     String                                  // refs auth.User.id (no FK constraint)
  orgId      String                                  // refs quikit.Org.id (no FK constraint)
  roleId     String                                  // FK → AppRole.id
  assignedAt DateTime @default(now())
  assignedBy String?
  role       AppRole  @relation(fields: [roleId], references: [id], onDelete: Cascade)
  @@unique([userId, orgId, roleId])
  @@index([userId, orgId])
  @@index([roleId])
  @@schema("app_quikscale")
}
```

`userId` and `orgId` are stored as plain strings (no Prisma `@relation`) because:

- `User` lives in the `auth` schema — its lifecycle is owned by NextAuth and we don't want a hard FK that breaks if NextAuth deletes a row.
- `Org` lives in the `quikit` schema — there's already a cross-schema FK from `AppRole.orgId` so the cascade-on-delete is covered through that path.

---

## 3. Auto-seed flow — what happens when a user is added

Sequence inside `POST /api/org/users`:

```
admin clicks "Add User" + role="admin" in QuikScale
       │
       ▼
1. db.user.create() OR look up existing → newUserId
2. db.orgMember.create({ orgId, userId: newUserId, role, status: "active" })
3. db.userAppAccess.create({ orgId, appId: QuikScale, userId: newUserId, role: "member" })
4. seedAdminAppRole(orgId)
       ├─ if missing: db.appRole.create({ name: "admin", isSystem: true })
       ├─ for every (resource × action) in permissionsRegistry: db.rolePermission.create()
       └─ for every navKey: db.roleNavigation.create()
5. ensureUserOnRole(newUserId, orgId, adminRoleId)
       └─ db.userAppRole.create({ userId, orgId, roleId })
6. respond { user, appRole: { id, name: "admin" } }
```

Steps 4 + 5 are **idempotent** — calling them twice is a no-op. So:

- The first user added to a fresh org pays the cost of seeding the admin role + 48 permissions + 14 nav entries (~60ms in dev).
- Every subsequent user just has step 5 do real work (one `INSERT` into `UserAppRole`).

### `seedAdminAppRole(orgId)` — what it does

| # | Action | Idempotent? |
|---|---|---|
| 1 | Look up the QuikScale App by slug; cache the id in-process. | yes |
| 2 | If `AppRole(orgId, appId, name="admin")` doesn't exist, create it with `isSystem=true`. | yes |
| 3 | For every `(resource, action)` in `RESOURCES × ACTIONS`: insert into `RolePermission` if missing. | yes |
| 4 | For every `navKey` in `NAV_KEYS`: insert into `RoleNavigation` if missing. | yes |
| 5 | Return the admin AppRole id. | — |

`RESOURCES`, `ACTIONS`, `NAV_KEYS` are imported from `@quikit/shared` —
adding a new resource or sidebar item there auto-grants admin on the next
seed run.

### `ensureUserOnRole(userId, orgId, roleId, assignedBy?)`

Single `findFirst` + `create` for `UserAppRole(userId, orgId, roleId)`.
Skips if the row already exists.

### Why `isSystem=true` on admin

The `userCan(...)` server gate has a fast-path: `if (isAdminRole(role))
return true`. That avoids querying `RolePermission` for admins entirely.
The 48 RolePermission rows are still seeded so the **Manage Permission
UI** can show admin's grid as fully ticked, and so removing the system
flag (legacy migration scenarios) doesn't silently break admin's access.

---

## 4. Files touched

| File | What |
|---|---|
| [`packages/database/prisma/schema.prisma`](../../packages/database/prisma/schema.prisma) | Renamed `CustomRole` → `AppRole`. Added `UserAppRole` model. Removed `appRoleId` column + relation from `UserAppAccess`. Removed the `members` back-relation from the old model. Updated the `Org.appRoles` and `App.appRoles` back-relations. |
| [`apps/quikscale/lib/api/seedAdminAppRole.ts`](./lib/api/seedAdminAppRole.ts) (new) | `seedAdminAppRole(orgId)` + `ensureUserOnRole(userId, orgId, roleId)` helpers. |
| [`apps/quikscale/app/api/org/users/route.ts`](./app/api/org/users/route.ts) | `GET` reads `UserAppRole` instead of `UserAppAccess.appRole`. `POST` auto-grants UserAppAccess + seeds admin role + assigns user. |
| [`apps/quikscale/app/api/org/users/[id]/role/route.ts`](./app/api/org/users/[id]/role/route.ts) | Rewritten to manage `UserAppRole` rows. `roleId: "admin"` triggers the auto-seed. |
| [`apps/quikscale/app/api/org/roles/[id]/members/route.ts`](./app/api/org/roles/[id]/members/route.ts) | `GET` reads `UserAppRole` for membership. `PUT` reconciles `UserAppRole` (insert/delete) instead of nulling `UserAppAccess.appRoleId`. Still skips users without QuikScale `UserAppAccess` and reports them. |
| [`apps/quikscale/lib/api/permissions.ts`](./lib/api/permissions.ts) | `userCan`, `userHasNav`, `loadMyPermissions` resolve role via `UserAppRole.role` rather than `UserAppAccess.appRole`. Same external API. |

No code references `CustomRole` or `customRole` any more (verified via grep).

---

## 5. One-time backfill

Existing orgs that were granted QuikScale before this code shipped wouldn't
have an admin role in their DB. The seed script
`packages/database/_seed_admin.mjs` (run once during the merge) walked
every `quikit.UserAppAccess` for QuikScale and ran `seedAdminAppRole` +
`ensureUserOnRole` for each.

Result on the dev DB: 1 org seeded (Moreyeahs), 1 user assigned (Ashwin):

```
AppRole(admin):    created  (isSystem=true)
RolePermission:    48 rows  (12 RESOURCES × 4 ACTIONS)
RoleNavigation:    14 rows  (1 per NAV_KEY)
UserAppRole:       1 row    (Ashwin → admin)
```

The script is intentionally not committed as a `prisma/seed-*.ts` because
it's a one-off; any future grant goes through the auto-seed in
`POST /api/org/users` instead.

---

## 6. Verification checklist

1. **Manage Permission UI** loads after fresh login — should show the **admin**
   role pinned at the top with every cell ticked (RolePermission grid) and every
   sidebar entry checked (RoleNavigation list).
2. **Users tab** lists Ashwin with role pill = "admin".
3. **Add User** flow — create a test user. After the modal closes, that user
   shows up in the Users tab already on the `admin` AppRole. No extra clicks
   needed in the role dropdown.
4. **`/api/me/permissions`** for Ashwin returns:
   ```json
   {
     "isAdmin": true,
     "roleId": "<admin-role-id>",
     "roleName": "admin",
     "permissions": ["WWW:create", "WWW:update", … ],   // 48 entries
     "navigation":  ["dashboard", "kpi.individual", … ] // 14 entries
   }
   ```
5. **`userCan(ashwin, moreyeahs, "KPI", "create")`** returns `true` instantly
   via the `isAdminRole` short-circuit (no `RolePermission` lookup).
6. **Delete the admin role** via the API — should be blocked because
   `isSystem=true`. (Existing guard already enforces this in
   `DELETE /api/org/roles/[id]`.)

---

## 7. Open follow-ups (not done in this pass)

- **OrgMember role sync.** The legacy `quikit.OrgMember.role` column (text:
  `super_admin` / `org_admin` / `member`) is still used by `requireAdmin()`
  in shared auth. It coexists with `UserAppRole` for now — we didn't want
  to retire it in the same change. Eventually the launcher's
  `requiresOrgAdmin` check should use the same dynamic-roles infra so
  there's one source of truth.
- **UI for assigning non-admin roles.** The Users dropdown currently sends
  `roleId` strings. The Manage Permission page can create new roles and
  edit their grid, but the per-user dropdown only knows about admin. A
  follow-up will hydrate the dropdown with every AppRole in the org.
- **Caching.** `seedAdminAppRole` does ~63 inserts on cold path. We could
  fold them into a single `$transaction` for atomicity but the current
  per-row approach keeps the code simple and the cost is paid once per org.
