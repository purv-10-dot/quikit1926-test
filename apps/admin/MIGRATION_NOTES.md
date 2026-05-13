# admin-next — Migration Notes

This app was ported into the monorepo from a standalone build. A handful of
features in the standalone build depend on Prisma models that **do not yet
exist** in `packages/database/prisma/schema.prisma`. Those routes/helpers
are currently stubbed and return **HTTP 501 Not Implemented**.

This file documents exactly what would need to be added to the shared
schema to unlock those features.

## Deferred routes (currently return 501)

| Path | Depends on |
|---|---|
| `GET/POST /api/roles` | `AppRole`, `AppPermission`, `AppRolePermission` |
| `GET/PATCH/DELETE /api/roles/[id]` | `AppRole`, `AppRolePermission` |
| `GET /api/permissions` | `AppPermission` |
| `GET /api/v1/permissions/check` | `AppApiKey`, `UserAppRole`, `AppRolePermission` |
| `GET /api/apps/[slug]/modules` | `TenantApp` (or shared `OrgAppAccess` — see below) |
| `GET /api/apps/provisioned` | `TenantApp` (or shared `OrgAppAccess` — see below) |

## Deferred helpers (gutted to no-op)

| File | Reason |
|---|---|
| `lib/services/permissionCacheService.ts` | All ops touch `AppRolePermission` + `UserAppRole` |
| `lib/roles-helpers.ts` (`ensureSystemRoles`, `assignNamedRolesForAccess`) | Touches `AppRole`, `UserAppRole` |
| `lib/teams-helpers.ts` (TeamApp parts) | The team→app linking uses `TeamApp` |

## Migration path to unlock

### 1. Decide if existing `OrgAppAccess` covers the `TenantApp` use case

The standalone schema's `TenantApp` is logically identical to the shared
schema's `OrgAppAccess`:

```prisma
// standalone (apps/new-admin)
model TenantApp {
  id            String   @id @default(cuid())
  tenantId      String
  appId         String
  status        String   @default("active")
  provisionedAt DateTime @default(now())
  @@unique([tenantId, appId])
}

// shared (packages/database/prisma/schema.prisma)
model OrgAppAccess {
  id        String   @id @default(cuid())
  orgId     String
  appId     String
  enabled   Boolean  @default(true)
  reason    String?
  updatedBy String?
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())
  @@unique([orgId, appId])
}
```

Recommendation: **reuse `OrgAppAccess`** in admin-next. Update the
`/api/apps/[slug]/modules` and `/api/apps/provisioned` stubs to query
`db.orgAppAccess` directly instead of bringing in `TenantApp`.

### 2. Add the genuinely new RBAC tables to the shared schema

Append the following to `packages/database/prisma/schema.prisma` (and add
the inverse relation fields on `App`, `Org`, `Team`, `User` where noted):

```prisma
// ── ADMIN-NEXT — Per-app RBAC (deferred from standalone build) ───────────────
//
// All keyed on (orgId, appId). System roles ("Admin" / "User") are seeded
// per-(org, app) by ensureSystemRoles() in apps/new-admin/lib/roles-helpers.ts.
// Permission cache (10 min TTL) keyed at admin:perms:{orgId}:{userId}:{appId}.

model AppRole {
  id          String   @id @default(cuid())
  orgId       String
  appId       String
  name        String
  description String?
  isDefault   Boolean  @default(false)
  isSystem    Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  org         Org                 @relation(fields: [orgId], references: [id], onDelete: Cascade)
  app         App                 @relation(fields: [appId], references: [id], onDelete: Cascade)
  permissions AppRolePermission[]
  userRoles   UserAppRole[]

  @@unique([orgId, appId, name])
  @@index([orgId, appId])
  @@schema("quikit")
}

model AppPermission {
  id        String   @id @default(cuid())
  appId     String
  resource  String   // e.g. "kpis", "meetings"
  action    String   // e.g. "read", "write", "delete"
  label     String
  createdAt DateTime @default(now())

  app   App                 @relation(fields: [appId], references: [id], onDelete: Cascade)
  roles AppRolePermission[]

  @@unique([appId, resource, action])
  @@schema("quikit")
}

model AppRolePermission {
  roleId       String
  permissionId String

  role       AppRole       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission AppPermission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@id([roleId, permissionId])
  @@schema("quikit")
}

model UserAppRole {
  id        String   @id @default(cuid())
  orgId     String
  userId    String
  appId     String
  roleId    String
  createdAt DateTime @default(now())

  org    Org     @relation(fields: [orgId], references: [id], onDelete: Cascade)
  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  role   AppRole @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@unique([orgId, userId, appId])
  @@index([userId])
  @@index([orgId, appId])
  @@schema("quikit")
}

model AppApiKey {
  id        String    @id @default(cuid())
  keyHash   String    @unique
  orgId     String
  appId     String
  isActive  Boolean   @default(true)
  expiresAt DateTime?
  createdAt DateTime  @default(now())

  org Org @relation(fields: [orgId], references: [id], onDelete: Cascade)
  app App @relation(fields: [appId], references: [id], onDelete: Cascade)

  @@index([orgId])
  @@schema("quikit")
}

model TeamApp {
  id     String @id @default(cuid())
  orgId  String
  teamId String
  appId  String

  team Team @relation(fields: [teamId], references: [id], onDelete: Cascade)
  app  App  @relation(fields: [appId], references: [id], onDelete: Cascade)

  @@unique([teamId, appId])
  @@index([teamId])
  @@schema("public")
}
```

Inverse relation fields to add on existing models:

```prisma
// model App {
//   ... existing ...
//   appRoles       AppRole[]
//   appPermissions AppPermission[]
//   userAppRoles   UserAppRole[]
//   apiKeys        AppApiKey[]
//   teamApps       TeamApp[]
// }

// model Org {
//   ... existing ...
//   appRoles     AppRole[]
//   userAppRoles UserAppRole[]
//   apiKeys      AppApiKey[]
// }

// model User {
//   ... existing ...
//   userAppRoles UserAppRole[]
// }

// model Team {
//   ... existing ...
//   teamApps TeamApp[]
// }
```

### 3. Generate + apply the migration

```bash
npm run db:migrate         # interactive — name it e.g. "add-admin-next-rbac"
npm run db:generate        # regenerate the Prisma client
```

### 4. Un-stub the routes

In each of the deferred routes, replace the 501 stub body with the original
implementation. Search for `// DEFERRED: pending schema migration` markers
to find them.

### 5. Adjust schema-references in helpers

- `lib/services/permissionCacheService.ts` — uncomment original body
- `lib/roles-helpers.ts` — uncomment original body
- `lib/teams-helpers.ts` — re-enable the TeamApp linking inside
  `formatTeam()` and the POST /api/teams transaction
