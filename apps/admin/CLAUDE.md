# admin — App-Level Guidance

## What this app is

The Organisation Management Portal for the QuikIT platform — one admin
portal per organisation, used by Org Admins to manage Members, Teams,
Apps, Roles, Audit Log, and Settings across every QuikIT app (QuikScale,
QuikSocial, QuikTrack, …).

This folder replaces the previous standalone admin build; the cutover
happened on 2026-05-13. If you need to recover anything from the old
admin code, it's in git history under the same `apps/admin/` path.

## Architectural alignment (do not deviate)

- **Auth**: `createOAuthClientOptions` / `createAuthOptions` from
  `@quikit/auth` in [lib/auth.ts](lib/auth.ts). Middleware uses
  `createMiddleware({ requireAdmin: true })`.
- **API wrapper**: `withAdminAuth` from
  [lib/api/withAdminAuth.ts](lib/api/withAdminAuth.ts). Uses the shared
  `createRequireAdmin` factory and writes `ApiCall` rows via shared
  `logApiCall` with `appSlug: "admin"`.
- **Session shape**: `{ id, email, orgId, membershipRole, isSuperAdmin? }`
  — same as every other app in the monorepo.
- **Database**: real `@quikit/database` Prisma client. Models are
  `Org`, `OrgMember`, `Team`, `UserTeam`, `UserAppAccess`, `OrgAppAccess`,
  `App`, `AuditLog`, `ApiCall`, `AppModuleFlag`.
- **Cache**: `@quikit/redis` for raw get/set; `@quikit/auth/cache`
  `getOrSet` for typed memoization. Helpers wrapped in
  [lib/redis.ts](lib/redis.ts).
- **UI**: real `@quikit/ui` components (`Button`, `Input`, `Modal`,
  `Select`, `AppSwitcher`, `UserMenu`, `ConfirmProvider`, …). Don't
  recreate local copies.
- **Theming**: `@quikit/ui/styles` provides all CSS variables. Tailwind
  config extends `@quikit/ui/tailwind-config`.

## Invitation flow

Mirrors the QuikIT super-admin's first-Org-Admin invite. The POST
`/api/members` handler accepts `inviteMethod: "sso" | "native"`:

- **SSO** — `classifySsoProviderAsync(email)` from
  `@quikit/shared/sso-domain-server` resolves Google/Microsoft (or
  MX-validated). Stores `inviteProvider` on `OrgMember`. No password
  seeded. On first sign-in, `@quikit/auth`'s shared jwt callback
  auto-accepts pending SSO invites.
- **Native** — User row seeded with `bcrypt(generateTempPassword())` from `@quikit/shared/temp-password`. Plaintext is emailed to the invitee AND returned in the API response so the inviting admin can display it once
  + `mustChangePassword=true`. The Set-Password screen fires on first
  login (BR-008). Invitation link points at `/invitations/setup?token=…`.

Email is sent through [lib/email.ts](lib/email.ts) `sendOnboardingInvitationEmail`,
which renders the canonical template from `@quikit/shared` (`renderInvitationEmail`)
and retries up to 3× via `@quikit/shared/sendWithRetry` (FRD §7).

## Per-app roles (System Role dropdown)

`/api/roles?appSlug=…` reads from `app_<slug>."AppRole"` via raw SQL
(`Prisma.sql` for safety; orgId parameterised). Behaviour:

- Table exists → return its `name` rows for the caller's `orgId`
- Table missing → return `[]` (dropdown stays empty)

No static fallback. See [MIGRATION_NOTES.md](MIGRATION_NOTES.md) for
the shared-schema RBAC migration that would unlock additional features
(custom roles, permissions, external `/api/v1/permissions/check`).

## What's deferred

A handful of routes return HTTP 501 until the shared schema gains the
per-app RBAC tables (`AppRole`, `AppPermission`, `AppRolePermission`,
`UserAppRole`, `AppApiKey`, `TeamApp`). See
[MIGRATION_NOTES.md](MIGRATION_NOTES.md) for the full list and the
SQL/Prisma migration steps needed to enable them.

Deferred routes:
- `/api/permissions`
- `/api/v1/permissions/check`
- `/api/apps/[slug]/modules`
- `/api/launcher/sso-redirect`
- `/api/member/sso-redirect`
- `POST /api/roles` (creating custom roles; listing works against
  whatever per-app schemas already exist)

Deferred helpers (gutted to no-op):
- [lib/services/permissionCacheService.ts](lib/services/permissionCacheService.ts)
- [lib/roles-helpers.ts](lib/roles-helpers.ts)
- [lib/teams-helpers.ts](lib/teams-helpers.ts) (TeamApp parts)

## Ports

| | Port |
|---|---|
| `npm run dev` | **3002** |
| `npm run start` | **3005** |

Same ports the legacy admin used; the QuikIT IdP has the OAuth callback
registered for `http://localhost:3002/api/auth/callback/quikit`, so no
IdP-side change is required.

## Tech stack

| Layer | Version |
|---|---|
| Node | 22 LTS |
| Next.js | 14.0.4 |
| React | 18.2 |
| Tailwind | 3.4 (extends `@quikit/ui/tailwind-config`) |
| Vitest | 4.1 |
| Prisma | via `@quikit/database` workspace dep |

## Commands

```bash
# From monorepo root
npm install                           # picks up the renamed workspace
npm run dev                           # boots all apps via turbo
npm run dev --workspace=admin         # admin only, on :3002
npm run typecheck --workspace=admin
turbo build --filter=admin
```
