# QuikIT Platform — Comprehensive Technical Reference

> **Purpose:** A complete, in-depth technical reference for the QuikIT platform — architecture, data model, identity, per-app implementation, infrastructure, and operational reality. Written to be the foundation for a technical presentation and an onboarding reference for engineers.
> **Audience:** Technical Team Lead, architects, and engineers.
> **Basis:** Direct reading of the codebase (`apps/*`, `packages/*`, `packages/database/prisma/schema.prisma`, `.github/workflows/*`, per-app `vercel.json`/`Dockerfile`) and the `docs/` corpus. Where the code and docs diverge, the code wins and the divergence is called out.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Monorepo Architecture & Project Structure](#3-monorepo-architecture--project-structure)
4. [Technology Stack](#4-technology-stack)
5. [Folder Structure & Coding Standards](#5-folder-structure--coding-standards)
6. [Shared Packages & Services](#6-shared-packages--services)
7. [Authentication — OAuth, OIDC, SSO & Login Flow](#7-authentication--oauth-oidc-sso--login-flow)
8. [Session Management — JWT, Redis & Cookies](#8-session-management--jwt-redis--cookies)
9. [Authorization — Roles, Permissions & Module Gating](#9-authorization--roles-permissions--module-gating)
10. [User Access Management](#10-user-access-management)
11. [Multi-Tenant Architecture](#11-multi-tenant-architecture)
12. [Database Architecture & Schema Design](#12-database-architecture--schema-design)
13. [API Architecture & Request Flow](#13-api-architecture--request-flow)
14. [Middleware & Routing](#14-middleware--routing)
15. [Caching & Redis Architecture](#15-caching--redis-architecture)
16. [File Storage Architecture](#16-file-storage-architecture)
17. [Email Architecture & Flow](#17-email-architecture--flow)
18. [Application Communication & Integration Flow](#18-application-communication--integration-flow)
19. [Security Implementation](#19-security-implementation)
20. [Error Handling & Logging](#20-error-handling--logging)
21. [Performance Optimizations](#21-performance-optimizations)
22. [Background Jobs & Scheduled Tasks](#22-background-jobs--scheduled-tasks)
23. [Environment Configuration](#23-environment-configuration)
24. [Deployment Architecture — Local, UAT & Production](#24-deployment-architecture--local-uat--production)
25. [CI/CD Pipeline](#25-cicd-pipeline)
26. [Testing Architecture](#26-testing-architecture)
27. [Feature-Wise Implementation — Every Application](#27-feature-wise-implementation--every-application)
28. [End-to-End User Journeys](#28-end-to-end-user-journeys)
29. [Best Practices Followed](#29-best-practices-followed)
30. [Limitations, Assumptions & Future Enhancements](#30-limitations-assumptions--future-enhancements)

---

## 1. Executive Summary

**QuikIT is a multi-tenant SaaS platform delivered as a suite of independent business applications that share one identity system, one database, and one UI/design foundation.**

- **One login, many apps.** A user authenticates once through a central credentials service; a central OAuth/OIDC Identity Provider federates that identity to every product app via SSO. Users move between products (KPI/OKR, CRM, HR, Construction ERP, Project Tracking, VC deal-flow, Social, Helpdesk) without re-authenticating.
- **Multi-tenant to the core.** Every business record is scoped to an **org** (tenant). Data isolation is enforced on every database query via an `orgId` filter.
- **Monorepo, shared foundations.** All apps live in one Turborepo. Authentication, database access, UI, caching, and constants are shared `@quikit/*` packages — a fix propagates everywhere in one change.
- **Federated, schema-per-app data + RBAC.** One PostgreSQL database hosts **13 namespaced schemas**; each app owns its own `app_*` schema and its own role/permission tables, while central identity/tenancy lives in `auth` and `quikit`.
- **Defense-in-depth authorization.** Requests pass session/membership → app-access → fine-grained RBAC → per-tenant module gating.
- **Modern, type-safe stack.** Next.js 14 (App Router) + TypeScript (strict) + Prisma/PostgreSQL + Redis + Tailwind, with two production deployment topologies (Vercel and Docker→Kubernetes).

**Scale at a glance:**

| Metric | Value |
|---|---|
| Applications | 11 (3 platform/identity + 8 product) + `_template` scaffold |
| Shared packages | 5 (`@quikit/auth`, `@quikit/database`, `@quikit/ui`, `@quikit/redis`, `@quikit/shared`) |
| PostgreSQL schemas | 13 (in one database) |
| Prisma models + enums | ~800 (QuikHRMS alone ~283) |
| Total API route handlers | ~1,400+ across all apps (HRMS 373, CRM 254, Infra 220, QuikScale 164, QuikTrack 106) |
| Page routes | 700+ (HRMS ~351, CRM 65, QuikScale 50+) |

---

## 2. System Architecture

### 2.1 The three application tiers

**Platform / Identity apps**

| App | Dev port | Role |
|---|---|---|
| **quikit** | 3000 | Launcher (`/apps` app picker), **OAuth/OIDC Identity Provider**, super-admin control plane, marketing site |
| **auth** | 3001 | Central credentials service: login form, registration/OTP, password reset, Google/Microsoft SSO, cross-domain handoff, token verification |
| **admin** | 3002 | Org admin portal: members, teams, apps, roles, audit, settings |

**Product apps**

| App | Dev port | Domain |
|---|---|---|
| **quikscale** | 3003 | Strategy execution — OKR/KPI/OPSP/Priority/WWW + performance management |
| **quiktrack** | 3004 | Project/task tracker + docs wiki (Jira-clone, Jira migration) |
| **quikvc** | 3005 | Venture-capital / venture-debt deal flow |
| **quikinfra** | 3006 | Construction ERP (BOQ → procurement → stock → billing) |
| **quiksocial** | 3007 | AI social-media management |
| **quikcrm** | 3008 | CRM / sales execution + CPQ |
| **quikhrms** | 3009 | HR management + Indian statutory payroll |
| **quiksupport** | 3010 | Helpdesk / ticketing |

**Foundation:** `_template` (scaffold for new apps) + `packages/` (shared code).

### 2.2 High-level topology

```
                    ┌───────────────────────────────────────────────────────┐
                    │  packages/  (shared — every app depends on these)     │
                    │   @quikit/auth      NextAuth factories, guards, RBAC    │
                    │   @quikit/database  Prisma client + single schema       │
                    │   @quikit/ui        ~50 React components + theming       │
                    │   @quikit/redis     session store + cache (fail-open)    │
                    │   @quikit/shared    ROLES, constants, pagination, email  │
                    └────────────────────────────┬──────────────────────────┘
                                                  │ consumed by every app
   ┌──────────────┐        ┌──────────────┐       │
   │    auth      │◄──────►│    quikit    │       ▼
   │ (credentials │handoff │ (OAuth/OIDC  │   ┌──────────┬──────────┬──────────┬─────────┐
   │   login)     │        │  IdP +       │   ▼          ▼          ▼          ▼         ▼
   └──────┬───────┘        │  launcher)   │  quikscale  admin    quikinfra  quikcrm   …etc
          │                └──────┬───────┘   │          │          │          │         │
          │  120s signed          │           └──────────┴──────────┴──────────┴─────────┘
          │  handoff token        │                             │
          ▼                       ▼                             ▼
                                                    ┌────────────────────────┐
                                                    │   PostgreSQL           │
                                                    │  single shared DB      │
                                                    │  13 namespaced schemas │
                                                    └────────────────────────┘
```

### 2.3 Architectural principles

1. **Central identity, decentralized apps.** `quikit` is the OAuth/OIDC IdP; `auth` hosts credentials. Every product app is an OIDC client that trusts the shared `NEXTAUTH_SECRET`.
2. **Apps never call each other directly.** Cross-app needs are met by adding the domain to your app or via a shared service. The one exception is the fire-and-forget internal RBAC provisioning call (`/api/internal/provision-roles`).
3. **One database, many schemas.** All apps hit the same PostgreSQL instance; each owns a namespaced `app_*` schema so model names never collide.
4. **Shared everything else.** Auth, UI, caching, constants come from `@quikit/*`.
5. **Fail-open by default.** Caches, feature gates, and session liveness checks fail *open* (grant access) on infrastructure glitches; only auth-critical rate limits fail *closed*.

---

## 3. Monorepo Architecture & Project Structure

### 3.1 Turborepo + npm workspaces

- **Build orchestrator:** Turborepo (`turbo ^2.0.0`) with npm workspaces (`packages/*`, `apps/*`). One `npm install` at the root wires everything; Turbo caches and parallelizes `build`/`lint`/`typecheck`/`test`.
- **Per-app variance:** quikinfra uses **pnpm** and a `src/` + `app/` layout; quikhrms requires Node ≥ 20.14 (package name `quikit-hrms`).
- **`turbo.json`** declares `REDIS_URL` in the build `env` list so Turbo's cache busts when it changes.

### 3.2 Repo layout

```
QuikIT/
├── apps/
│   ├── _template/        # scaffold for new apps
│   ├── quikit/           # launcher + OAuth/OIDC IdP + super-admin
│   ├── auth/             # central credentials / login service
│   ├── admin/            # org admin portal
│   ├── quikscale/        # OKR / KPI / OPSP / Priority / WWW + performance
│   ├── quiktrack/        # project / task tracker + docs
│   ├── quikvc/           # venture-capital deal flow
│   ├── quikinfra/        # construction ERP (src/ layout, pnpm)
│   ├── quiksocial/       # AI social-media management
│   ├── quikcrm/          # CRM / sales
│   ├── quikhrms/         # HR management
│   └── quiksupport/      # helpdesk / ticketing
├── packages/
│   ├── auth/             # NextAuth factories, middleware, guards, session store, cache
│   ├── database/         # Prisma schema + client singleton + seeds
│   ├── redis/            # ioredis singleton + cache helpers (fail-open)
│   ├── shared/           # constants, pagination, email, module registry, rate limiting
│   └── ui/               # shared React components, theme tokens, Tailwind config
├── docs/                 # architecture & contributor documentation
├── scripts/              # affected-apps, coverage-ratchet, check-prod-urls, seeds
├── .github/workflows/    # CI, E2E, PR hygiene, prod safety, UAT/Prod Docker, Prisma
├── .husky/               # pre-push hook
└── CLAUDE.md             # monorepo-wide conventions (source of truth for rules)
```

### 3.3 Ownership model

- Each app owns everything under `apps/<app>/`.
- `packages/` are read-only to app developers — the integration team owns them (one shared change would otherwise cause merge conflicts across every app).
- The Prisma schema is centrally owned; app developers *propose* models in PR descriptions and the integration owner runs migrations.

---

## 4. Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Monorepo | **Turborepo + npm workspaces** | `turbo ^2.0.0`, `npm@11`; pnpm for quikinfra |
| Framework | **Next.js 14 (App Router)** | `14.0.4`; Server Components + edge middleware; standalone output for Docker |
| Language | **TypeScript (strict)** | `^5.3.3`; `as any` banned by ESLint |
| UI runtime | **React 18** | pinned `18.3.1` via root `overrides` |
| Auth | **NextAuth 4 (JWT strategy)** | `^4.24.0`; shared `NEXTAUTH_SECRET` across all apps |
| Auth crypto | **bcrypt** (passwords), **jose** (OIDC id_token RS256 / handoff HS256) | |
| ORM / DB | **Prisma → PostgreSQL** | `multiSchema` preview; Neon (pooled) and/or GCP Cloud SQL |
| Cache / sessions | **Redis (ioredis)** via `@quikit/redis` | soft-session store, layered cache, rate limiting; **fail-open** |
| Server state | **TanStack React Query** | `^5.28.0`, `staleTime: 60s` |
| Client state | **Redux Toolkit** | e.g. quikscale table prefs (versioned localStorage) |
| Styling | **Tailwind CSS** | `^3.4.1`, extends `@quikit/ui/tailwind-config`; `accent-*` theming |
| Theme | **next-themes** | light/dark + per-tenant accent color via `ThemeApplier` |
| Validation | **Zod** | `^3.22.4`; same schema client + server |
| Rich text | **Tiptap** | quiktrack docs, quikscale, quikcrm notes |
| Workflow UI | **React Flow (`@xyflow/react`)** | quikcrm automation builder |
| PDF / Excel | **@react-pdf/renderer, pdf-lib, exceljs, xlsx** | quotes, payslips, POs, OPSP, exports |
| AI | **Anthropic Claude SDK** (quikvc, quikscale, quikhrms), **Gemini** (quikscale dedup), **Python/FastAPI service** (quiksocial) | |
| Monitoring | **Sentry** | quikit, quikscale, quiksocial; no-op if DSN unset |
| Testing | **Vitest** (unit/API/component) + **Playwright** (E2E) | coverage ratchet in CI |
| Deploy | **Vercel** (main-only) **and** **Docker → GHCR → Kubernetes GitOps** (UAT/Prod branches) | dual topology |

---

## 5. Folder Structure & Coding Standards

### 5.1 Inside a single app

```
apps/<app>/
├── app/
│   ├── (auth)/login/          # route group — login page
│   ├── (dashboard)/           # route group — authenticated shell + feature pages
│   │   ├── layout.tsx         # sidebar, providers, ThemeApplier, RBAC seed on load
│   │   └── <feature>/page.tsx
│   ├── (marketing)/           # public landing pages
│   ├── api/                   # API route handlers (route.ts, HTTP-method exports)
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── <feature>/route.ts
│   │   ├── internal/provision-roles/route.ts
│   │   └── health/route.ts
│   ├── auth-handoff/route.ts  # receives cross-domain session token
│   ├── globals.css            # imports @quikit/ui/styles + app styles
│   └── layout.tsx             # root layout
├── components/                # app-local React components
├── lib/
│   ├── auth.ts                # picks OIDC-client vs credentials config at runtime
│   ├── db.ts                  # re-exports @quikit/database `db` (mockable in tests)
│   └── api/withOrgAuth.ts     # thin auth+RBAC wrapper over @quikit/auth factories
├── __tests__/                 # unit / api / permissions / components / e2e
├── middleware.ts              # createMiddleware() from @quikit/auth
├── manifest.ts                # app metadata (appId, routePrefix — platform contract)
├── vercel.json                # deploy gating (main-only)
├── Dockerfile                 # multi-stage turbo-prune build (for K8s)
└── package.json
```

### 5.2 Coding standards (enforced in review; some in CI)

- **File naming:** directories `lowercase`; component files `lowercase.tsx` exporting PascalCase; route files use Next.js reserved names (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`); hooks `useThing.ts`; tests `<name>.test.ts` / `<name>.dom.test.tsx`.
- **Provider order (fixed across all apps):** `SessionProvider → QueryClientProvider → ThemeProvider` (+ `ConfirmProvider` just inside `ThemeProvider`).
- **Error handling:** always `catch (error: unknown)`, never `(e: any)`; narrow via `instanceof Error`.
- **API response contract:** `{ success: true, data }` or `{ success: false, error: string }`, every route, every time.
- **`as any` is banned** by ESLint; use `as unknown as <Type>` with a comment only if unavoidable.
- **Server-first components:** default to Server Components; push `"use client"` to small leaf components (hooks, browser APIs, event handlers).
- **UI reuse:** use `@quikit/ui` primitives; local components allowed with `// TODO(integration): upstream to @quikit/ui`.
- **Theming:** `accent-*` Tailwind classes for branded interactive elements; hardcoded semantic colors (green/amber/red/blue) for data states. Four QuikScale tables (KPI/Team-KPI/Priority/WWW) plus `colorLogic.ts`/`kpiHelpers.ts` are **locked** — never themed.
- **Icons:** Lucide only; no emoji.
- **Data fetching:** Server Components call `db` directly; client interactions use React Query (never `useEffect(fetch)`).

---

## 6. Shared Packages & Services

### 6.1 `@quikit/auth` — identity engine

The backbone of authentication and authorization. Key exports:

| Export | Purpose |
|---|---|
| `createAuthOptions()` | NextAuth config for the **IdP host** (credentials + Google + Azure AD) — used by `auth` and `quikit` |
| `createOAuthClientOptions()` | NextAuth config making an app a full **OIDC client** of quikit |
| `createMiddleware()` | The middleware factory every app must use (no custom middleware) |
| `createRequireAdmin` / `createRequireSuperAdmin` | Guard factories (return `requireAdmin()` / `requireSuperAdmin()`) |
| `createGetOrgId` (alias `createGetTenantId`) | Resolves `orgId` from session + revalidates membership/app-access with caching |
| `gateModuleApi` / `gateModuleRoute` / `isTenantAppBlocked` | Per-tenant module/app entitlement gating |
| `getOrSet` / `invalidate` (`/cache`) | Layered LRU + Redis cache + cross-process pub/sub invalidation |
| `createAuthSession` / `touchAuthSession` / `isAuthSessionActive` / `revokeAuthSession` (`/session-store`) | Redis session soft-revocation |
| `verifyJWT` (`/jwt`) | JWT verification + Redis session liveness |
| `withAuth` / `withAuthOptional` (`/with-auth`) | Lower-level JWT context resolver incl. `actingAs` principal (`user`/`ai_agent`/`platform_service`/`scheduled_job`) |
| `assign-app-roles` | Guarded raw-SQL writer that mirrors app-access into per-app `UserAppRole` rows |

**Session shape** (augmented in `packages/auth/types.ts`): `id, email, firstName, lastName, orgId, membershipRole, membershipInvalid, isSuperAdmin, sessionId` (+ impersonation and `actingAs`/`actingAgentId` claims).

### 6.2 `@quikit/database` — data access

- The Prisma client singleton (`db`) extended with **soft-delete middleware** for `KPI`, `Team`, `Priority`, `WWWItem`, `Meeting` (reads auto-exclude `deletedAt != null`).
- Re-exported per app via `lib/db.ts` so `__tests__/helpers/mockDb.ts` can swap it.
- Types come from `@prisma/client`; runtime from `db`.

### 6.3 `@quikit/redis` — cache/session transport

- Lazily-connected ioredis singleton (`lazyConnect: true`, `maxRetriesPerRequest: 3`, backoff ≤ 3s, auto-reconnect on READONLY/ECONNRESET/ECONNREFUSED).
- `getRedis()` returns `null` when `REDIS_URL` is unset → **every consumer degrades to in-memory**. `requireRedis()` throws (rare paths). Best-effort `cacheGet/Set/Del` swallow errors.
- Loud one-time **prod-only** banner on missing URL / first connection error.

### 6.4 `@quikit/ui` — design system

~50 React components (form primitives, `DataTable`, `Modal`, `SlidePanel`, `Tabs`, pickers, `AppSwitcher`, `ThemeApplier`, `SignInComponent`, `UserMenu`), the Tailwind base config, design tokens, and utilities (`cn`, `formatDate`, …). Single source of cross-app UI consistency and per-tenant accent theming.

### 6.5 `@quikit/shared` — constants + utilities

- Role/status constants (`ROLES`, `MEMBERSHIP_ROLES`, `ROLE_HIERARCHY`, `ADMIN_TIER_ROLES`, `MEMBERSHIP_STATUS`, KPI/Priority/WWW statuses, `TENANT_PLANS`).
- Pagination (`parsePaginationParams`, `paginationToSkipTake`, `buildPaginationResponse` — default page 1, limit 20, max 100).
- Module registry (`MODULE_REGISTRY`, `isModuleEnabled`, `visibleModules`).
- Server-only submodules: `@quikit/shared/rateLimit` (Redis fixed-window limiter) and email helpers (`sendInvitationEmail`) — kept off the barrel to avoid pulling server deps into client bundles.
- `@quikit/shared/temp-password` (`generateTempPassword()` — unique 12-char, only bcrypt hash stored).

---

## 7. Authentication — OAuth, OIDC, SSO & Login Flow

### 7.1 Dual configuration chosen at runtime

Each app's `lib/auth.ts` selects its NextAuth configuration from the environment:

```ts
export const authOptions =
  QUIKIT_URL && QUIKIT_CLIENT_ID && QUIKIT_CLIENT_SECRET
    ? createOAuthClientOptions({ quikitUrl, clientId, clientSecret })  // production: OIDC client
    : createAuthOptions({ signInPage: "/login", errorPage: "/login" }); // dev/migration: direct credentials
```

### 7.2 The OAuth/OIDC Identity Provider (`quikit`)

The launcher exposes standard OIDC endpoints (`apps/quikit/app/api/oauth/*` + `.well-known`):

| Endpoint | Behavior |
|---|---|
| `/.well-known/openid-configuration` | Discovery — RS256, scopes `openid profile email tenant`, PKCE S256, `authorization_code`+`refresh_token`. Issuer = `NEXTAUTH_URL` |
| `/api/oauth/authorize` | Validates `client_id` (against `OAuthClient`) + registered `redirect_uri`; requires a live session (else `/login?callbackUrl=…`); auto-selects first active org; **enforces `UserAppAccess`** (denial → app's public landing with `?reason=no_app_access&others=N`); mints a 10-min `OAuthCode` carrying PKCE challenge + central `sessionId` |
| `/api/oauth/token` | Client auth via `client_secret_basic` or `_post` (bcrypt, 60s LRU cache); **rate-limited before bcrypt** at 30/min per (clientId, /24 IP), fail-closed in prod; handles `authorization_code` (PKCE verify, one-time code) + `refresh_token` (rotates). Returns opaque `access_token` (`qk_…`), RS256 `id_token`, `refresh_token` (`qkr_…`, 30-day) |
| `/api/oauth/userinfo` | Bearer access_token → `sub/email/name/tenant_id/role/sessionId` |
| `/api/oauth/jwks` | RS256 public JWK (kid `quikit-1`) |

**Token signing internals** (`apps/quikit/lib/oauth.ts`): RS256 via `jose`; `normalizePem` accepts PEM in four shapes (real newlines / escaped `\n` / base64-wrapped / bare body) to survive Vercel single-line env quirks; `resolveIssuer()` refuses to sign a localhost-issuer token in production. The `sessionId` is threaded auth-code → refresh-token → id_token so consumer sessions remain centrally revocable.

### 7.3 Providers on the credentials host (`auth`)

`createAuthOptions` configures: **Credentials** (email+password, bcrypt, case-insensitive lookup), **Google OAuth** (`prompt: select_account`, captures name for prefill), **Microsoft / Azure AD** (`MICROSOFT_TENANT_ID`, default `common`).

### 7.4 Cross-domain session handoff (the signature SSO mechanism)

Cookies can't cross distinct hosts, so:

```
User → protected route on consumer app
  middleware: no session → redirect ${NEXT_PUBLIC_AUTH_URL}/login?callbackUrl=…
auth host: SignInComponent → signIn("credentials") → bcrypt OK
  jwt callback: createAuthSession() → token.sessionId; pick first active OrgMember → orgId/role
  /api/post-login (or launcher /api/launch-token):
    mint 120s HS256 token signed with INTERNAL_SECRET
      { sub, orgId, membershipRole, isSuperAdmin, email, name, sessionId, to }
    → redirect ${app}/auth-handoff?token=…
consumer /auth-handoff: verify token → mint host-scoped NextAuth JWE cookie → redirect to `to`
consumer middleware (next nav): /api/verify-token → verifyJWT → isAuthSessionActive ✓
```

- The return origin must be on the `AUTH_ALLOWED_RETURN_ORIGINS` allow-list (plus a hardcoded Vercel/quikit.ai list).
- The consumer cookie is a NextAuth **JWE** (encoded via `next-auth/jwt`), host-scoped.
- `signout-global` clears all ~10 NextAuth cookie variants (correctly matching `__Secure-`/`__Host-` attributes) and revokes the Redis session across all sibling apps.

### 7.5 Additional login flows

- **Self-serve registration (3-step OTP)** on `apps/auth` — see [§10](#10-user-access-management).
- **Profile completion** — first sign-in without a name prompts a form (SSO values prefill from a Redis `oauth-prefill:*` key).
- **Forgot / temp password** — OTP-based reset (Redis) or a "forced re-invite" temp-password path (`mustChangePassword` gate).
- **Invitation auto-accept** — pending `OrgMember (status="invited")` rows promote to `active` on first login; matching `UserAppAccess` rows are created.
- **Agent JWTs** — `/api/auth/internal/issue-agent-jwt` mints ≤15-min session-shaped JWTs with `actingAs`/`actingAgentId` claims for trusted internal services; allow-listed, audited in `AgentJwtIssuance`, deliberately **no `sessionId`** (short-TTL, non-revocable).

---

## 8. Session Management — JWT, Redis & Cookies

### 8.1 Strategy

NextAuth **JWT strategy** (cookie `next-auth.session-token`). The JWT carries identity + org + role + `sessionId`; it does **not** carry permissions (those resolve per-request from the DB).

### 8.2 Lifecycle

```
login          → createAuthSession(userId, 30d)   [SET auth:session:<id> EX 2592000]
activity       → touchAuthSession(<id>, 30d)       [EXPIRE — slide TTL for active users]
each check     → isAuthSessionActive(<id>)         [EXISTS — gates JWT validity]
logout/revoke  → revokeAuthSession(<id>)           [DEL — next check fails]
```

- On the **jwt callback**: initial sign-in mints the Redis session id and selects the first active membership into `orgId`/`membershipRole`; on refresh it throttles a Redis liveness check (~30s) and revalidates membership (~5 min).
- **Soft revocation:** `sessionId` is the handle (`auth:session:{id}`). `verifyJWT` returns `null` if the key is gone. Consumer apps' middleware calls the central `/api/verify-token` (guarded by `x-internal-secret`) to validate server-to-server and touch TTL.
- **Real-time entitlement:** `/api/verify-token` also returns `orgActive`, `subscriptionActive`, `trialExpired` — so any app can bounce a user the moment their org is suspended or trial lapses, without waiting for JWT expiry.
- **Fail-open caveat:** `isAuthSessionActive` returns `true` when Redis is down — a Redis outage disables cross-instance revocation (users keep access until the JWT's own expiry). Consumer OIDC apps only support remote revocation if their JWT actually carries `sessionId`.

### 8.3 Cookies

- Central host: standard NextAuth session cookie.
- Consumer host: a host-scoped JWE minted at `/auth-handoff`.
- Secure prefixes (`__Secure-`/`__Host-`) are matched on set and clear to avoid production logout bugs.

---

## 9. Authorization — Roles, Permissions & Module Gating

QuikIT layers **two independent role systems** plus **module gating**.

### 9.1 The two role systems

| | **Membership roles (org-wide)** | **In-app roles (per-app RBAC)** |
|---|---|---|
| Scope | Organization-wide | Per-app, per-org |
| Stored on | `OrgMember.role` (+ `User.isSuperAdmin`) | Per-app `AppRole`/`UserAppRole`/`RolePermission` in that app's schema |
| Values | Fixed: `super_admin`, `org_admin`, `app_admin`, `member` (+ legacy) | App-defined roles → granular `(resource, action)` grants |
| In the session? | Yes (`membershipRole`, `isSuperAdmin`) | No — resolved per-request from the DB |
| Used for | App visibility, admin-portal access, super-admin gating | Fine-grained "can this user do X here" |

**Role hierarchy** (`ROLE_HIERARCHY`): `super_admin` 6 · `admin`/`org_admin` 5 · `app_admin`/`executive` 4 · `manager` 3 · `member`/`employee` 2 · `coach` 1. `ADMIN_TIER_ROLES` (who may enter admin-tier apps) = `super_admin`, `org_admin`, legacy `admin`.

### 9.2 The gating pipeline (up to three checks + module gate)

```
0. MODULE GATE (per-tenant feature flags)
     gateModuleApi(appSlug, moduleKey, orgId) — 403 if app blocked, 404 if module disabled

1. SESSION / MEMBERSHIP (org-wide)
     requireSuperAdmin → must have isSuperAdmin
     requireAdmin      → ROLE_HIERARCHY[membershipRole] ≥ admin(5)

2. APP ACCESS (org → app)
     UserAppAccess(userId, orgId, appId) present?  (enforced at OIDC /authorize + per request, 60s cache)

3. IN-APP PERMISSION (fine-grained, per app)
     resolved from that app's role tables + additive per-user grants
```

### 9.3 Per-app RBAC — the federated pattern

Each product app owns its RBAC tables **in its own Postgres schema**, so role definitions never collide. The `App` model links to per-app role namespaces (`AppRole`, `QtAppRole`, `CnAppRole`, `QsAppRole`). The canonical "v2" shape (mirrored across apps):

- `AppRole` — per-org, per-app role (`isSystem` protects the seeded `admin` role from rename/delete — **not** a permission bypass; `isDefault` marks the auto-assigned role).
- `RolePermission` — granular `(resource, action)` grant.
- `UserAppRole` — assigns a user to a role.
- `UserPermissionExtra` — additive per-user grant (and, in some apps, a `revoke` flag where **deny wins**).

Permission check = `userCan(userId, orgId, resource, action)` — true if a `RolePermission` (via `UserAppRole`) OR a `UserPermissionExtra` grants it. The JWT carries identity/org only; permissions resolve per-request (a single EXISTS join), cached briefly.

**Per-app permission vocabularies:**

| App | Key format | Roles |
|---|---|---|
| quikscale / quiktrack / quiksocial / quiksupport(Qsp) | `(resource, action)` e.g. `("KPI","create")` | seeded `admin` (all) + `Member`/`User` (curated) |
| quikcrm | `(module, action)` 16 modules × actions | Administrator bypasses all; deny-by-default |
| quikhrms | `hrms.<domain>.<action>` e.g. `hrms.employee.read` | `admin` = `["*"]`, `employee` (self-service); keyed on **Employee.id**, DENY wins |
| quikinfra | `construction.<domain>.<action>` (+ legacy fallback) | `admin`/`ho_user`/`site_admin`/`user`; `"*"` wildcard |

**Provisioning:** when a super-admin creates an org or grants app access, the launcher fires **fire-and-forget** to each app's `/api/internal/provision-roles` (guarded by `INTERNAL_SECRET`) to seed that app's system/default roles. Each app also lazily seeds on first authed request (idempotent, 5-min in-process cache), so the HTTP call is best-effort.

### 9.4 App-specific authorization nuances

- **QuikTrack** adds **project-scoped roles** that *override* app-wide roles inside a space, plus **field-level permissions** (`hidden/readonly/editable/required`) and nav gating derived from `<entity>:view` grants. `withProjectAccess` returns **404 (not 403)** for org members who aren't project members (avoids leaking project existence).
- **QuikSocial** layers **per-brand workspace roles** (`BrandMembership`: `admin`/`approver`/`member`) *on top of* org RBAC v2, gating the post lifecycle.
- **QuikCRM** adds **record-level ACL** (`account-acl.ts`) computing the set of visible account IDs by sales-group/team scope, plus legacy field-masking templates.
- **QuikInfra** carries **two coexisting permission namespaces** — live `construction.*` (DB-backed) and a legacy prefix-less fallback (`ROLE_DEFINITIONS`) used only when the v2 tables are unreachable; bridged by `legacyKeyMap.ts`.
- **Admin portal** is role-based (not permission-based); some role CRUD is deferred at HTTP 501 pending the shared-schema RBAC migration.

---

## 10. User Access Management

### 10.1 Access model layers

```
User.isSuperAdmin (platform)
      │ belongs to org via
      ▼
OrgMember.role  ──►  membership layer (super_admin/org_admin/app_admin/member)
      ▼
UserAppAccess   ──►  can this user use app X in org Y? (default role "member")
      ▼
UserAppRole → AppRole → RolePermission  ──►  in-app RBAC (resource, action) grants
     (+ UserPermissionExtra additive/deny; per-app variants)
```

- **`UserAppAccess`** (`quikit` schema) — the org→app grant (`@@unique([userId, orgId, appId])`).
- **`OrgAppAccess`** — sparse, **default-OFF** org→app entitlement + trial (`trialEndsAt`).
- **App visibility** in the launcher is computed by `/api/apps/launcher`: org/super admins see all provisioned apps; others need a `UserAppAccess` row; `requiresOrgAdmin` apps gate by role.

### 10.2 Self-serve registration (3-step OTP)

**Design rule:** ephemeral data lives in Redis (self-expiring); durable rows only on completion (no orphan orgs).

```
Step 1  POST /api/auth/register        Step 2  POST /api/auth/verify-otp    Step 3  POST /api/auth/register/complete
create unverified User (DB)            verify OTP (Redis, 5-attempt lockout) consume reset token + pending (Redis)
store org name (Redis)          ───►   mint one-shot reset token (Redis) ─► set password + emailVerified (DB, txn)
store + email 6-digit OTP (Redis)                                          create Org + OrgMember(org_admin) + Subscription
                                                                            auto sign-in → /apps
```

- OTP is `sha256`-hashed in Redis (`otp:reset:<userId>`, 300s), never stored in Postgres; timing-safe compare; 5 wrong attempts deletes it; resend refreshes.
- Completion runs one DB transaction: set bcrypt password + `emailVerified`, insert `Org` (plan `startup`), `OrgMember` (`org_admin`, `active`), `Subscription` (`active`). The 14-day trial is per-app on `OrgAppAccess.trialEndsAt`, set when the app is activated.

### 10.3 Invitation flows

- **Super-admin creates org** (`POST /api/super/orgs`): one transaction creates org + first Org-Admin `OrgMember(invited)` + `OrgAppAccess` rows + default-disabled module flags; then fires `provisionAppRolesForOrg`; then sends onboarding email (native invites generate a one-time temp password shown once).
- **Org admin invites member** (`POST /api/members` in admin): classifies SSO vs native email, validates app provisioning, creates `OrgMember(invited)` + `UserAppAccess` in a transaction, assigns per-app roles, best-effort onboarding email.
- **Invitation acceptance** (`/api/invitations/accept`): 7-day one-shot token, replay-guarded; validates temp password, sets a policy-compliant password, activates membership, grants `UserAppAccess`, mirrors to per-app `UserAppRole`.
- **Impersonation** (super-admin): 2-hour single-use token, rate-limited 10/hour, refuses to impersonate another super-admin, audit-logged.

---

## 11. Multi-Tenant Architecture

### 11.1 The core invariant

> **Every Prisma query that reads or writes org-scoped data MUST filter by `orgId`.**

`orgId` is the scoping column platform-wide (a migration `20260502201000_global_tenantid_to_orgid` renamed the legacy `tenantId`). The org model is `Org`; membership is `OrgMember`. `orgId` is sourced from the **session JWT**, never from request params — preventing cross-org leaks. Cross-org queries are forbidden outside super-admin routes.

### 11.2 How isolation is enforced

- **`withOrgAuth`** (each app's thin wrapper) resolves `orgId` from the session and hands it to the handler; the handler must include it in every `where`.
- Every org-scoped model carries `orgId` (indexed, FK to `Org` with `onDelete: Cascade`), so deleting an org cascades its data away.
- Storage keys are tenant-namespaced (`tenants/{orgId}/...`) with prefix checks on download.
- Tests assert cross-org requests are rejected.

### 11.3 Schema-per-app

Each app's domain models live in its own `app_*` PostgreSQL schema; identity (`auth`) and tenancy (`quikit`) are central. This gives per-app model isolation (no name collisions across `Cn*`/`Qt*`/`VC*`/`Crm*`) inside a single shared database — one connection pool, one migration history, cross-app joins possible for central identity.

---

## 12. Database Architecture & Schema Design

### 12.1 One schema file, 13 PostgreSQL schemas

All apps share **one** Prisma schema (`packages/database/prisma/schema.prisma`) using the `multiSchema` preview feature. The datasource declares 13 schemas:

| Schema | Holds | Approx models/enums |
|---|---|---|
| `auth` | Central identity — `User`, `Account`, `Session`, `VerificationToken`, `AgentJwtIssuance` | 5 |
| `quikit` | `Org`, `OrgMember`, `App`, `UserAppAccess`, `OrgAppAccess`, `Subscription`, `Plan`, OAuth IdP tables (`OAuthClient`/`OAuthCode`/`OAuthRefreshToken`), `Impersonation`, `PlatformAlert` | 9 |
| `public` | Cross-app — `Team`, `UserTeam`, `Notification`, `AuditLog`, `FeatureFlag`, `AppModuleFlag`, telemetry (`ApiCall*`, `AppHealthCheck`), `SessionEvent`, `AuthLog`, `Invoice`, `Broadcast*` | 17 |
| `app_quikscale` | KPI/Priority/WWW/OPSP, client meetings, performance, RBAC | 59 |
| `app_quikhrms` | Employees, payroll, attendance, leave, recruitment, tickets, RBAC (largest domain) | 283 |
| `app_quikcrm` | Leads/accounts/opportunities/quotes/orders/products, automations, telephony, RBAC | 102 |
| `app_quikfinance` | Finance domain (reserved/emerging) | 90 |
| `app_quikinfra` | Construction ERP — `Cn*` (projects, procurement, stock ledgers, billing) | 86 |
| `app_quiktrack` | `Qt*` — projects/spaces, issues, sprints, docs, timesheets, RBAC | 45 |
| `app_quiksupport` | `Hd*` (helpdesk) + `Qsp*` (platform RBAC) | 30 |
| `app_quikvc` | `VC*` — deals, scoring, IC memos, capital ops | 28 |
| `app_quiksocial` | Brands, posts, campaigns, assets, auto-reply, RBAC | 22 |
| `app_quikasset` | Asset library domain | 18 |

*(Counts include enums; ~800 total. `app_quikfinance` and `app_quikasset` reflect emerging/asset domains.)*

### 12.2 Required fields on every org-scoped model

```prisma
model YourModel {
  id        String   @id @default(cuid())
  orgId     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  createdBy String?
  updatedBy String?
  deletedAt DateTime?               // soft delete
  org       Org      @relation(fields: [orgId], references: [id], onDelete: Cascade)
  @@index([orgId])
  @@index([orgId, deletedAt])
  @@schema("app_<your-app>")
}
```

### 12.3 Cross-schema relationships

```
auth.User (id) ──┐
                 ├──< quikit.OrgMember (userId, orgId) >── quikit.Org (id)
quikit.Org (id) ─┤
                 ├──1:1── quikit.Subscription (orgId @unique)
                 ├──< quikit.UserAppAccess (userId, orgId, appId → quikit.App.id)
                 └──< quikit.OrgAppAccess (orgId, appId)
quikit.App (id) ──< AppRole / QtAppRole / CnAppRole / QsAppRole (per-app schemas)
Org (id) ──< every app_*.<Model>.orgId  (onDelete: Cascade)
```

- `OrgMember` is the many-to-many join between `User` and `Org` carrying the membership role.
- `App` fans out to per-app role namespaces and to `OAuthClient` (1:1).
- Every app-domain model has an `orgId` FK back to `quikit.Org` with cascade delete.

### 12.4 Query conventions

- **`select` for lists** (small payloads), **`include` for detail** (full related model).
- **Soft delete** automatic on select models; read soft-deleted rows with `where: { deletedAt: { not: null } }`.
- **Pagination** via the shared utility; every `findMany` bounded with `take`.
- **Transactions** (`db.$transaction`) for atomic multi-writes; QuikScale wraps weekly-value recompute in `withTxRetry` for deadlock safety.
- **Money** stored as `Decimal(18,2)` (quantities `Decimal(18,4)`), never Float; QuikVC uses `BigInt` paise.
- **Append-only ledgers** in QuikInfra (`CnStockLedger`, `CnBOQProgressLedger`, `CnBOQBillingLedger`) — reversals are compensating rows, never updates.

### 12.5 Migrations & seeds

- Migrations centrally owned; `prisma migrate dev` locally, `prisma migrate deploy` in the `Prod` pipeline. 58+ migrations checked in.
- Neon runtime uses a pooled `DATABASE_URL`; migrations use a direct `DATABASE_URL_DIRECT` (bypasses PgBouncer for advisory locks + DDL).
- Seeds in `packages/database/prisma/` (`seed-e2e.ts`, `seed-plans.ts`, `seed-oauth.ts`, `seed-superadmin.ts`, `seed-quikvc*.ts`, …).

---

## 13. API Architecture & Request Flow

### 13.1 The contract

Every API route: (1) wrapped in an auth helper; (2) validates input with Zod; (3) filters by `orgId`; (4) returns `{ success, data }` / `{ success, error }`; (5) `catch (error: unknown)`; (6) POST → 201, others → 200; (7) ships ≥3 tests (401, cross-org rejected, happy path).

**Status codes:** 400 validation · 401 auth · 403 authz · 404 not-found / disabled module · 409 conflict · 429 rate-limited · 500 unhandled.

### 13.2 Canonical shape

```ts
export const GET = withOrgAuth(async ({ orgId }) => {
  const items = await db.widget.findMany({
    where: { orgId }, select: { id: true, name: true }, take: 50,
  });
  return NextResponse.json({ success: true, data: items });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return validationError(parsed);
  const widget = await db.widget.create({ data: { ...parsed.data, orgId, createdBy: userId } });
  return NextResponse.json({ success: true, data: widget }, { status: 201 });
});
```

### 13.3 `withOrgAuth` composition

A thin per-app wrapper over the `@quikit/auth` factories, instantiated once with the app's `authOptions`. Context = `{ session, userId, orgId }`. It handles 401/403/500 boilerplate and fire-and-forget request logging (`logApiCall`/`ApiCall`). Naming varies by app: `withOrgAuth` (quikscale/quikvc/quiksocial/quiktrack/quikinfra), `withTenantAuth` (quikcrm), `withAdminAuth` (admin), `withHelpdeskAuth` composing `withOrgAuth` (quiksupport), `withAuth` keyed on Employee (quikhrms).

Two optional layers:
- **Module gating:** `withOrgAuthForModule("kpi")` → 404 if disabled for the org.
- **RBAC v2:** `withOrgAuthForResource("kpi","KPI")` exposing `.view/.create/.update/.delete`, backed by `userCan`.

### 13.4 Request lifecycle

```
Browser fetch /api/kpi
  ▼ Middleware — validate session (JWT + remote verify-token) → 401 → redirect
  ▼ API handler (withOrgAuth)
      1. Auth guard        → { userId, orgId, membershipRole }
      2. Module gate       → is module enabled for org?         (403/404)
      3. RBAC permission   → userCan(userId, orgId, res, act)?  (403)
      4. Zod validation    → 400 on failure
      5. DB query          → db.kpi.findMany({ where: { orgId, … } })
      6. Audit (mutations) → writeAuditLog(...)
      7. Response          → { success: true, data }
```

- **Pagination**, **audit logging** (who/what/when, changed field names only, no PII), and **rate limiting** (`rateLimitAsync`) are applied via shared utilities where relevant.

---

## 14. Middleware & Routing

### 14.1 Routing (Next.js App Router)

- Filesystem = routes. Reserved files: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`.
- **Route groups** (`(auth)`, `(dashboard)`, `(marketing)`, and role portals like QuikVC's `(vc)`/`(founder)`/`(investor)`) organize routes without affecting URLs.
- **API routes** under `app/api/**/route.ts` export HTTP-method handlers.
- **Login route** is `/login` across all apps.
- Cross-app navigation via the shared `AppSwitcher` + URL env constants; `/apps` on the launcher is the picker.

### 14.2 Middleware factory (`createMiddleware()` — mandatory, no custom middleware)

Order of operations per request:

1. **Redirect-loop guard** — `_redirect_count` cookie; ≥3 breaks the loop.
2. `getToken()` (NextAuth JWT); compute `publicBaseUrl(request)` (never the pod bind address `0.0.0.0`).
3. **Public routes** pass (`/` matches root exactly — prefix-matching `/` would disable auth everywhere).
4. **Remote session validation** (if `centralLoginUrl` + `INTERNAL_SECRET`): `verifyTokenRemote` → `/api/verify-token` (verifyJWT + Redis session). Invalid → clear cookies + redirect to central login with `reason=session_expired`. Also enforces `orgActive===false` (→ suspended) and `subscriptionActive===false` (→ trial/subscription — strict `=== false` so grandfathered orgs pass). Super admins exempt.
5. Unauthenticated + non-public → clear cookies + redirect with `callbackUrl`.
6. Authenticated on login route → honor same-origin `callbackUrl` else `postLoginRoute`.
7. `requireSuperAdmin` / `requireAdmin` gates (latter uses `ADMIN_TIER_ROLES`).
8. `membershipInvalid` → force org re-selection; no `orgId` → central select-org (`/apps`).

---

## 15. Caching & Redis Architecture

### 15.1 Four layers (applied in order on a hot read)

```
1. React.cache()  — per-request memoization (server only)
2. In-memory LRU  — per-process Map, MAX_LOCAL_ENTRIES = 1000, MRU-refresh
3. Shared Redis   — cross-instance, optional (REDIS_URL)
4. Loader (DB)    — source of truth on full miss
```

`getOrSet(key, ttl, loader)` reads local → Redis (JSON-parse, backfills local on hit) → loader; writes local synchronously + **fire-and-forget** to Redis.

### 15.2 Cross-process invalidation

`invalidate(key)` = localDelete + redisDelete + **PUBLISH `quikit:cache-invalidate`**. Every process lazily subscribes (via `main.duplicate()` — ioredis needs a separate subscriber connection) and drops its local copy → **sub-second cross-instance invalidation**, with TTL as the safety net. Canonical caller: the super-admin feature-flag toggle (`invalidateDisabledModules`).

### 15.3 What's cached

| Key | Store | TTL |
|---|---|---|
| `auth:session:{id}` | Redis | 30 days |
| `disabledModules:{orgId}:{appSlug}` | LRU+Redis | 30s |
| `tenantAppBlocked:{orgId}:{appSlug}` | LRU+Redis | 60s |
| `membership:{userId}:{orgId}` | LRU+Redis | 60s |
| `appAccess:{userId}:{orgId}:{appSlug}` | LRU+Redis | 60s |
| `rl:{routeKey}\|{clientKey}:{windowStart}` | Redis (mem fallback) | window |
| `otp:reset*` / `otp:reset-token*` | Redis (mem fallback) | 180–300s |
| admin `perms`/`feature-flags` | Redis | 300s; `dashboard:stats` 30s |

### 15.4 Rate limiting

Fixed-window per `(routeKey, clientKey)` via Redis `INCR`+`EXPIRE` (`packages/shared/lib/rateLimit.ts`). Sync `rateLimit()` is in-memory single-process (never prod); `rateLimitAsync()` is Redis with mem fallback and a `failClosed` opt-in for auth. Presets: login 10/15min, kpiWrite 30/min, mutation 60/min.

### 15.5 Other cache surfaces

- Redis-only cache-aside (`cacheOrCompute`) for heavy aggregates (no local layer).
- Admin typed JSON wrapper (`apps/admin/lib/redis.ts`) — note `invalidatePermissionCache` there is an intentional **no-op** (no wildcard delete; relies on short TTL).
- QuikInfra HTTP `Cache-Control` tiers + `Vary: Cookie` on master-data GETs + DB-backed idempotency keys.
- Client: React Query with `invalidateQueries`; Next.js ISR (`revalidate=60`) vs `force-dynamic`.

### 15.6 Failure behavior

Correctness is always preserved when Redis is down; **coordination and performance degrade**: session revocation stops cross-instance, rate limits become per-pod, admin toggles wait out the TTL, OTP tokens work only on a single instance. A missing `REDIS_URL` in prod is treated as a real incident (loud banner).

---

## 16. File Storage Architecture

Storage backend differs by app — **the dominant backend is Google Cloud Storage** (despite legacy `s3Key`/`uploadToS3` naming in several apps).

| App | Backend | Pattern | Key namespace |
|---|---|---|---|
| **quiktrack** | Google Cloud Storage (`@google-cloud/storage`) | Server-side upload; **stable proxy URL** → 15-min V4 signed GET on render | `tenants/{orgId}/quiktrack/docs|issues/...` |
| **quikhrms** | Google Cloud Storage | Server upload → proxy URL; download enforces tenant isolation (orgId segment must match) | `uploads/{orgId}/{uuid}{ext}` |
| **quikinfra** | Google Cloud Storage (driver abstraction) | **Presigned two-stage** (init → browser PUT direct-to-GCS → confirm with HEAD size check); soft-delete | `tenants/{orgId}/companies/.../projects/.../entity/id/YYYY/MM/...` |
| **quikcrm** | Google Cloud Storage | Server upload; V4 presigned GET (900s) | `crm-documents/...` |
| **quikvc** | **Vercel Blob** (`@vercel/blob`) | Server-side `put`, 4.5 MB cap, MIME allow-list | `{orgId}/{dealId}/{ts}-{filename}` |
| **quiksocial** | **Cloudinary** | `upload_stream` from buffer; Python AI service also uploads generated images | `quiksocial/{orgId}/assets` |
| **quiksupport** | **Local filesystem** (`public/uploads/`) | Multipart write; 10 MB cap | `public/uploads/<uuid><ext>` (ephemeral on serverless) |

**Common patterns:** tenant-namespaced keys with prefix/segment checks on download; MIME allow-lists + size caps; PDFs via `pdf-lib` / `@react-pdf/renderer`; Excel via `exceljs`/`xlsx`. Env: `GCS_PROJECT_ID/BUCKET/CLIENT_EMAIL/PRIVATE_KEY` (single-line, `\n`-escaped), bucket `quikit-bucket` (asia-south1); `BLOB_READ_WRITE_TOKEN` (quikvc); `CLOUDINARY_*` (quiksocial).

---

## 17. Email Architecture & Flow

### 17.1 Three email stacks (no single shared sender)

**A. Auth host** (`apps/auth/lib/email.ts`) — transport-fallback chain, best-effort (never throws):
1. **SMTP** (nodemailer) if `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` set →
2. **Resend** if `RESEND_API_KEY` set (optional package) →
3. **Console log** (dev; prints the OTP/link).
Functions: verification (24h), password-reset OTP (3-min), registration OTP (5-min), invite-accept. All HTML hand-built with XSS escaping.

**B. Shared package** (`packages/shared/lib/email.ts`) — **Resend-only** `sendInvitationEmail` with a shared invitation renderer (SSO / Native / Reminder variants) used by QuikScale, QuikIT, Admin, Auth, QuikInfra. Plus `email-retry.ts`.

**C. QuikVC** (`apps/quikvc/lib/email/index.ts`) — **react-email** components rendered to HTML+text, sent via Resend, with a global kill-switch (`NOTIFICATIONS_EMAIL_ENABLED`).

### 17.2 Template inventory (56 screenshots across 10 of 11 apps)

QuikScale 7 · QuikIT 5 · Admin 2 · Auth 4 · QuikSocial 3 · QuikInfra 4 · QuikVC 2 · QuikTrack 7 · **QuikHRMS 19** (the only app with **DB-backed, admin-editable** templates) · QuikCRM 5 (rules-engine-driven). Several attach PDFs (QuikInfra PO/RFQ per-vendor, QuikHRMS offer/payslip, QuikCRM report/quote).

### 17.3 OTP flow

See [§10.2](#102-self-serve-registration-3-step-otp). OTP hashes and one-shot tokens live in Redis with an in-memory dev fallback; the OTP is never persisted to Postgres.

---

## 18. Application Communication & Integration Flow

### 18.1 Internal (app ↔ platform)

- **SSO/handoff** — the 120s HS256 launch token → `/auth-handoff` (every consumer app).
- **Session verification** — consumer middleware → central `/api/verify-token` (`x-internal-secret`).
- **RBAC provisioning** — launcher → each app's `/api/internal/provision-roles` (`INTERNAL_SECRET`), fire-and-forget.
- Apps do **not** call each other's business APIs directly.

### 18.2 External integrations by app

| App | External services |
|---|---|
| **auth** | Google OAuth, Microsoft/Azure AD; SMTP/Resend |
| **quiksocial** | **Python/FastAPI AI service on Railway** (Celery jobs + **WebSocket** streaming; bidirectional `X-QS-Internal-Token`); Meta Graph (Facebook/Instagram publish + comment polling), LinkedIn/YouTube OAuth (connect only); Cloudinary |
| **quikvc** | Anthropic Claude (scoring, memo drafting, transcript analysis, comparables, daily brief; stubbed without key); Resend; inbound-email webhook (Resend Inbound) for sourcing |
| **quikscale** | Gemini (semantic KPI dedup, key-pool with failover); Anthropic (AI insights, flagged) |
| **quikhrms** | Anthropic / OpenRouter / Google GenAI (resume parsing, assistants) |
| **quiktrack** | **Jira Cloud REST/Agile API** (migration importer); GCS; SMTP |
| **quikcrm** | Telephony providers (RP Digital / IndiaVoice click-to-call + webhooks); public REST API (API-key auth) |
| **quikinfra** | Whitebooks (GST vendor lookup), OpenCage (geo); GCS |

### 18.3 The quiksocial AI integration (representative deep pattern)

```
Browser → Next API (generate-image/campaign/scrape)
  → POST Python service (X-QS-Internal-Token) → { job_id, ws_token }
  → Next relays { jobId, wsToken, wsUrl } to browser
  → Browser opens WebSocket ws(s)://.../ws/<kind>/<jobId>?ws_token=…
  → Celery worker streams progress/results; uploads images to Cloudinary
Reverse: Python monitor task → Next /api/internal/auto-reply/* (posts, rules, cursors, Page token)
```

---

## 19. Security Implementation

- **Tenant isolation** — `orgId` on every query, sourced from the session JWT (never request params); verified in tests. The single most important security control.
- **Password security** — bcrypt (cost 10–12); unique 12-char temp passwords (only hash stored); reset-password policy (≥8 chars, upper/digit/special); `mustChangePassword` gate.
- **OAuth/OIDC hardening** — PKCE S256, one-time auth codes, refresh-token rotation, client secrets bcrypt-compared, RS256 id_tokens; token endpoint rate-limited **before** bcrypt (fail-closed in prod); issuer refuses localhost in prod.
- **Session security** — short-lived signed handoff tokens (120s), Redis soft-revocation, real-time org-suspension/trial enforcement via `/api/verify-token`, agent JWTs deliberately short-TTL and audited.
- **OTP anti-abuse** — timing-safe compare, 5-attempt lockout, per-IP + per-email rate limits, anti-enumeration (generic 400s).
- **CORS allow-lists** — `AUTH_CORS_ORIGINS` (forgot-password), `AUTH_ALLOWED_RETURN_ORIGINS` (handoff return).
- **Input validation** — Zod `safeParse` everywhere; consistent 400 via `validationError`.
- **SQL injection** — Prisma parameterized queries; raw SQL (admin role reads, quiksocial publish claim) uses parameter binding + a strict `SAFE_SLUG = /^[a-z0-9_-]+$/` whitelist for interpolated schema names.
- **Prod-safety gate** — `scripts/check-prod-urls.mjs` (CI + husky pre-push on `main`/`uat`) fails on any hard-coded `localhost`/`127.0.0.1`; `requireProdEnv()` throws in prod when a required env var is unset (no silent localhost fallback).
- **Secret hygiene** — `.env*` excluded from git and Vercel bundle; `INTERNAL_SECRET`/`NEXTAUTH_SECRET` shared across the cluster and rotated together.
- **`actingAs` principal typing** — JWTs carry an allow-listed actor type (`user`/`ai_agent`/`platform_service`/`scheduled_job`) for audit attribution.

---

## 20. Error Handling & Logging

- **Error contract** — every route returns `{ success: false, error: string }` with the right status; `withOrgAuth` wraps handlers in a try/catch producing the 500 shape; explicit try/catch only for specific statuses (e.g. 409). Stack traces never leak to clients.
- **Structured logging** — QuikInfra's `src/lib/observability/logger.ts` emits JSON-lines with a stable snake_case `msg` id, structured fields (never interpolated secrets/SQL/stacks), auto-attached `x-request-id`, errors to stderr with serialized error objects, `LOG_LEVEL`-filtered (default `info`), child loggers via `.with(context)`.
- **Sentry** — client/server/edge configs in quikit/quikscale/quiksocial; `Sentry.init` no-ops if `SENTRY_DSN` unset; `tracesSampleRate` 0.1 prod / 1.0 otherwise; `instrumentation.ts` skips Sentry in dev to avoid OpenTelemetry compile cost; dispatches by `NEXT_RUNTIME`.
- **Telemetry** — `ApiCall` rows (method/path/status/duration/IP/UA/orgId/userId) written fire-and-forget after each request; hourly rollups; `AppHealthCheck`; `SessionEvent`/`AuthLog`.
- **Audit** — mutations write `writeAuditLog` (cross-app `AuditLog` in `public`; QuikScale has a richer per-entity `AuditEvent`/`AuditChange`; QuikInfra `CnAuditLog` + approval history). In the admin portal, the `ApiCall` telemetry row is the de-facto audit trail.

---

## 21. Performance Optimizations

- **Layered caching** collapses per-request auth/permission overhead to ~zero (React.cache → LRU → Redis → DB), with short TTLs bounding staleness.
- **`select` over `include`** for list endpoints; bounded `take`; `Promise.all([findMany, count])` for list+total.
- **N+1 avoidance** — nested relation `select`s and bulk fetch+stitch instead of queries inside `.map()`.
- **Composite indexes** on `(orgId, …)` for common filters; append-only ledgers with derived balance tables (QuikInfra) avoid recompute.
- **React Query** client caching (`staleTime 60s`) + targeted `invalidateQueries` on mutation.
- **ISR** (`revalidate=60`) for marketing/static pages; `force-dynamic` for session-aware routes.
- **Atomic work claiming** — quiksocial's publish cron uses `FOR UPDATE SKIP LOCKED` so concurrent workers never double-publish.
- **Neon pooler** at runtime (PgBouncer) with a direct URL reserved for migrations; Prisma `connection_limit` tuned in dev.
- **HTTP `Cache-Control` tiers** + `Vary: Cookie` on QuikInfra master-data GETs; DB-backed idempotency keys prevent duplicate side effects.
- **Deadlock safety** — QuikScale weekly-value recompute wrapped in `withTxRetry`.

---

## 22. Background Jobs & Scheduled Tasks

**Reality check:** BullMQ/Redis queue backends have been **disabled or removed** in QuikCRM and QuikHRMS; most scheduled work runs as HTTP cron routes (guarded by `CRON_SECRET`) or in-process timers. There is **no unified job system** — each app differs.

| App | Scheduled / background work |
|---|---|
| **quikit** | Super-admin cron routes: `generate-invoices`, `cleanup-api-calls` (scheduled); `rollup-api-calls`, `health-check`, `evaluate-alerts` (UI-triggered) |
| **quikcrm** | 2 Vercel crons → `/api/notifications/tasks/daily` (morning 03:30 UTC / evening 11:30 UTC = 9 AM / 5 PM IST). **BullMQ worker is a disabled stub** (`process.exit(1)`); enqueue helpers no-op; workflow engine dormant; SSE streams return 503 → UI falls back to React Query polling |
| **quikhrms** | 3 Vercel crons (`payroll-auto-create` 02:00, `tickets-auto-close` 03:00, `tickets-sla-breach` hourly) + 4 external POST crons (preboarding activate, interview feedback trigger/reminder, candidate doc reminder). **Queues removed**; heavy jobs run fire-and-forget in-process (`lib/run-background.ts`) with Postgres-polled progress (relies on persistent GKE `next start`, not serverless) |
| **quiksocial** | **In-process `setInterval` driver** booted from `instrumentation.ts`: `publish-scheduled` every 30s (atomic claim + publish + overdue sweep), `auto-reply-monitor` every 60s (enqueues Python Celery tasks). Suppressed by `DISABLE_INPROCESS_CRON`. `vercel.json` has no `crons` block |
| **quikvc** | 1 Vercel cron `daily-summary` (Claude Haiku brief). *Caveat: `vercel.json` schedules it monthly (`30 0 1 * *`) though the code/UI intend hourly/daily* |
| **quiktrack** | 2 cron routes (`overdue-notifications` daily, `purge-trashed-projects` 60-day purge). *Caveat: not wired into `vercel.json` crons — schedules are only in code comments* |
| **quiksupport** | Email worker `workers/email-worker.ts` (Redis `EMAIL_QUEUE` poller). *Caveat: dormant — nothing feeds `EMAIL_QUEUE`; no SLA-breach cron (SLA computed on read); no worker in Dockerfile/Vercel* |
| **quikinfra** | **None** — all side effects are synchronous within request-scoped transactions (approval side-effects, ledger posting) |

**Cron auth:** `CRON_SECRET` via `Authorization: Bearer` or `x-cron-secret`, fail-closed; handlers iterate all tenants (session-less, per-row `orgId`).

---

## 23. Environment Configuration

### 23.1 Common vars (identical across the cluster)

| Var | Purpose |
|---|---|
| `DATABASE_URL` / `DATABASE_URL_DIRECT` | Pooled runtime URL / direct migrations URL |
| `NEXTAUTH_SECRET` | **Must match every app** — decodes the shared session cookie |
| `NEXTAUTH_URL` | This app's public origin |
| `NEXT_PUBLIC_AUTH_URL` | Central credentials host (redirect target) |
| `QUIKIT_URL` / `NEXT_PUBLIC_QUIKIT_URL` | OAuth IdP + launcher base |
| `QUIKIT_CLIENT_ID` / `QUIKIT_CLIENT_SECRET` | Per-app OAuth client creds |
| `INTERNAL_SECRET` | **Must match** — guards token-verify + provision-roles + handoff |
| `REDIS_URL` | Cache/session/rate-limit (in-memory fallback in dev; required-in-practice for prod) |
| `SMTP_*` / `RESEND_API_KEY` | Email transport |
| `LOG_LEVEL`, `SENTRY_DSN` | Observability (optional) |

### 23.2 IdP-only & notable app-specific vars

- **quikit:** `JWT_SIGNING_KEY` / `JWT_SIGNING_KEY_PUBLIC` (RS256 PEM; required in prod).
- **auth:** `GOOGLE_CLIENT_*`, `MICROSOFT_CLIENT_*`, `MICROSOFT_TENANT_ID`, `AUTH_ALLOWED_RETURN_ORIGINS`, `AUTH_CORS_ORIGINS`.
- **storage:** `GCS_*` (quiktrack/hrms/crm/infra), `BLOB_READ_WRITE_TOKEN` (quikvc), `CLOUDINARY_*` (quiksocial), `AWS_*` (legacy references).
- **AI:** `ANTHROPIC_API_KEY` (quikvc/quikscale/quikhrms), `GEMINI_API_KEY_1..3` (quikscale), `AI_SERVICE_URL`/`AI_SERVICE_WS_URL`/`QS_INTERNAL_TOKEN` (quiksocial).
- **crons:** `CRON_SECRET` (quikcrm/hrms/social/vc/track).
- **social OAuth:** `META_APP_ID/SECRET`, `LINKEDIN_APP_*`, `GOOGLE_CLIENT_*`.
- **prod:** every prod var is read via `requireProdEnv()` — **unset in prod throws at request time** (no silent fallback).

---

## 24. Deployment Architecture — Local, UAT & Production

**Key finding:** the repo carries **two parallel deployment topologies simultaneously.**

### 24.1 Three environments

| Environment | Mechanism | Domains |
|---|---|---|
| **Local** | `npm run dev` per app on ports 3000–3010; local Postgres + optional Redis (in-memory fallback) | `localhost:<port>` |
| **UAT** | Push to **`UAT` branch** → GitHub Actions builds Docker images → GHCR → updates GitOps repo `uat-k8s-infra-quikit` → Kubernetes (Argo/Flux) | `uat*.quikit.ai` (uatapps, uatauthn, uatscale, uatorgadmin, uatinfra, uatcrm, uatpeople, uatsupport, uatasset) |
| **Production** | **(a) Vercel** per-app projects auto-deploying **`main` only**; **(b) `Prod` branch** → Docker/GHCR/K8s + `prisma migrate deploy` against **GCP Cloud SQL** | `apps.quikit.ai`, `authn.quikit.ai`, `scale.quikit.ai`, `asset.quikit.ai`, `support.quikit.ai`, `orgadmin.quikit.ai`, `people.quikit.ai`, `crm.quikit.ai`, `infra.quikit.ai` |

### 24.2 Vercel main-only gating (three layers)

Every per-app `vercel.json`:
```json
{ "git": { "deploymentEnabled": { "main": true } },
  "ignoreCommand": "if [ \"$VERCEL_GIT_COMMIT_REF\" = \"main\" ]; then exit 1; else exit 0; fi" }
```
1. `deploymentEnabled.main` allow-lists only `main`.
2. `ignoreCommand` exits 1 (build) for `main`, 0 (skip) otherwise.
3. Vercel dashboard "Production Branch = main"; preview deployments disabled.

`.vercelignore` excludes `.env*` (local symlinks to a secrets dir absent in the build container), `.next`, `.turbo`, `node_modules`, `coverage`.

### 24.3 Docker → K8s pipeline

- **Multi-stage `turbo prune --docker`** on `node:20-alpine`: prune → `npm ci --ignore-scripts` on pruned json → `prisma generate` → `turbo build --filter=<app>`. Build-time placeholder DB/NextAuth env (Prisma instantiates during `next build`); a cache-bust layer embeds `NEXT_PUBLIC_*` so BuildKit invalidates when they change; `.env.production` written so Next's `loadEnv()` picks up client vars.
- **Runner** — Next standalone output (`server.js`), copies Prisma engines explicitly, runs as non-root `nextjs:nodejs` (uid 1001).
- **`UAT.yml`** detects changed apps (`dorny/paths-filter`; a `packages/**` change rebuilds all), matrix-builds, pushes `ghcr.io/<owner>/<app>-runtime:sha-<short>`, then `yq`-rewrites deployment YAML image tags in the GitOps repo and commits.
- **`prisma.yml`** (`Prod` branch) authenticates to GCP (`GCP_SA_KEY`), starts the Cloud SQL Auth Proxy to `red-seeker-477810-i0:asia-south1:quikit-db`, and runs `prisma migrate deploy`.

### 24.4 Branch → deploy mapping

```
feature/* | fix/*  ──►  dev  ──►  uat  ──►  main
     (PRs)          (integration)  (QA)   (Vercel prod)

UAT branch  ──►  Docker/GHCR/K8s (uat*.quikit.ai)
Prod branch ──►  Docker/GHCR/K8s (*.quikit.ai) + prisma migrate deploy (GCP Cloud SQL)
```

*(The two production references — Neon in docs/env vs GCP Cloud SQL in `prisma.yml` — should be reconciled; treat this as a live architectural question.)*

---

## 25. CI/CD Pipeline

All workflows in `.github/workflows/`.

| Workflow | Trigger | What it does |
|---|---|---|
| **ci.yml** | PR + push to `dev/uat/main` | `npm ci` → `db:generate` → turbo `lint`/`typecheck`/`test` → quikscale coverage → **coverage ratchet** → `npm audit` (advisory) → `prisma migrate status`. Separate **e2e** job on push-to-main only (postgres:16 service, seed, Playwright) |
| **e2e.yml** | nightly `0 3 * * *` + dispatch | Full Playwright against quikscale (kept off PRs for cost); 20-min timeout |
| **pr-hygiene.yml** | PRs | Branch-name regex (`feature/*\|fix/*\|chore/*\|refactor/*\|integrate-*`); Conventional-Commit subjects; informational `packages/**` protection flag |
| **prod-safety.yml** | PR + push `main/uat/dev` | `check-prod-urls.mjs` — no hard-coded localhost |
| **UAT.yml** | push `UAT` | Docker build changed apps → GHCR → GitOps image bump |
| **docker-build-ghcr.yml** | push `Prod` | Docker build with prod build-args → GHCR |
| **prisma.yml** | push `Prod` | Cloud SQL proxy → `prisma migrate deploy` |
| **dev-repo-ci.yml.template** | (per-dev repos) | Slimmed CI + branch/commit checks |

**Guards:** `.husky/pre-push` runs `check-prod-urls.mjs` only for `main`/`uat` (dev exempt). `scripts/affected-apps.mjs` reports which apps redeploy for a diff (any `packages/**` change → all apps). `scripts/coverage-ratchet.mjs` fails if lines/statements/functions/branches drop > 0.25 pp vs `coverage-baseline.json`.

**Branch protection:** `dev`, `uat`, `main` receive merges only. Merge path `feature/* | fix/*` → `dev` (`--no-ff`) → `uat` → `main` (fast-forward). Only `main` deploys to Vercel prod.

---

## 26. Testing Architecture

- **Frameworks:** Vitest (unit/API/component), Playwright (E2E). All tests under `__tests__/` (never `tests/`).

| Path | Environment | Purpose |
|---|---|---|
| `__tests__/unit/*.test.ts` | node | Pure functions |
| `__tests__/permissions/*.test.ts` | node + `vitest-mock-extended` | DB-touching permission logic |
| `__tests__/api/*.test.ts` | node + mocked Prisma + mocked session | Route handlers called directly |
| `__tests__/components/*.dom.test.tsx` | jsdom (per-file directive) | React components |
| `__tests__/e2e/*.spec.ts` | Playwright (excluded from Vitest) | Full flows |

- **Mocking:** Prisma via `__tests__/helpers/mockDb.ts` (mocks `@quikit/database` + `@/lib/db`, preserves enum re-exports); sessions via `setSession(user)`. Never mock the module under test; import route handlers and call with a constructed `NextRequest`.
- **When required:** every bug fix ships a regression test; every new API route ships 401 + cross-org + happy-path tests; new shared utilities ≥90% coverage; permission helpers get an admin/team-head/self/other matrix.
- **Vitest config** (quikscale): `env: { TZ: "UTC" }` for determinism; `resolve.alias` map wires `@quikit/*` subpaths to source. **Playwright** uses `build && start` (not dev) to avoid HMR flake; `retries: 2` / `workers: 1` in CI.
- **Coverage ratchet** guards regression; seeds in `packages/database/prisma/`.

---

## 27. Feature-Wise Implementation — Every Application

### 27.1 quikit — Launcher + OAuth/OIDC IdP + Super-Admin (port 3000)

**Purpose:** platform front door — marketing site, `/apps` launcher (tile grid + org switcher), the OAuth/OIDC IdP, and the super-admin control plane.

**Feature areas:** `(marketing)` (JSON-driven brochure + blog); `(launcher)` (`/apps`, `/apps/[slug]`, `/billing`); `(super-admin)` (`/organizations` + `[id]` with Analytics/AppAccess/Billing/Health/Impersonate panels, `/platform-users`, `/app-registry`, `/feature-flags/[appSlug]`, `/broadcasts`, `/plans`, `/analytics`, `/audit`).

**Key APIs:** the full OIDC surface (§7.2); `/api/apps/launcher` (tile-visibility engine); `/api/launch-token` (120s handoff); `/api/super/*` (orgs/users/apps/plans/invoices/feature-flags/broadcasts/analytics/alerts/impersonate + cron routes); `/api/invitations/accept`; `/api/auth/signout-global`.

**Models (`quikit` schema):** `App`, `OAuthClient`, `OAuthCode`, `OAuthRefreshToken`, `UserAppAccess`, `OrgAppAccess`, `Org`, `OrgMember`, `Subscription`, `Plan`, `Impersonation`, `PlatformAlert`, `AppModuleFlag`.

**Notable mechanics:** RS256 token issuance with PEM normalization; fire-and-forget cross-app role provisioning; single-use rate-limited impersonation; org-creation transaction that seeds members + app-access + module flags + roles + onboarding email.

### 27.2 auth — Central Credentials Service (dev 3001 / prod 3004)

**Purpose:** the single source of truth for identity; every app redirects unauthenticated users here.

**Pages:** `/login` (multi-step SignInComponent), `/register` (3-step OTP), `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`, `/set-password`, `/invitations/accept`.

**Key APIs:** `/api/auth/[...nextauth]`; `/api/post-login` (handoff bridge); `/api/verify-token` (internal session check + org/subscription state); OTP reset (`verify-otp`, `reset-password`); registration (`register`, `resend-otp`, `register/complete`); `/api/auth/internal/issue-agent-jwt`; `/api/auth/signout-global`.

**Models:** `auth.User`, `VerificationToken`, `OAuthAccount`, `AgentJwtIssuance`, `SessionEvent`; `quikit.Org`, `OrgMember`, `Subscription`, `UserAppAccess`.

### 27.3 admin — Org Admin Portal (dev 3002 / prod 3005)

**Purpose:** per-org management of Members, Teams, Apps, Roles, Audit, Settings; a consumer app federating through quikit.

**Pages/APIs:** Overview (Redis-cached stats), **Members** (fully wired invite/edit/activate/remove), **Teams** (fully wired), **Roles** (list works; create/edit/delete return **501** pending shared-schema RBAC), Apps/Audit/Settings (placeholders). Notable: `/api/roles?appSlug=` reads `app_<slug>."AppRole"` via **guarded raw SQL** (SAFE_SLUG whitelist + parameterized `orgId`).

**Auth model:** role-based (`requireAdmin` on every route + middleware); `ApiCall` telemetry is the de-facto audit trail.

### 27.4 quikscale — Strategy Execution (dev 3003 / prod 3002) — flagship

**Purpose:** multi-tenant Scaling-Up execution suite — OPSP → KPI → Priority → WWW → meeting cadence → performance management.

**Modules:** Dashboard (13-week traffic-light consolidation); **KPI** (individual + team, quarterly goal auto-split into 13 weekly targets, multi-owner contribution %, parent→child cascade, reverse-color, XLSX export); **OPSP** (large multi-section form + review/history/categories, finalize→lock cascade); **Priority** (per-week status within `[startWeek,endWeek]`); **WWW** (Who-What-When + due-date revision log); **Client Meetings / Meeting Rhythm** (daily-huddle/weekly-meeting, 6-month compliance grid, Excel exports — ~32 routes); **Performance** (scorecard, reviews, goals, feedback, one-on-one, talent 9-box, trends, cycle, self, survey — ~20 pages); Settings + org-setup.

**Notable mechanics:** the traffic-light logic (`lib/utils/colorLogic.ts` — forward ≥120 blue / ≥100 green / ≥80 yellow / <80 red / neutral; reverse short-circuits not-updated first); `/api/kpi/[id]/weekly` recomputes QTD/progress/health and **bidirectionally mirrors** team KPI ↔ owners' child KPIs (deadlock-safe `withTxRetry`); RBAC v2 seeding (`admin` all-but-two grants + `Member` curated); Gemini semantic-dedup with key-pool failover; react-pdf OPSP export; Redux `tables` slice.

**Models (`app_quikscale`):** `KPI` (+ `KPIWeeklyValue`/`KPINote`/`KPILog`), `Priority` (+ `PriorityWeeklyStatus`), `WWWItem` (+ `WWWRevisionLog`), `OPSPData` (+ sections/review), `PerformanceReview`, `Goal`, `TalentAssessment`, `OneOnOne`, `Client*`, RBAC `Qs*`.

### 27.5 quiktrack — Project/Task Tracker + Docs (port 3004)

**Purpose:** Jira-clone with issue tracking, sprints, multiple views, a docs wiki, timesheets, reporting, and a Jira migration path.

**Modules:** Spaces (projects) with **board / grouped-kanban / list / task-table / backlog / timeline / epics / summary**; per-space **docs** (Tiptap wiki, folders, public share tokens); **timesheets**; **reports** (executive/resource); org-setup + settings (incl. **Jira migration**).

**Notable:** `withProjectAccess` returns 404 for non-members (no existence leak); **project roles override app-wide roles** inside a space; field-level permissions; **GCS** storage (server upload → stable proxy → 15-min signed GET); Jira Cloud importer (`migrate-jira.ts`, `maxDuration=300`, 3-sweep parent linkage, attachment re-upload to GCS); 2 cron routes (schedules only in comments, not wired to `vercel.json`).

**Models (`app_quiktrack`, 46):** `QtProject`, `QtIssue` (+ status/type/group/comment/attachment/history/link/watcher), `QtSprint`, `QtDoc`/`QtDocFolder`/`QtDocShare`, `QtTimesheetEntry`, RBAC `Qt*` (app + project scoped), custom fields, dashboards/views/notifications.

### 27.6 quikvc — Venture-Capital Deal Flow (dev 3005 / prod 3008)

**Purpose:** VC/venture-debt operating system — sourcing → founder application → 9-stage evaluation (AI scoring, risk, IC memo, IC voting) → decision → capital ops (term sheets, allocation, capital calls, repayments), across `(vc)`/`(founder)`/`(investor)` portals.

**Notable:** Claude AI chokepoint (`lib/ai/claude.ts`, stubbed without key) for scoring/memo/transcript/comparables/daily-brief; IC vote settlement engine (single/multi + quorum + threshold); Vercel Blob storage (4.5 MB cap); Resend + react-email with kill-switch; inbound-email sourcing webhook; INR paise `BigInt`. *Caveat: daily-summary cron scheduled monthly in `vercel.json` vs intended hourly; `withOrgAuth` mislabels `appSlug` as "quikscale" (template leftover).*

**Models (`app_quikvc`, ~27):** `VCFundProfile`, `VCVertical`, `VCScoringCriterion`, `VCApplication`, `VCDeal`, `VCTimelineEvent`, `VCDealDocument`, `VCDealQuestion`, `VCDealScore`, `VCDealSignal`, `VCICMemo`/`Version`, `VCComparableCompany`, `VCMeeting`/`Transcript`, `VCICVote`, `VCInvestor`, `VCCommitment`, `VCCapitalCall`/`Payment`, `VCDealAllocation`, `VCRepaymentSchedule`/`Payment`, `VCTermSheet`/`Template`, `VCSourcedOpportunity`, `VCNotification`, `VCAuditLog`.

### 27.7 quikinfra — Construction ERP (port 3006, `src/` layout, pnpm)

**Purpose:** construction ERP from Excel BOQ import → execution (WBS, estimation, work orders, DPR) → procure-to-stock (requisition → indent → RFQ → PO → GRN → stock) → client billing (RAB), with an approval-workflow engine and append-only ledgers.

**Notable:** the **BOQ → procurement → approval → stock** flagship flow — **GRN approval is the only event that credits inward stock** (`postGRNInward` → `CnStockLedger` weighted-average + `CnStockBalance`); **DPR approval** posts BOQ progress + deducts consumed material (moving-average); **RAB approval** posts the billing ledger; multi-level approval chains (`CnApprovalWorkflow`); GCS presigned two-stage upload; HTTP cache tiers + DB idempotency; **dual permission namespaces** (`construction.*` live vs legacy fallback). No background jobs — all side effects synchronous in transactions.

**Models (`app_quikinfra`, 86, `Cn*`):** masters (Company/Vendor/Customer/Item/Project/Machinery/Asset…), procurement (PurchaseRequisition/Indent/Rfq/PurchaseOrder/GoodsReceiptNote + Lines), store (StockLedger/StockBalance/MaterialIssue/GatePass/GoodReturn/StockTransfer/Reconciliation/DieselLog), projects (BOQItemV2/BOQImportBatch/BOQLockState/BOQProgressLedger/BOQBillingLedger/WorkOrder/WBSTask/DailyProgressReport + entries/RunningAccountBill/RABLine), workflow (ApprovalWorkflow/Instance/History/AuditLog/IdempotencyKey/FileObject), RBAC `Cn*`.

### 27.8 quiksocial — AI Social-Media Management (port 3007)

**Purpose:** AI-generated on-brand content, scheduling/publishing to Facebook/Instagram (LinkedIn/YouTube OAuth wired), campaigns, media library, and comment auto-reply — powered by a Python AI service.

**Modules:** Dashboard, Brands (+ AI-scrape creation wizard), Catalog (Offerings), Content Hub, Post Composer, Campaigns, Calendar, Approval, Assets (Cloudinary), Auto-reply, Integrations, Settings.

**Notable:** Python/FastAPI AI service on Railway (Celery + WebSocket, bidirectional `X-QS-Internal-Token`); OAuth connect + Meta publishing (`lib/meta/dispatch.ts`, FB/IG only); **in-process `setInterval` cron** (30s publish w/ `FOR UPDATE SKIP LOCKED`, 60s auto-reply); per-brand `BrandMembership` roles on top of RBAC v2; Cloudinary org-namespaced storage. *Caveats: README is a stale template; publishing is Meta-only; dead Email/Drips nav; Python side still speaks `tenant_id`/snake_case.*

**Models (`app_quiksocial`, 22):** `Brand`, `BrandInvite`/`Assignment`/`Membership`, `AssetLibrary`, `Campaign`, `Post`, `Offering`, `SocialAccount`, `UserPreference`, `AutoReplyRule`/`PostControl`/`Log`/`Cursor`, RBAC `Qs*`.

### 27.9 quikcrm — CRM / Sales (port 3008)

**Purpose:** full B2B sales lifecycle — lead → account/contact → opportunity → CPQ (products/price-lists/quotes+portal) → orders/invoices, plus activities/tasks, marketing, telephony, automations/SLA, imports, reporting.

**Notable:** the money path (lead convert → opportunity stages → quote Draft→Active→signed via customer portal → Won → convert-to-order); opportunity-lost cascade auto-loses linked quotes; React Flow automation builder (engine present but **dormant** — BullMQ disabled); telephony click-to-call + webhook logging; GCS document storage; two RBAC layers + record-level account ACL; public REST API (API-key). Runs 2 Vercel task-reminder crons.

**Models (`app_quikcrm`, ~90, `Crm*`):** `CrmLead`, `CrmAccount`, `CrmContact`, `CrmOpportunity` (+ product/meeting/transition), `CrmQuote` (+ line/approval/portal/engagement), `CrmOrder` (+ line), `CrmProduct` (+ variant/inventory), `CrmPriceList`, `CrmActivity`, `CrmTask`, `CrmWorkflowDefinition`, `CrmSlaRule`, `CrmCampaign`, `CrmCallLog`, RBAC `Crm*`, `CrmUserAccountAccess`, `CrmSalesGroup`.

### 27.10 quikhrms — HR Management (port 3009)

**Purpose:** full API-first HRMS — recruitment → onboarding → core HR (employees/attendance/leave/payroll) → performance/engagement → offboarding, plus assets/documents/expenses/tickets/analytics, with **Indian statutory payroll** (EPF/ESI/PT/TDS/Form 16/24Q). 143 pages, 373 API files under `/api/v1/hrms/*`.

**Notable:** the monthly payroll pipeline (cron auto-create Draft PayRun → background Compute (202 + polled status) applying statutory + loan EMIs → reconcile/adjust → approval chain → **Release** records LoanRepayment, refreshes TDS, emails payslip PDFs); multi-approver leave (balance increments only when all approve); recruitment→onboarding with tokenized candidate portals + reminder crons; **RBAC keyed on Employee.id** (DENY wins); PreBoarding lockdown allowlist. **Queues removed** — heavy jobs run fire-and-forget in-process (relies on persistent GKE runtime); DB-backed, admin-editable email templates (19).

**Models (`app_quikhrms`, largest — ~283):** `Employee`, `Department`, `Designation`, attendance (`AttendanceRecord`/`ShiftPolicy`/`Roster`), leave (`LeaveType`/`LeaveRequest`/`LeaveApproval`/`LeaveBalance`), payroll (`PayRun`/`Payslip`/`PayslipLine`/`EmployeeSalary`/`SalaryStructure`/`EmployeeLoan`/`TdsChallan`/`Form12BB`/`FullAndFinalSettlement`), recruitment (`JobRequisition`/`Candidate`/`Interview`), `Ticket`, RBAC `Hrms*`.

### 27.11 quiksupport — Helpdesk / Ticketing (port 3010)

**Purpose:** ticketing with agent queues, SLA policies, categories, reports; ported from a standalone `helpdesk-mgt` app (keeps its own inline-styled UI/theme).

**Notable:** a single dynamic route hands off to a client `HelpdeskShell` that switches views (Dashboard/TicketList/TicketDetail/Queue/Categories/SLA/Reports/Users/Settings) — no per-feature URL; two RBAC layers (`Hd*` domain roles + `Qsp*` platform RBAC) with an upgrade-only login sync; SLA computed on read; local-filesystem attachments (ephemeral). *Caveats: email pipeline wired but dormant (nothing feeds `EMAIL_QUEUE`); no SLA-breach cron; no inbound email-to-ticket.*

**Models (`app_quiksupport`, 30):** `Hd*` (Tenant/App/User/Category/Subcategory/CategoryAgent/Ticket/Message/Attachment/StatusHistory/SlaConfig/Notification + legacy Role/Permission/Mapping/AuditLog) + `Qsp*` platform RBAC.

---

## 28. End-to-End User Journeys

### 28.1 First login → working in an app (SSO)

```
1. User opens quikscale.quikit.ai → middleware: no session → redirect to authn.quikit.ai/login
2. Signs in (email+password bcrypt, or Google/Microsoft) → jwt callback mints Redis session, picks first active org
3. auth mints a 120s HS256 handoff token → redirect scale.quikit.ai/auth-handoff?token=…
4. quikscale verifies token → sets host-scoped JWE cookie → lands the user on the dashboard
5. Next navigations: middleware → central /api/verify-token (session live? org active? subscription ok?)
6. Every API call → withOrgAuth resolves { userId, orgId, role } → module gate → RBAC → orgId-scoped query
```

### 28.2 Org onboarding (super-admin)

```
Super-admin creates org → transaction: Org + first Org-Admin OrgMember(invited) + OrgAppAccess + default-off module flags
  → fire provisionAppRolesForOrg (each granted app seeds its roles)
  → onboarding email with one-time temp password
Org admin accepts invite → sets password → membership active → lands on launcher /apps
Org admin invites members (admin portal) → per-app access + roles → members onboard the same way
```

### 28.3 Business scenario — QuikInfra procure-to-stock

```
Import BOQ Excel → lock tender qty/rate → Purchase Requisition (budget-checked) → Indent → RFQ (compare vendor quotes)
  → PO (L1 site → L2 HO approval chain) → GRN
  → GRN APPROVAL posts inward stock (CnStockLedger weighted-average + CnStockBalance) in one transaction
Later: DPR approval posts BOQ progress + deducts consumed material; RAB approval posts the billing ledger → client bill PDF
```

### 28.4 Business scenario — QuikHRMS monthly payroll

```
Cron 02:00 auto-creates Draft PayRun (per tenant paySchedule) → HR triggers Compute (202, background)
  → applies statutory (EPF/ESI/PT/TDS) + loan EMIs → Payslip/PayslipLine → reconcile/adjust → approval chain
  → Release: status Paid, LoanRepayment recorded, TDS refreshed, payslip PDFs emailed → employees view in my-payslips
  → HR exports bank advice + Form 24Q
```

### 28.5 Business scenario — QuikCRM lead-to-cash

```
Lead (scored, optional auto-distribution) → convert → Account + Contact + Opportunity(Prospecting)
  → advance stages → build Quote (products + price list + GST) → Draft→Active (pricing locks) → PDF/portal link
  → customer signs in portal → Quote Won → Opportunity ClosedWon → convert-to-order (idempotent) → Order → Invoice
  (Opportunity ClosedLost auto-loses linked active quotes)
```

---

## 29. Best Practices Followed

1. **Tenant isolation as a first-class invariant** — `orgId` on every query from the session, enforced in review and tests.
2. **Shared foundations** — auth/DB/UI/cache/constants centralized; fix once, ships everywhere.
3. **Defense-in-depth authorization** — module gate → membership → app-access → fine-grained RBAC.
4. **Consistent API contract** — one response shape, Zod validation, typed errors, audit on mutation.
5. **Fail-open caches, fail-closed only where it matters** — availability over strictness for non-critical paths; rate limits and cron auth fail closed.
6. **Short-TTL caching with pub/sub invalidation** — near-zero auth overhead, sub-second admin-change propagation.
7. **Strict branch protection + main-only production deploys** — with a prod-safety gate blocking localhost leakage.
8. **Coverage ratchet + required regression tests** — quality can only go up.
9. **Server-first components + React Query** — small client bundles, cache-aware fetching.
10. **Secret hygiene + env-driven config** — `requireProdEnv` throws rather than silently falling back to localhost in prod.
11. **Idempotency + append-only ledgers** (QuikInfra) — safe retries, auditable financial history.
12. **Atomic concurrent work claiming** (`FOR UPDATE SKIP LOCKED`) — no double-processing without a distributed lock.

---

## 30. Limitations, Assumptions & Future Enhancements

**Known limitations / caveats (surfaced from the code):**

- **Dual deployment topology unreconciled** — Vercel (main-only) and Docker→K8s (`UAT`/`Prod`) coexist; production DB is referenced as both **Neon** (docs/env) and **GCP Cloud SQL** (`prisma.yml`). Clarify the source of truth.
- **Background-job inconsistency** — no unified queue system; BullMQ is disabled (quikcrm) / removed (quikhrms); several crons are unwired or misscheduled (quikvc daily-summary is monthly in `vercel.json`; quiktrack crons only in comments; quiksocial relies on in-process timers unsafe on serverless).
- **quiksupport email is dormant** — templates + worker exist but nothing feeds the queue; no SLA-breach cron; no inbound email-to-ticket; attachments on local disk (ephemeral).
- **admin RBAC is partially deferred** — role create/edit/delete return HTTP 501 pending the shared-schema RBAC migration; no dedicated audit table (uses `ApiCall` telemetry).
- **quikinfra dual permission namespaces** — live `construction.*` vs legacy fallback is the most confusing area; finance module largely `ComingSoon` stubs (RAB is the real feature).
- **Redis fail-open trade-off** — a Redis outage silently disables cross-instance session revocation and makes rate limits per-pod; consumer OIDC apps only support remote revocation if their JWT carries `sessionId`.
- **Two role systems coexist un-synced** in some apps (legacy `OrgMember.role` string vs v2 `UserAppRole`).
- **Storage naming debt** — `s3Key`/`uploadToS3`/`isS3Configured` names persist though the backend is GCS.
- **quikvc `appSlug` mislabel** — its `withOrgAuth` logs `appSlug: "quikscale"` (template leftover), mislabeling API-call telemetry.

**Assumptions baked into the platform:**

- Every app depends on every `@quikit/*` package, so any `packages/` change redeploys all apps on `main`.
- All apps share `NEXTAUTH_SECRET` + `INTERNAL_SECRET`; rotation is a coordinated cluster-wide redeploy.
- One shared PostgreSQL instance; per-app schema isolation (not per-tenant databases).
- India-centric domain assumptions in several apps (INR/paise, IST crons, Indian statutory payroll, GST).

**Future enhancement opportunities:**

- **Unify background processing** — adopt one queue (BullMQ or a managed queue) or standardize on Vercel Cron with proper schedules; remove dormant/stub workers.
- **Reconcile the production stack** — pick Vercel *or* K8s+Cloud SQL as the canonical prod path (or clearly delineate their roles) and document it.
- **Complete the admin RBAC migration** — move per-app role tables to a shared-schema model so admin can manage them without raw SQL and lift the 501s.
- **Consolidate email** into one shared transport abstraction (SMTP + Resend + react-email) with per-app template registries.
- **2FA at login** — the OTP store is already the right shape (a documented path exists to add `otp:2fa:*` + a `User.twoFactorEnabled` gate).
- **Harden serverless assumptions** — apps that rely on in-process timers / fire-and-forget background work assume a persistent Node runtime (GKE `next start`); on Vercel serverless these need external schedulers or a queue.
- **Rename storage/permission legacy identifiers** (`s3Key`, quikvc `appSlug`) to remove confusion.
- **Finish stubbed modules** — quikinfra finance GL, quiksupport notifications/knowledge-base, quikcrm workflow engine activation.

---

*This document reflects the state of the codebase as read directly at authoring time. Where a "caveat" is noted, it is a factual observation from the code intended to help the technical audience separate designed behavior from in-progress or drifted implementation.*
