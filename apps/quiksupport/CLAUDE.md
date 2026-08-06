# QuikSupport — App-Level Rules

QuikSupport is the **helpdesk/ticketing** app, integrated from the standalone
`helpdesk-mgt` project. Unlike the greenfield template apps, its UI was ported
wholesale and intentionally **preserves the original presentation** — so a few
template rules are relaxed here. Root `/CLAUDE.md` still applies for everything
not called out below.

## What's different about this app (read before editing)

- **UI is inline-styled + its own theme system** (`lib/themes.ts`: midnight /
  violet / ocean / forest), not `@quikit/ui` components or `accent-*` classes.
  This is deliberate — do **not** rewrite the helpdesk views to `@quikit/ui`.
  New cross-app chrome (app-switcher, sign-out) **does** use `@quikit/ui`
  (`components/shell/app-bar.tsx`).
- **Identity comes from the QuikIT session, not headers.** `lib/helpdesk-context.ts`
  reads `getServerSession(authOptions)` and auto-provisions the helpdesk's own
  records: `HdTenant.id = orgId`, `HdUser.external_id = session.user.id`.
  Membership role → helpdesk role only on first provision (admins →
  `HELPDESK_ADMIN`, else `CUSTOMER`). The in-app Users/Roles views own role
  changes after that (the second permission layer — like quiktrack).
- **Prisma compat adapter** in `lib/db.ts`: the ported code calls
  `prisma.user`, `prisma.ticket`, … which map to the prefixed `db.hdUser`,
  `db.hdTicket`, … delegates (schema `app_quiksupport`). **Inside an
  interactive `$transaction(async (tx) => …)` you must use the real names**
  (`tx.hdSlaConfig`, not `tx.slaConfig`) — the adapter only covers the
  top-level `prisma` object.
- **Domain models are `Hd*`-prefixed** and live in `app_quiksupport` in the
  shared `packages/database/prisma/schema.prisma`. `@@map` keeps the original
  snake_case table names. Never run an unscoped `prisma db push` against the
  shared DB (it surfaces drift in other apps' schemas) — push a schema scoped
  to `schemas = ["app_quiksupport"]` only.

## Two RBAC layers (how authorization is wired)

- **Domain layer (`Hd*`) — the primary in-app gate.** DB-touching helpdesk
  routes wrap their handler in **`withHelpdeskAuth`** (`lib/api/withHelpdeskAuth.ts`),
  which composes the platform-standard **`withOrgAuth`** (`lib/api/withOrgAuth.ts`,
  built on the `@quikit/auth` guard factory via `lib/api/getOrgId.ts`) and then
  resolves the `HdUser`. Handlers keep gating with `requireRole(user, …)` /
  `isAgentOrAbove(user)` against `HdUser.role`. Do NOT bypass `withHelpdeskAuth`
  on DB routes (only `/api/health`, `/api/auth/*`, `/api/internal/*` are exempt).
- **Standard layer (`Qsp*`) — the platform surface the admin portal reads.**
  Roles/permissions/navigation/user-role live in `app_quiksupport` `AppRole` /
  `RolePermission` / `RoleNavigation` / `UserAppRole` / `UserPermissionExtra`
  (Prisma `Qsp*`), seeded by `lib/seedAppRole.ts` (admin + Member) and provisioned
  via `/api/internal/provision-roles`. Resolve it with `userCan` / `loadMyPermissions`
  (`lib/api/permissions.ts`); vocabulary lives in `lib/api/permissionsRegistry.ts`.
  Manage it under **`/api/org/roles*`** + **`/api/org/users/[id]/role`** (admin-gated
  by `lib/api/requireAdmin.ts`); read the effective set at **`GET /api/me/permissions`**
  and on the client via `useMyPermissions()`. The launcher/admin portal read
  `app_quiksupport."AppRole"` (raw SQL) exactly as for quiktrack/quikscale.

## Still in force (from root + template)

- Provider order `SessionProvider → QueryClientProvider → ThemeProvider`.
- Middleware = `createMiddleware()` from `@quikit/auth/middleware` (no custom auth).
- Filter every Prisma query by tenant (`tenant_id`/`orgId`). API routes return
  `{ success, data }` / `{ success, error }`.
- Local-only dev. Never commit `.env.local`.
- Port **3010**; OAuth client id `quiksupport`.
