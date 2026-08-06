# QuikIT Platform — Architecture Overview

> **Purpose:** A presentation-ready summary of the QuikIT platform architecture — how the system is structured, how requests flow, how identity & access work, how data is isolated, and what the shared foundations are.
> **Audience:** Engineering leadership / management review.
> **Source of truth:** the codebase (`apps/*`, `packages/*`, `packages/database/prisma/schema.prisma`) and `docs/`.

---

## 1. Executive Summary

**QuikIT is a multi-tenant SaaS platform delivered as a suite of independent business applications that share one identity system, one database, and one component/design foundation.**

- **One login, many apps.** A user signs in once through a central credentials service and can move between products (OKR/KPI, CRM, HR, Construction ERP, Project Tracking, VC deal-flow, Social, Helpdesk) without logging in again — via an OAuth/OIDC single-sign-on model.
- **Multi-tenant by design.** Every business record is scoped to an **org** (tenant). Data isolation is enforced on every database query.
- **Monorepo, shared foundations.** All apps live in one Turborepo. Auth, database, UI, caching, and constants are shared packages, so a fix propagates everywhere in one change.
- **Modern, type-safe stack.** Next.js 14 (App Router) + TypeScript (strict) + Prisma/PostgreSQL + Redis + Tailwind, deployed on Vercel.

```
        One identity  ─────►  Many products  ─────►  One shared database (org-scoped)
     (central login +          (10+ Next.js apps)      (single Postgres, 10 schemas)
      OAuth/OIDC IdP)
```

---

## 2. The Platform at a Glance

QuikIT is composed of three categories of applications, all built on the same shared packages.

### 2.1 Platform / Identity apps

| App | Port | Role |
|---|---|---|
| **quikit** | 3000 | **Launcher + OAuth/OIDC Identity Provider (IdP).** Hosts the app picker (`/apps`), issues OAuth tokens, and houses super-admin pages. |
| **auth** | 3001 | **Central credentials service.** Hosts the login form, registration/OTP, password reset, SSO (Google/Microsoft), and the cross-domain session handoff. |
| **admin** | 3002 | **Org admin portal.** Members, teams, apps, roles, audit log, settings. |

### 2.2 Product apps

| App | Port | Domain |
|---|---|---|
| **quikscale** | 3003 | OKR / KPI / OPSP / Priority / WWW performance tooling |
| **quiktrack** | 3004 | Project / task / docs tracker (rich-text docs) |
| **quikvc** | 3005 | Venture-capital deal flow (founder / investor / VC-admin) |
| **quikinfra** | 3006 | Construction ERP (BOQ, DPR, stock, procurement, finance) |
| **quiksocial** | 3007 | AI social-media management (talks to a Python AI service) |
| **quikcrm** | 3008 | CRM / sales execution (+ background BullMQ worker) |
| **quikhrms** | 3009 | HR management (employees, payroll, attendance, leave) |
| **quiksupport** | 3010 | Helpdesk / ticketing (tickets, SLA, agent queues) |

### 2.3 Foundation

| App | Role |
|---|---|
| **_template** | Reference scaffold — new apps are cloned from this. |
| **packages/** | Shared code every app depends on (`@quikit/auth`, `@quikit/database`, `@quikit/ui`, `@quikit/redis`, `@quikit/shared`). |

> **Terminology:** the tenant/organization is called an **org**. The scoping column is `orgId` (a platform-wide migration renamed the legacy `tenantId` → `orgId`). You may still see "tenant" in older prose and OAuth scope strings — it means the same thing.

---

## 3. High-Level Architecture

```
                    ┌───────────────────────────────────────────────────────┐
                    │  packages/  (shared — every app depends on these)     │
                    │   @quikit/auth      NextAuth factories, guards, RBAC    │
                    │   @quikit/database  Prisma client + single schema       │
                    │   @quikit/ui        ~50 React components + theme         │
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
                                                    │   PostgreSQL (Neon)    │
                                                    │  single shared DB      │
                                                    │  10 namespaced schemas │
                                                    └────────────────────────┘
```

**Key architectural principles**

1. **Central identity, decentralized apps.** `quikit` is the OAuth/OIDC IdP; `auth` hosts credentials. Every product app is an OIDC client.
2. **Apps never call each other directly.** Cross-app data needs are handled by adding the domain to your app or via a shared service — never a direct app-to-app call.
3. **One database, many schemas.** All apps hit the same Postgres, but each owns a namespaced schema (`app_quikscale`, `app_quikcrm`, …).
4. **Shared everything else.** Auth, UI, caching, and constants come from `@quikit/*` packages so behavior stays consistent.

---

## 4. Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Monorepo | **Turborepo + npm workspaces** | Cached, parallel builds; single `npm install` |
| Framework | **Next.js 14 (App Router)** | Server Components + edge middleware |
| Language | **TypeScript (strict)** | Type-safe across the whole monorepo |
| UI runtime | **React 18** | Pinned via root `overrides` |
| Auth | **NextAuth 4 (JWT strategy)** | `quikit` OAuth/OIDC IdP + `auth` credentials host |
| Auth crypto | **bcrypt** (passwords), **jose** (OIDC id_token / handoff, RS256/HS256) | |
| ORM / DB | **Prisma → PostgreSQL (Neon)** | Multi-schema (10 Postgres schemas) |
| Cache / sessions | **Redis (ioredis)** via `@quikit/redis` | Soft-session store, rate limiting, layered cache (**fail-open**) |
| Server state | **TanStack React Query** | `staleTime: 60s` |
| Client state | **Redux Toolkit** | e.g. quikscale table preferences |
| Styling | **Tailwind CSS** | Extends `@quikit/ui/tailwind-config` |
| Theme | **next-themes** | Light/dark + per-tenant accent color |
| Validation | **Zod** | Same schema on client + server |
| Monitoring | **Sentry** | Client + server |
| Testing | **Vitest** (unit/API/component) + **Playwright** (E2E) | Coverage ratchet in CI |
| Deploy | **Vercel** | Only the `main` branch deploys to production |

> **Per-app variance:** quikinfra uses pnpm, Prisma 5.22, a `src/` layout, and its own `Cn*` RBAC. quikhrms requires Node ≥ 20.14.

---

## 5. Folder Structure

### 5.1 Monorepo layout

```
QuikIT/
├── apps/
│   ├── _template/        # scaffold for new apps
│   ├── quikit/           # launcher + OAuth/OIDC IdP + super-admin
│   ├── auth/             # central credentials / login service
│   ├── admin/            # org admin portal
│   ├── quikscale/        # OKR / KPI / OPSP / Priority / WWW
│   ├── quiktrack/        # project / task / docs tracker
│   ├── quikvc/           # venture-capital deal flow
│   ├── quikinfra/        # construction ERP
│   ├── quiksocial/       # AI social-media management
│   ├── quikcrm/          # CRM / sales
│   ├── quikhrms/         # HR management
│   └── quiksupport/      # helpdesk / ticketing
├── packages/
│   ├── auth/             # NextAuth factories, middleware, guards, session store
│   ├── database/         # Prisma schema + client singleton
│   ├── redis/            # ioredis singleton + cache helpers (fail-open)
│   ├── shared/           # constants, pagination, email, module registry
│   └── ui/               # shared React components, theme tokens, Tailwind config
├── docs/                 # architecture & contributor documentation
├── scripts/              # build / affected-apps / coverage tooling
└── CLAUDE.md             # monorepo-wide conventions
```

### 5.2 Inside a single app (Next.js App Router)

```
apps/<app>/
├── app/
│   ├── (auth)/login/          # route group — login page
│   ├── (dashboard)/           # route group — authenticated app shell + pages
│   │   ├── layout.tsx         # dashboard layout (sidebar, providers, ThemeApplier)
│   │   ├── kpi/page.tsx       # a feature page
│   │   └── settings/page.tsx
│   ├── (marketing)/           # public landing pages
│   ├── api/                   # API route handlers
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── <feature>/route.ts
│   │   └── health/route.ts
│   ├── auth-handoff/          # receives the cross-domain session token
│   ├── globals.css            # imports @quikit/ui/styles + app styles
│   └── layout.tsx             # root layout
├── components/                # app-local React components
├── lib/
│   ├── auth.ts                # picks OIDC-client vs credentials config
│   ├── db.ts                  # re-exports @quikit/database `db` (mockable in tests)
│   └── api/withOrgAuth.ts     # thin auth+RBAC wrapper around @quikit/auth guards
├── __tests__/                 # unit / api / permissions / components / e2e
├── middleware.ts              # createMiddleware() from @quikit/auth
├── manifest.ts                # app metadata
├── vercel.json                # deploy gating (main only)
└── package.json
```

**Naming conventions:** directories `lowercase`; component files `lowercase.tsx` exporting PascalCase components; route files are the App Router reserved names (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`).

---

## 6. Application Flow (End-to-End)

### 6.1 A user's journey

```
1. User visits a product app (e.g. quikscale) → hits a protected route
2. Middleware finds no valid session → redirects to the central auth host (/login)
3. User signs in on `auth` (email+password via bcrypt, or Google/Microsoft SSO)
4. `auth` mints a short-lived (120s) signed handoff token and redirects to
   <app>/auth-handoff?token=…
5. The app verifies the token and sets its own host-scoped session cookie
6. User lands in the app; subsequent navigations re-validate the session
   server-to-server against auth's /api/verify-token
7. Every API call resolves { userId, orgId, role } and scopes all DB access to orgId
```

### 6.2 A single request lifecycle (inside an app)

```
Browser
  │  fetch /api/kpi
  ▼
Middleware  ── validates session (JWT + remote verify-token) ──► 401 → redirect to login
  │
  ▼
API route handler  (wrapped in withOrgAuth)
  ├─ 1. Auth guard        → resolve { userId, orgId, membershipRole }
  ├─ 2. Module gate       → is this module enabled for the org?          (403/404)
  ├─ 3. RBAC permission   → userCan(userId, orgId, resource, action)?    (403)
  ├─ 4. Input validation  → Zod schema
  ├─ 5. DB query          → db.kpi.findMany({ where: { orgId, … } })     (orgId ALWAYS)
  └─ 6. Response          → { success: true, data }
```

Every response follows the contract: success is `{ success: true, data }`; errors are `{ success: false, error: string }` with the right status (POST → 201, others → 200, failures → 401/403/404/500).

---

## 7. Authentication Flow

### 7.1 Two configurations, chosen at runtime

Each app's `lib/auth.ts` picks its NextAuth configuration based on environment:

```ts
export const authOptions =
  QUIKIT_URL && QUIKIT_CLIENT_ID && QUIKIT_CLIENT_SECRET
    ? createOAuthClientOptions({ … })   // Production: authenticate through the IdP
    : createAuthOptions({ … });         // Local dev / migration: direct credentials
```

- **Production model:** the app is an **OIDC client** of the `quikit` launcher.
- **Fallback model:** the app uses a direct **credentials** provider (local dev).

### 7.2 The OAuth/OIDC Identity Provider (`quikit`)

The launcher exposes standard OIDC endpoints:

| Endpoint | Purpose |
|---|---|
| `/.well-known/openid-configuration` | Discovery metadata |
| `/api/oauth/authorize` | Validates client + session + app access; issues a 10-min auth code (PKCE-aware) |
| `/api/oauth/token` | Exchanges code/refresh → opaque `access_token` + RS256 `id_token` + `refresh_token` |
| `/api/oauth/userinfo` | Bearer token → OIDC claims |
| `/api/oauth/jwks` | RS256 public key for signature verification |

Sign-in providers on the central `auth` host: **Credentials** (email+password, bcrypt), **Google OAuth**, **Microsoft / Azure AD**.

### 7.3 Cross-domain session handoff

Because cookies don't cross hosts, sign-in on the `auth` host bridges to each app:

```
auth  ──►  mint 120-second HS256 token (signed with INTERNAL_SECRET)
           carrying { sub, orgId, membershipRole, isSuperAdmin, sessionId, to }
      ──►  redirect to  <app>/auth-handoff?token=…
app   ──►  verify token → set its OWN host-scoped session cookie → land the user
```

The return origin must be on the `AUTH_ALLOWED_RETURN_ORIGINS` allow-list.

### 7.4 Additional login flows

- **Profile completion** — first sign-in without a name prompts a profile form (SSO values prefill it).
- **Forgot / temp password** — issues a temporary bcrypt password + `mustChangePassword`, then a policy-checked reset (≥8 chars, 1 upper, 1 digit, 1 special).
- **Invitation auto-accept** — pending `OrgMember` (status `invited`) rows are promoted to `active` on first login, and matching app-access rows created.

---

## 8. Authorization Flow (Two Role Systems)

A logged-in user is gated by **two independent role layers**, plus module gating.

| | **Membership roles (org-wide)** | **In-app roles (per-app RBAC)** |
|---|---|---|
| **Scope** | Organization-wide | Per-app, per-org |
| **Stored on** | `OrgMember.role` (+ `User.isSuperAdmin`) | `AppRole` / `UserAppRole` / `RolePermission` (per-app schema) |
| **Values** | Fixed: `super_admin`, `org_admin`, `app_admin`, `member` (+ legacy) | App-defined roles → granular `(resource, action)` grants |
| **In session?** | Yes (`membershipRole`, `isSuperAdmin`) | No — resolved per-request from the DB |
| **Used for** | App visibility, admin-portal access, super-admin gating | Fine-grained "can this user do X here" |

### 8.1 The gating pipeline (up to three checks, in order)

```
1. SESSION / MEMBERSHIP  (org-wide)
     requireSuperAdmin → must have isSuperAdmin
     requireAdmin      → ROLE_HIERARCHY[membershipRole] ≥ admin level (5)

2. APP ACCESS  (org → app)
     UserAppAccess(userId, orgId, appId) present?
     enforced at OIDC /authorize + re-checked per request (60s cache)

3. IN-APP PERMISSION  (fine-grained)
     quikscale: userCan(userId, orgId, resource, action)
                = RolePermission (role grant) OR UserPermissionExtra (additive)
     quikinfra: requirePermission("construction.<domain>.<action>")

   + MODULE GATING (feature flags) can hide whole modules per tenant first.
```

### 8.2 Role hierarchy

| Role | Level | |
|---|---|---|
| `super_admin` | 6 | platform-wide (`User.isSuperAdmin = true`) |
| `admin`, `org_admin` | 5 | organization owner / admin-tier apps |
| `app_admin`, `executive` | 4 | admin authority scoped to specific apps |
| `manager` | 3 | |
| `member`, `employee` | 2 | default |
| `coach` | 1 | |

### 8.3 The two layers combined

```
User.isSuperAdmin (platform)
      │ belongs to org via
      ▼
OrgMember.role  ──►  membership layer (super_admin / org_admin / app_admin / member)
      │                → app visibility, admin-portal & super-admin gating
      ▼
UserAppAccess   ──►  can this user use app X in org Y?
      ▼
UserAppRole → AppRole → RolePermission  ──►  in-app RBAC (resource, action) grants
     (+ UserPermissionExtra additive; quikinfra uses Cn* tables + permission keys)
```

**RBAC provisioning:** when a super-admin creates an org or grants app access, the launcher fans out to each app's `/api/internal/provision-roles` (guarded by `INTERNAL_SECRET`) to seed that app's system/default roles.

---

## 9. Session Management

- **Strategy:** NextAuth **JWT** (cookie `next-auth.session-token`). The JWT carries `id, email, firstName, lastName, orgId, membershipRole, isSuperAdmin, sessionId` (+ impersonation and `actingAs` principal claims).
- **Session creation:** on sign-in a Redis session id is minted (`createAuthSession`, 30-day TTL) and stored as `token.sessionId`; the first active `OrgMember` sets `orgId`/`membershipRole`.
- **Liveness & refresh:** the JWT callback throttles a Redis liveness check (~every 30s), re-validates membership (~every 5 min), and extends the Redis TTL.
- **Soft revocation:** the `sessionId` is the revocation handle (`auth:session:{id}` in Redis). If the key is gone, `verifyJWT` returns `null`. Global signout clears cookies across hosts and revokes the Redis session.
- **Server-to-server validation:** consumer-app middleware calls the central `/api/verify-token` (gated by `x-internal-secret`) to validate a JWT and touch its TTL on navigation.
- **Fail-open:** if Redis is down, the liveness check treats the session as active so the platform keeps working.

---

## 10. Routing

- **Framework routing:** Next.js **App Router**. Filesystem = routes. Reserved files: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`.
- **Route groups** (`(auth)`, `(dashboard)`, `(marketing)`) organize routes without affecting URLs — e.g. `(dashboard)` carries the authenticated shell (sidebar + providers).
- **API routes** live under `app/api/**/route.ts` and export HTTP-method handlers (`GET`, `POST`, …), wrapped in the app's `withOrgAuth`.
- **Middleware** (`middleware.ts`) runs on the edge before every matched request via `createMiddleware()` — it handles public routes, remote session validation, unauthenticated redirects, and super-admin/admin gating.
- **Login route:** all apps use `/login` (never `/auth/login`).
- **Cross-app navigation:** the shared `AppSwitcher` component + URL env constants (`QUIKIT_URL`, `QUIKSCALE_URL`, …) link the apps together; `/apps` on the launcher is the app picker.

---

## 11. Database Architecture

### 11.1 One schema file, ten Postgres schemas

All apps share **one** Prisma schema (`packages/database/prisma/schema.prisma`) using the `multiSchema` feature. Each model is placed with `@@schema("…")`:

| Postgres schema | Holds |
|---|---|
| `auth` | Central identity — `User`, `Account`, `Session`, `VerificationToken` |
| `quikit` | `Org`, `OrgMember`, `App`, `UserAppAccess`, `Subscription`, OAuth IdP tables |
| `public` | Cross-app — `Team`, `Notification`, `AuditLog`, `FeatureFlag`, telemetry, `Plan`, `Invoice`, `Impersonation` |
| `app_quikscale` | KPI, Priority, WWW, OPSP, client meetings, RBAC tables |
| `app_quikinfra` | Construction ERP — `Cn*` models (projects, procurement, stock, finance) |
| `app_quikcrm` | CRM — `Crm*` (leads, accounts, opportunities, quotes) |
| `app_quikhrms` | HR/payroll — the largest domain |
| `app_quiktrack` | Project tracker — `Qt*` (issues, docs, custom fields) |
| `app_quiksocial` | Social — posts, auto-reply, integrations |
| `app_quikvc` | Venture capital — `VC*` (deals, scoring, term sheets) |

The schema is large (**7,000+ lines, 200+ models**) — each product domain contributes its own model family (`Cn*`, `Qt*`, `VC*`, …), all isolated by schema namespace so names never collide.

### 11.2 The multi-tenancy rule (most important rule in the codebase)

> **Every Prisma query that reads or writes org-scoped data MUST filter by `orgId`.**

```ts
// ✅ Correct — org-scoped
await db.kpi.findMany({ where: { orgId }, select: { id: true, name: true } });

// ❌ WRONG — leaks data across orgs
await db.kpi.findMany({ where: { id: someId } });
```

Every org-scoped model carries: `id`, `orgId` (indexed, FK to `Org` with `onDelete: Cascade`), `createdAt/updatedAt`, `createdBy/updatedBy`, and `deletedAt` (soft delete). Cross-org queries are forbidden outside super-admin routes.

### 11.3 Query & data conventions

- **`select` for lists** (small payloads), **`include` for detail** (full related model).
- **Soft delete** is automatic on a set of models (`KPI`, `Team`, `Priority`, `WWWItem`, `Meeting`) — reads auto-exclude `deletedAt != null`.
- **Pagination** via the shared utility (`paginationToSkipTake`); every `findMany` has a bounded `take`.
- **Transactions** via `db.$transaction` for atomic multi-write operations.
- **Audit log** — mutations write an `AuditLog` entry (`public` schema); quikscale has a richer per-entity audit system.
- **Migrations** are owned centrally; production runs on Neon with a pooled runtime URL and a direct URL for migrations.

---

## 12. Shared Services (`@quikit/*` packages)

The shared packages are the backbone — every app imports from them and none of them are modified per-app.

| Package | What it provides |
|---|---|
| **`@quikit/auth`** | NextAuth option factories (`createAuthOptions`, `createOAuthClientOptions`), the middleware factory (`createMiddleware`), guard factories (`createRequireAdmin`, `createRequireSuperAdmin`, `createGetOrgId`), the session store (soft revocation), JWT verify, feature gates, and a layered LRU+Redis cache. |
| **`@quikit/database`** | The Prisma client singleton (`db`) with soft-delete middleware, plus re-exported `@prisma/client` types. Re-exported per app via `lib/db.ts` so tests can mock it. |
| **`@quikit/redis`** | A lazily-connected ioredis singleton + best-effort `cacheGet/Set/Del`. **Fail-open** — no-ops when Redis is unavailable so the app keeps working. |
| **`@quikit/ui`** | ~50 React components (forms, tables, modals, pickers), the Tailwind config, design tokens, and the theming system (`ThemeApplier`, per-tenant accent colors). The single source of UI consistency across apps. |
| **`@quikit/shared`** | Constants (`ROLES`, `MEMBERSHIP_ROLES`, `ROLE_HIERARCHY`, statuses, plans), pagination utilities, the module registry (feature entitlement), rate limiting, and email helpers. |

**Why shared:** consistency across all apps, one-PR bug fixes that propagate everywhere, and central refactoring without touching every app. Apps that need something missing propose upstreaming it rather than forking.

### Cross-cutting services

- **Caching** — layered LRU + Redis (`@quikit/auth/cache`) for memberships/app-access; Redis cache-aside in `@quikit/shared`. All fail-open.
- **Rate limiting** — distributed Redis limiter (`@quikit/shared/rateLimit`, server-only).
- **Email** — transactional email (invites, OTPs, notifications) via SMTP with a Resend fallback.
- **Module gating** — per-tenant feature flags (`gateModuleApi` / `gateModuleRoute`) hide whole modules before permission checks.
- **Audit & telemetry** — `AuditLog`, API-call rollups, session/auth logs in the `public` schema.
- **Background jobs** — BullMQ workers (quikcrm) and cron routes (quiksocial, quikhrms, quikcrm) for scheduled work.

---

## 13. Key Components Summary

| Concern | Where it lives |
|---|---|
| Identity Provider (OAuth/OIDC) | `apps/quikit/app/api/oauth/*` |
| Central credentials + SSO | `apps/auth` (login, OTP, reset, `/api/post-login`, `/api/verify-token`) |
| Cross-domain handoff | `apps/auth/.../post-login` → `apps/*/auth-handoff` |
| NextAuth config factories | `packages/auth/index.ts` |
| Middleware (all apps) | `packages/auth/middleware.ts` → each `apps/*/middleware.ts` |
| Guards / RBAC | `packages/auth/require-admin.ts`, `require-super-admin.ts`, per-app `lib/api/` + `permissions.ts` |
| Session store (soft revoke) | `packages/auth/session-store.ts`, `jwt.ts` |
| Database schema (single source) | `packages/database/prisma/schema.prisma` |
| Prisma client singleton | `packages/database` → per-app `lib/db.ts` |
| Shared UI + theming | `packages/ui` |
| Constants / roles / pagination | `packages/shared` |
| Per-app auth wrapper | `apps/<app>/lib/api/withOrgAuth.ts` |

---

## 14. Delivery & Deployment

- **Branch model:** `feature/* | fix/*` → `dev` → `uat` → `main`. Feature branches never merge directly into integration branches.
- **Deploy gating:** **only `main` deploys to production** (Vercel), enforced in three layers (per-app `vercel.json` allow-list + `ignoreCommand`, and the Vercel dashboard production branch).
- **CI:** lint + typecheck + tests + a coverage ratchet run on every PR.
- **Testing:** Vitest (unit / API / permissions / components) + Playwright (E2E). Every bug fix ships a regression test; every new API route ships auth, tenant-isolation, and happy-path tests.

---

## 15. Takeaways for the Presentation

1. **Product suite, one platform.** 8 business apps + 3 platform apps, unified by shared identity, data, and UI.
2. **SSO-first identity.** Central credentials + OAuth/OIDC IdP + cross-domain handoff = one login across every product.
3. **Multi-tenant to the core.** `orgId` scoping on every query; per-app schemas keep domains isolated in one database.
4. **Defense in depth for access.** Session/membership → app access → fine-grained RBAC → module gating.
5. **Shared foundations = leverage.** Auth, DB, UI, cache, and constants are centralized — fix once, ships everywhere.
6. **Modern, type-safe, testable.** Next.js 14 + TypeScript + Prisma + Redis, with CI-enforced quality gates and main-only production deploys.
```

