# Login, Roles, Architecture & Tech Stack — Flow Documentation

> **Status:** Reference document. Describes the **current implementation** of
> authentication, the two role systems (organization **membership roles** and
> per-app **in-app roles**), the platform architecture, and the tech stack.
>
> **Scope:** Only what exists in the codebase today. Items that currently
> return HTTP 501 are listed explicitly as **deferred** because that is their
> present behavior.

---

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [Tech stack](#2-tech-stack)
3. [The two role systems at a glance](#3-the-two-role-systems-at-a-glance)
4. [Membership roles (organization-wide)](#4-membership-roles-organization-wide)
5. [In-app roles (per-app RBAC)](#5-in-app-roles-per-app-rbac)
6. [Login / authentication flow](#6-login--authentication-flow)
7. [Session model (JWT + Redis)](#7-session-model-jwt--redis)
8. [Role resolution & access-gating flow](#8-role-resolution--access-gating-flow)
9. [Middleware enforcement](#9-middleware-enforcement)
10. [End-to-end flow diagrams](#10-end-to-end-flow-diagrams)
11. [File reference](#11-file-reference)

---

## 1. Architecture overview

QuikIT is a **Turborepo monorepo** of 9 Next.js (App Router) applications that
share a set of `@quikit/*` packages. One app — the **launcher (quikit)** — also
acts as the **central OpenID Provider (IdP)**; the **auth app** is the central
credentials host. All other apps are OAuth/OIDC **clients** of the launcher.

```
                         ┌─────────────────────────────────────────────┐
                         │  packages/  (shared, every app depends on)    │
                         │   @quikit/auth      NextAuth factories, RBAC  │
                         │   @quikit/database  Prisma client + schema    │
                         │   @quikit/shared    ROLES, constants, utils   │
                         │   @quikit/ui        SignInComponent, UI kit    │
                         │   @quikit/redis     session + cache client     │
                         └───────────────────────┬─────────────────────┘
                                                 │ consumed by
   ┌───────────────┬───────────────┬────────────┼───────────┬───────────────┐
   ▼               ▼               ▼            ▼           ▼               ▼
 quikit(3000)   auth(3001)     admin(3002)  quikscale   quiktrack       quikinfra
 launcher       central creds  org portal   (3003)      (3004)          (3006)
 + OIDC IdP     login host                                              (own Cn* RBAC)
   │                                          quikvc(3005)  quiksocial(3007)  Quikcrm(3008)
   │
   └── OIDC endpoints: /api/oauth/{authorize,token,userinfo,jwks},
                       /.well-known/openid-configuration
```

**Dual auth-config path (per app).** Each app's `lib/auth.ts` chooses its
NextAuth configuration at runtime
([apps/quikscale/lib/auth.ts:17-27](QuikIT_New/apps/quikscale/lib/auth.ts#L17-L27)):

```ts
export const authOptions =
  QUIKIT_URL && QUIKIT_CLIENT_ID && QUIKIT_CLIENT_SECRET
    ? createOAuthClientOptions({ quikitUrl: QUIKIT_URL, clientId, clientSecret }) // OIDC client
    : createAuthOptions({ signInPage: "/login", errorPage: "/login" });          // direct credentials
```

- With `QUIKIT_URL` + client creds → the app authenticates **through the
  launcher IdP** (production model).
- Without them → the app falls back to the **direct credentials** provider
  (used in local dev / migration).

Both factories live in [packages/auth/index.ts](QuikIT_New/packages/auth/index.ts)
(`createAuthOptions` and `createOAuthClientOptions`).

---

## 2. Tech stack

Verified from `package.json` manifests.

| Layer | Technology | Version / notes |
|---|---|---|
| Monorepo | **Turborepo** + npm workspaces | `turbo ^2.0.0`, `npm@11.11.1`; workspaces `packages/*`, `apps/*` |
| Framework | **Next.js** (App Router) | `14.0.4` |
| Language | **TypeScript** | `^5.3.3` |
| UI runtime | **React** | pinned **18.3.1** via root `overrides` |
| Auth | **NextAuth** | `^4.24.0` (JWT strategy) |
| Auth crypto | **bcrypt** (passwords), **jose** (OIDC id_token / handoff tokens RS256/HS256) | in `@quikit/auth` / launcher `lib/oauth.ts` |
| ORM / DB | **Prisma** → **PostgreSQL** | client in `@quikit/database`; multi-schema (`quikit`, `app_quikscale`, …) |
| Cache / sessions | **Redis** (ioredis) | via `@quikit/redis`; `REDIS_URL` (optional, in-memory fallback) |
| Server state | **TanStack React Query** | `^5.28.0` (`staleTime: 60s`) |
| Client state | **Redux Toolkit** + react-redux | `^2.12.0` (quikscale: table prefs) |
| Styling | **Tailwind CSS** | `^3.4.1`, extends `@quikit/ui/tailwind-config` |
| Theme | **next-themes** | `^0.2.1` (`attribute="class"`, `defaultTheme="light"`) |
| Validation | **Zod** | `^3.22.4` |
| Monitoring | **Sentry** | `@sentry/nextjs ^10.x` |
| Tests | **Vitest** + **Playwright** | unit/API + E2E |

> **Per-app variance:** quikinfra uses **pnpm**, **Prisma 5.22**, a `src/` layout,
> and its own `Cn*` RBAC tables (see [§5](#5-in-app-roles-per-app-rbac)). admin
> runs Next `14.0.4` / React `18.2` on ports **3002 (dev) / 3005 (start)**.

---

## 3. The two role systems at a glance

There are **two independent role layers**. A logged-in user is gated by both.

| | **Membership roles** | **In-app roles (RBAC)** |
|---|---|---|
| **Scope** | Organization-wide | Per-app, per-org |
| **Stored on** | `OrgMember.role` (+ `User.isSuperAdmin`) | `AppRole` / `UserAppRole` / `RolePermission` (per-app schema) |
| **Value space** | Fixed: `super_admin`, `org_admin`, `app_admin`, `member` (+ legacy) | App-defined roles → granular `(resource, action)` grants |
| **Carried in session** | `session.user.membershipRole`, `isSuperAdmin` | Not in the JWT — resolved per-app from the DB |
| **Defined in** | `@quikit/shared` constants | per-app schemas + per-app `lib` |
| **Used for** | App visibility, admin-portal access, super-admin gating | Fine-grained "can this user do X in this app" |

There is also a middle layer: **`UserAppAccess`** (org → app grant) — "can this
user see/launch this app at all," with a simple `role` string (default
`"member"`), separate from the granular per-app RBAC.

---

## 4. Membership roles (organization-wide)

### 4.1 Canonical constants

All defined in [packages/shared/lib/constants.ts](QuikIT_New/packages/shared/lib/constants.ts).

**v4 membership roles** (current standard, [constants.ts:63-68](QuikIT_New/packages/shared/lib/constants.ts#L63-L68)):

```ts
MEMBERSHIP_ROLES = {
  SUPER_ADMIN: "super_admin",  // platform-wide (also User.isSuperAdmin = true)
  ORG_ADMIN:   "org_admin",    // organization owner; admin-tier apps
  APP_ADMIN:   "app_admin",    // admin authority scoped to specific apps
  MEMBER:      "member",       // default
}
```

**Legacy roles** (still present for backward-compat,
[constants.ts:1-8](QuikIT_New/packages/shared/lib/constants.ts#L1-L8)):
`super_admin`, `admin`, `executive`, `manager`, `employee`, `coach`.

**ROLE_HIERARCHY** — numeric levels merging v4 + legacy
([constants.ts:12-30](QuikIT_New/packages/shared/lib/constants.ts#L12-L30)):

| Role | Level |
|---|---|
| `super_admin` | 6 |
| `admin`, `org_admin` | 5 |
| `app_admin`, `executive` | 4 |
| `manager` | 3 |
| `member`, `employee` | 2 |
| `coach` | 1 |

**ADMIN_TIER_ROLES** — who may access admin-tier apps (`App.requiresOrgAdmin =
true`), [constants.ts:84-88](QuikIT_New/packages/shared/lib/constants.ts#L84-L88):
`super_admin`, `org_admin`, and legacy `admin`. (`app_admin` and `member` do not
pass.)

### 4.2 Where roles are stored

**`OrgMember`** ([schema.prisma:419](QuikIT_New/packages/database/prisma/schema.prisma#L419)):

```prisma
model OrgMember {
  orgId, userId
  role            String     // membership role string
  status          String  @default("active")   // active|invited|inactive|declined|pending
  inviteAppIds    String[]   // apps to grant on accept
  inviteMethod    String?    // "sso" | "native"
  invitationToken String? @unique
  ...
}
```

`MEMBERSHIP_STATUS` values: `active`, `invited`, `inactive`, `declined`,
`pending` ([constants.ts:41-47](QuikIT_New/packages/shared/lib/constants.ts#L41-L47)).

**`User.isSuperAdmin`** ([schema.prisma:281](QuikIT_New/packages/database/prisma/schema.prisma#L281)) —
a boolean column; the platform-wide super-admin flag.

**`UserAppAccess`** ([schema.prisma:102](QuikIT_New/packages/database/prisma/schema.prisma#L102)) —
the org→app grant (`@@unique([userId, orgId, appId])`, `role` default `"member"`).

### 4.3 How membership roles reach the session

The JWT/session callbacks in `createAuthOptions` set `token.orgId`,
`token.membershipRole` (from the user's first active `OrgMember`), and
`token.isSuperAdmin`; the session callback maps them onto `session.user`
(shape in [packages/auth/types.ts](QuikIT_New/packages/auth/types.ts)). For
consumer apps, these arrive via the OIDC id_token / cross-domain handoff
(see [§6](#6-login--authentication-flow)).

### 4.4 Guards

- **`createRequireAdmin`** (`@quikit/auth`) — loads the active `OrgMember` and
  compares `ROLE_HIERARCHY[role]` against the `admin` level (5). Accepts an
  optional `extraAdminCheck` callback for app-specific elevation (e.g. an
  app-RBAC admin). Returns `{ session, userId, orgId, membership }` or a 403.
- **`createRequireSuperAdmin`** (`@quikit/auth`) — checks only
  `session.user.isSuperAdmin`.
- Apps wrap these in thin `lib/api/` files (e.g.
  `apps/admin/lib/api/requireAdmin.ts`, `withAdminAuth.ts`).

---

## 5. In-app roles (per-app RBAC)

Each product app owns its RBAC tables in its **own Postgres schema**, so role
definitions never collide across apps. The `App` model links to several per-app
role namespaces ([schema.prisma:27-30](QuikIT_New/packages/database/prisma/schema.prisma#L27-L30)):
`AppRole` (schema `app_quikscale`), `QtAppRole`, `CnAppRole` (quikinfra),
`QsAppRole`.

### 5.1 The role tables (schema `app_quikscale`)

```prisma
AppRole        { orgId, appId, name, isSystem, isDefault, ... }   // @@unique([orgId, appId, name])
UserAppRole    { userId, orgId, roleId → AppRole }                 // @@unique([userId, orgId, roleId])
RolePermission { roleId → AppRole, resource, action }             // @@unique([roleId, resource, action])
RoleNavigation { roleId → AppRole, navKey }                       // sidebar visibility
UserPermissionExtra { orgId, userId, resource, action }           // additive per-user grant
```

([schema.prisma:775-848](QuikIT_New/packages/database/prisma/schema.prisma#L775-L848))

- **`AppRole`** — per-org, per-app roles. `isSystem` protects the seeded
  `admin` role; `isDefault` marks the role auto-assigned to new users.
- **`RolePermission`** — granular `(resource, action)` grants, e.g.
  `("KPI", "create")`, `("OPSP.History.EditFinalize", "update")`.
- **`UserPermissionExtra`** — additive grants applied on top of the role.

### 5.2 QuikScale RBAC (live)

- Permission check: `userCan(userId, orgId, resource, action)` in
  `apps/quikscale/lib/api/permissions.ts` — true if a `RolePermission` (via the
  user's `UserAppRole`) **or** a `UserPermissionExtra` grants it.
- Seeding: `seedAllDefaultRoles(orgId)` in
  `apps/quikscale/lib/api/seedAdminAppRole.ts` seeds the system **`admin`** role
  (all permissions) and the default **`Member`** role (curated KPI/Priority/WWW
  CRUD + dashboard view).

### 5.3 QuikInfra RBAC (live, self-contained)

quikinfra has its own RBAC under `apps/quikinfra/src/lib/rbac/` + `src/lib/auth/context.ts`:

- **Role keys:** `super_admin`, `admin`, `ho_user`, `site_admin`, `user`.
- **Permission keys:** `construction.<domain>.<action>` (e.g. `boq.read`,
  `dpr.approve`, `purchase.indent.approve_l2`).
- **Gate:** `requirePermission("construction.<domain>.<action>")` returns a
  `TenantContext` (`{ userId, orgId, roleKey, permissions: Set<string>, … }`) or
  a `NextResponse`. `hasPermission` is true when `permissions` has `"*"` or the
  exact key.
- Permissions resolve from `Cn*` tables (`CnUserAppRole` → `CnAppRole` →
  `CnRolePermissionV2`), with per-user `CnUserPermissionExtra` (additive +
  `revoke`). If those tables are absent, it falls back to mapping the central
  `membershipRole` to an in-code `ROLE_DEFINITIONS` map.

### 5.4 Admin portal roles

- **`GET /api/roles?appSlug=<slug>`** (live) — reads `app_<slug>."AppRole"` via
  parameterized raw SQL (`appSlug` validated against `/^[a-z0-9_-]+$/`). If the
  table doesn't exist, returns `[]`.
- **Deferred (currently return HTTP 501)**, per `apps/admin/MIGRATION_NOTES.md`:
  `POST /api/roles` (create custom role), `/api/roles/[id]` (PATCH/DELETE),
  `/api/permissions`, `/api/v1/permissions/check`, `/api/apps/[slug]/modules`,
  `/api/apps/provisioned`. These await the shared-schema RBAC migration.

### 5.5 Eager role provisioning

When a super-admin creates an org or grants app access, the launcher fans out to
each app's `/api/internal/provision-roles` (guarded by `INTERNAL_SECRET`) to seed
that app's system/default roles and assign admins — `provisionAppRoles()` in
[apps/quikit/lib/provisionAppRoles.ts](QuikIT_New/apps/quikit/lib/provisionAppRoles.ts).
Triggered from `POST /api/super/orgs` and `POST /api/super/org-app-access`.

---

## 6. Login / authentication flow

### 6.1 Providers (central auth)

`createAuthOptions` configures, in `apps/auth`:

- **Credentials** — email + password, `bcrypt.compare`. Returns
  `{ id, email, name, isSuperAdmin }`.
- **Google OAuth** — enabled when `GOOGLE_CLIENT_ID`/`SECRET` set
  (`prompt: "select_account"`; captures given/family name for prefill).
- **Microsoft / Azure AD** — enabled when `MICROSOFT_CLIENT_ID`/`SECRET` set
  (`MICROSOFT_TENANT_ID`, default `"common"`).

### 6.2 Consumer apps (OIDC client)

`createOAuthClientOptions` registers a single `"quikit"` OAuth provider that
discovers `${QUIKIT_URL}/.well-known/openid-configuration`, scopes
`openid profile email tenant`, and maps the id_token to the session
(`id=sub, email, name, orgId=tenant_id, membershipRole=role, sessionId`).

The launcher's IdP endpoints (in `apps/quikit/app/api/oauth/`):

| Endpoint | Purpose |
|---|---|
| `/.well-known/openid-configuration` | Discovery metadata (issuer = `NEXTAUTH_URL`) |
| `/api/oauth/authorize` | Validates `client_id`/`redirect_uri`, checks session + `UserAppAccess`, issues a 10-min auth code (with `sessionId`, PKCE-aware) |
| `/api/oauth/token` | Exchanges code (or refresh token) → opaque `access_token` (`qk_…`) + RS256 `id_token` + `refresh_token` (`qkr_…`) |
| `/api/oauth/userinfo` | Bearer-token → OIDC claims |
| `/api/oauth/jwks` | RS256 public key (`JWT_SIGNING_KEY[_PUBLIC]`) |

### 6.3 Entry paths (current)

1. **Central credentials login** — `apps/auth/app/login/page.tsx` renders the
   shared **`SignInComponent`** (`packages/ui/components/sign-in.tsx`): email +
   password → `signIn("credentials")`.
2. **Profile completion** — first sign-in without a name → PATCH
   `/api/auth/me/profile` (OAuth prefill values pre-populate the form, read from
   the `oauth-prefill:*` Redis key).
3. **Forgot password / temp password** — `POST /api/auth/forgot-password` issues
   a temporary password (bcrypt-hashed) + sets `mustChangePassword`; user signs
   in with it, then `POST /api/auth/me/set-password` (policy: ≥8 chars, 1 upper,
   1 digit, 1 special) sets the real password.
4. **Invitation auto-accept** — in the `signIn`/`jwt` callbacks, pending
   `OrgMember` rows (`status="invited"`) are promoted to `active` and matching
   `UserAppAccess` rows created. SSO invites accept on first SSO login; native
   invites accept after the credentials sign-in.
5. **Cross-domain handoff** — see [§7.2](#72-cross-domain-handoff).

---

## 7. Session model (JWT + Redis)

### 7.1 JWT strategy + claims

NextAuth uses the **JWT strategy** (cookie `next-auth.session-token`). Claim
shape is augmented in [packages/auth/types.ts](QuikIT_New/packages/auth/types.ts):
`id, email, firstName, lastName, orgId, membershipRole, membershipInvalid,
isSuperAdmin, sessionId, sessionTouchedAt, sessionCheckedAt` (+ impersonation
and `actingAs` principal claims).

On the `jwt` callback:
- **Initial sign-in** mints a Redis session id via
  `createAuthSession(userId, 30d)` and stores it as `token.sessionId`; selects
  the first active membership into `orgId`/`membershipRole`.
- **On refresh** it throttles a Redis liveness check (~every 30s) via
  `isAuthSessionActive`, re-validates membership (~every 5 min), and extends the
  Redis TTL via `touchAuthSession`.

### 7.2 Cross-domain handoff

Because cookies don't cross hosts, sign-in on the auth host bridges to other
apps via [`/api/post-login`](QuikIT_New/apps/auth/app/api/post-login/route.ts):
it mints a **120-second HS256 token** signed with `INTERNAL_SECRET` (carrying
`sub, orgId, membershipRole, isSuperAdmin, email, name, sessionId, to`) and
redirects to `${target}/auth-handoff?token=…`, where the target app verifies it
and sets its own host-scoped session cookie. The return origin must be in the
`AUTH_ALLOWED_RETURN_ORIGINS` allow-list ([post-login/route.ts:40-63](QuikIT_New/apps/auth/app/api/post-login/route.ts#L40-L63)).

### 7.3 Soft revocation

The session id is the soft-revocation handle (`auth:session:{sessionId}` in
Redis, [packages/auth/session-store.ts](QuikIT_New/packages/auth/session-store.ts)).
`verifyJWT` ([packages/auth/jwt.ts:10-19](QuikIT_New/packages/auth/jwt.ts#L10-L19))
returns `null` if the session key is gone. The central
`/api/verify-token` ([apps/auth/app/api/verify-token/route.ts](QuikIT_New/apps/auth/app/api/verify-token/route.ts))
lets consumer apps' middleware validate a JWT server-to-server (gated by
`x-internal-secret`) and touch its TTL. Global signout
(`/api/auth/signout-global`) clears cookies across hosts and revokes the Redis
session.

> Note: soft revocation only takes effect where the JWT carries a `sessionId`
> and Redis is reachable; `isAuthSessionActive` fails **open** (treats the
> session as active) when Redis is down.

---

## 8. Role resolution & access-gating flow

A request is gated by up to **three** independent checks, in this order:

```
 1. SESSION / MEMBERSHIP  (org-wide)
      session.user.{id, orgId, membershipRole, isSuperAdmin}
      ├─ requireSuperAdmin → must have isSuperAdmin
      └─ requireAdmin      → ROLE_HIERARCHY[membershipRole] ≥ ROLE_HIERARCHY["admin"](5)
                             (+ optional extraAdminCheck)

 2. APP ACCESS  (org → app)
      UserAppAccess(userId, orgId, appId) row present?
      ├─ enforced at OIDC /authorize (launcher) and the launcher tile grid
      └─ optionally re-checked per request via createGetOrgId({ appSlug })
                                           → appAccess:{userId}:{orgId}:{appSlug} (60s cache)

 3. IN-APP PERMISSION  (fine-grained, per app)
      quikscale: userCan(userId, orgId, resource, action)
                  = RolePermission(role grants) OR UserPermissionExtra(additive)
      quikinfra: requirePermission("construction.<domain>.<action>")
                  = ctx.permissions.has("*") || ctx.permissions.has(key)
```

Separately, **module gating** (feature flags) can hide whole modules per tenant
before the permission check runs — `gateModuleRoute` / `gateModuleApi` from
`@quikit/auth/feature-gate` (see the cache doc for the caching of these).

---

## 9. Middleware enforcement

Every app uses `createMiddleware()` from `@quikit/auth/middleware`. Relevant
config (per app): `loginRoute`, `publicRoutes`, `superAdminRoutes`,
`requireSuperAdmin`, `requireAdmin`, `centralLoginUrl`, `centralSelectOrgUrl`.

In order, the factory:
1. Lets `publicRoutes` through (e.g. `/`, `/login`, `/auth-handoff`).
2. (When `centralLoginUrl` + `INTERNAL_SECRET` set) **remote-validates** the JWT
   against `/api/verify-token`; on failure redirects to the central login with
   `reason=session_expired` and clears cookies.
3. Bounces unauthenticated users to the central/local login carrying
   `callbackUrl`.
4. Enforces `requireSuperAdmin` (checks `token.isSuperAdmin`) and `requireAdmin`
   (checks `token.membershipRole` against `ADMIN_TIER_ROLES`).
5. Sends membership-invalid / no-org users to the org selector
   (`centralSelectOrgUrl` = launcher `/apps`), with super-admins exempt on
   `superAdminRoutes`.

---

## 10. End-to-end flow diagrams

### 10.1 Login → session → app (OIDC client app)

```
 User → consumer app protected route
   middleware: no session → redirect ${NEXT_PUBLIC_AUTH_URL}/login?callbackUrl=…
   auth app: SignInComponent → signIn("credentials") → bcrypt OK
       jwt callback: createAuthSession() → token.sessionId; pick first active OrgMember → orgId/role
   redirect callback / post-login bridge:
       mint 120s HS256 (INTERNAL_SECRET) {sub, orgId, membershipRole, isSuperAdmin, sessionId, to}
       → ${app}/auth-handoff?token=…
   consumer /auth-handoff: verify token → set host-scoped next-auth cookie → redirect to `to`
   consumer middleware (next nav): /api/verify-token → verifyJWT → isAuthSessionActive ✓
```

### 10.2 Role decision for an in-app action (quikscale example)

```
 POST /api/kpi  (create a KPI)
   getServerSession → { userId, orgId, membershipRole }
   [module gate]  gateModuleApi("quikscale","kpi",orgId)  → 403/404 if disabled
   [permission]   userCan(userId, orgId, "KPI", "create")
        ├─ UserAppRole → AppRole → RolePermission("KPI","create")?   ── yes → allow
        └─ UserPermissionExtra("KPI","create")?                       ── yes → allow
        else → 403
```

### 10.3 Two role layers combined

```
            ┌──────────────────────────── User ────────────────────────────┐
            │  User.isSuperAdmin (platform)                                  │
            └───────────────┬───────────────────────────────────────────────┘
                            │ belongs to org via
                            ▼
         OrgMember.role  ──►  membership layer (super_admin/org_admin/app_admin/member)
                            │     → app visibility, admin-portal & super-admin gating
                            ▼
         UserAppAccess    ──►  can this user use app X in org Y? (default role "member")
                            ▼
         UserAppRole → AppRole → RolePermission  ──►  in-app RBAC: (resource, action) grants
              (+ UserPermissionExtra additive;  quikinfra: Cn* tables + permission keys)
```

---

## 11. File reference

| Concern | File |
|---|---|
| Role constants & hierarchy | [packages/shared/lib/constants.ts](QuikIT_New/packages/shared/lib/constants.ts) |
| Session/JWT claim shape | [packages/auth/types.ts](QuikIT_New/packages/auth/types.ts) |
| NextAuth factories (credentials + OIDC client) | [packages/auth/index.ts](QuikIT_New/packages/auth/index.ts) |
| Per-app auth config selection | [apps/quikscale/lib/auth.ts](QuikIT_New/apps/quikscale/lib/auth.ts) |
| Admin / super-admin guards | `packages/auth/require-admin.ts`, `packages/auth/require-super-admin.ts` |
| Middleware factory | [packages/auth/middleware.ts](QuikIT_New/packages/auth/middleware.ts) |
| Tenant resolution + app-access cache | [packages/auth/get-tenant-id.ts](QuikIT_New/packages/auth/get-tenant-id.ts) |
| Session store (soft revoke) | [packages/auth/session-store.ts](QuikIT_New/packages/auth/session-store.ts), [packages/auth/jwt.ts](QuikIT_New/packages/auth/jwt.ts) |
| Cross-domain bridge | [apps/auth/app/api/post-login/route.ts](QuikIT_New/apps/auth/app/api/post-login/route.ts), `apps/*/app/auth-handoff/route.ts` |
| Remote session check | [apps/auth/app/api/verify-token/route.ts](QuikIT_New/apps/auth/app/api/verify-token/route.ts) |
| OIDC IdP endpoints | `apps/quikit/app/api/oauth/{authorize,token,userinfo,jwks}/route.ts`, `apps/quikit/app/.well-known/openid-configuration/route.ts` |
| Role/RBAC schema | [packages/database/prisma/schema.prisma](QuikIT_New/packages/database/prisma/schema.prisma) (OrgMember, UserAppAccess, AppRole, UserAppRole, RolePermission) |
| QuikScale RBAC | `apps/quikscale/lib/api/permissions.ts`, `apps/quikscale/lib/api/seedAdminAppRole.ts` |
| QuikInfra RBAC | `apps/quikinfra/src/lib/rbac/`, `apps/quikinfra/src/lib/auth/context.ts` |
| Admin roles API + deferred list | `apps/admin/app/api/roles/route.ts`, `apps/admin/MIGRATION_NOTES.md` |
| Role provisioning bridge | [apps/quikit/lib/provisionAppRoles.ts](QuikIT_New/apps/quikit/lib/provisionAppRoles.ts) |
