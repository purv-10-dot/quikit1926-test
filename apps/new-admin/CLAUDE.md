# admin-next — App-Level Guidance

## Status

This folder was originally a standalone build (`quikadmin`) delivered as a
zip. It has been ported into the QuikIT monorepo as the candidate replacement
for `apps/admin`. The legacy `apps/admin` is **still live** and untouched —
do not modify it.

When admin-next is stable, the cutover plan is:

1. Delete `apps/admin`
2. Rename `apps/new-admin` → `apps/admin`

Until then, both apps must compile cleanly side by side.

## Architectural alignment (do not deviate)

This app follows the same conventions as `apps/admin`:

- **Auth**: `createOAuthClientOptions` / `createAuthOptions` from `@quikit/auth`
  in [lib/auth.ts](lib/auth.ts). Middleware uses `createMiddleware({ requireAdmin: true })`.
- **API wrapper**: `withAdminAuth` from [lib/api/withAdminAuth.ts](lib/api/withAdminAuth.ts).
  Uses the shared `createRequireAdmin` factory and writes `ApiCall` rows via
  shared `logApiCall` with `appSlug: "admin-next"`.
- **Session shape**: `{ id, email, orgId, membershipRole, isSuperAdmin? }` —
  same as every other app in the monorepo. **`tenantId` is the old standalone
  name and should not be reintroduced.** Back-compat aliases remain in
  `/api/org/select` and `/api/org/memberships` for one release.
- **Database**: real `@quikit/database` Prisma client. Models are `Org`,
  `OrgMember`, `Team`, `UserTeam`, `UserAppAccess`, `OrgAppAccess`, `App`,
  `AuditLog`, `ApiCall`, `AppModuleFlag`.
- **Cache**: `@quikit/redis` for raw get/set; `@quikit/auth/cache` `getOrSet`
  for typed memoization. Helpers wrapped in [lib/redis.ts](lib/redis.ts).
- **UI**: real `@quikit/ui` components (`Button`, `Input`, `Modal`, `Select`,
  `AppSwitcher`, `UserMenu`, `ConfirmProvider`, etc.). Do NOT recreate local
  copies of these.
- **Theming**: `@quikit/ui/styles` provides all CSS variables. Tailwind
  config extends `@quikit/ui/tailwind-config`.

## What's deferred

Several features in the standalone build depend on Prisma models that aren't
yet in the shared schema. See [MIGRATION_NOTES.md](MIGRATION_NOTES.md) for
the full list and migration plan. While those are deferred, the affected
routes return HTTP 501 so callers fail loudly rather than silently breaking.

Deferred routes:
- `/api/roles` and `/api/roles/[id]`
- `/api/permissions`
- `/api/v1/permissions/check`
- `/api/apps/[slug]/modules`
- `/api/launcher/sso-redirect`
- `/api/member/sso-redirect`

Deferred helpers (gutted to no-op):
- `lib/services/permissionCacheService.ts`
- `lib/roles-helpers.ts`
- `lib/teams-helpers.ts` (TeamApp parts)

## Port

`3007` (dev + start). `apps/admin` runs on `3002` (dev) and `3005` (start).

## Tech stack

| Layer | Version |
|---|---|
| Node | 22 LTS |
| Next.js | 14.0.4 (matches monorepo) |
| React | 18.2 (matches monorepo) |
| Tailwind | 3.4 (matches `@quikit/ui/tailwind-config`) |
| Vitest | 4.1 (matches monorepo) |
| Prisma | from `@quikit/database` workspace dep |

## Commands

Run from the monorepo root:
```bash
npm install                           # install workspaces (will pick up admin-next)
npm run dev --workspace=admin-next    # dev server on :3007
npm run typecheck --workspace=admin-next
turbo build --filter=admin-next
```

## Rollback

To revert: delete `apps/new-admin/`. `apps/admin/` is untouched and continues
to be the production admin portal until the user explicitly cuts over.
