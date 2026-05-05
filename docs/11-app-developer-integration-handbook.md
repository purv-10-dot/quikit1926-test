# QuikIT App Developer Integration Handbook

> The single document an external/internal app developer needs in order to build an app that plugs into the QuikIT platform.
>
> **Audience:** Anyone writing an app that lives under `apps/<your-app>/` and consumes the shared `@quikit/*` packages. Read this once, end-to-end, before opening your first PR.
>
> **What this is not:** A reference manual for the platform team. If you maintain `packages/*`, this doc is shallow on internals — read the package source.

---

## Table of Contents

1. [Who this is for](#1-who-this-is-for)
2. [Platform at a glance](#2-platform-at-a-glance)
3. [Repo & branch workflow (non-negotiable)](#3-repo--branch-workflow-non-negotiable)
4. [Bootstrap checklist (Day 1)](#4-bootstrap-checklist-day-1)
5. [App identity — `manifest.ts`](#5-app-identity--manifestts)
6. [The common services you will consume](#6-the-common-services-you-will-consume)
   - 6.1 [Auth & SSO](#61-auth--sso-quikitauth)
   - 6.2 [RBAC & Roles](#62-rbac--roles)
   - 6.3 [Multi-Org tenancy model](#63-multi-org-tenancy-model)
   - 6.4 [Database (Prisma + RLS)](#64-database-quikitdatabase)
   - 6.5 [Module registry & feature gates](#65-module-registry--feature-gates)
   - 6.6 [Audit logging](#66-audit-logging)
   - 6.7 [Rate limiting](#67-rate-limiting)
   - 6.8 [Email service](#68-email-service)
   - 6.9 [Redis cache & shared state](#69-redis-quikitredis)
   - 6.10 [UI library & theming](#610-ui-library--theming-quikitui)
   - 6.11 [Pagination contract](#611-pagination)
   - 6.12 [Observability / logging](#612-observability)
7. [API route contract](#7-api-route-contract)
8. [Middleware contract](#8-middleware-contract)
9. [Environment variables — full reference](#9-environment-variables)
10. [Testing requirements](#10-testing-requirements)
11. [Port assignments](#11-port-assignments)
12. [Deployment & release cycle](#12-deployment--release-cycle)
13. [Non-technical: how we work together](#13-non-technical-how-we-work-together)
14. [Common rejection reasons](#14-common-rejection-reasons)
15. [Glossary](#15-glossary)
16. [Where to look / where to ask](#16-where-to-look--where-to-ask)

---

## 1. Who this is for

You are building an app that:

- Lives in its own directory under [apps/](apps/) of the QuikIT monorepo.
- Authenticates users via the QuikIT launcher (single sign-on across every app on the platform).
- Reads/writes data in the shared Postgres database, scoped to a single Org.
- Renders UI using the shared `@quikit/ui` design system so it feels native alongside QuikScale, Admin, QuikVC, QuikConstruction.
- Ships through the same `feature/* → dev → uat → main → Vercel` pipeline as every other app.

If any of those bullets is wrong for your situation, stop and talk to the integration owner before you write a line of code.

---

## 2. Platform at a glance

```
                  ┌──────────────────────────────┐
                  │        quikit (launcher)     │  IdP, app picker, org switcher
                  │   OAuth2 / OIDC / NextAuth   │
                  └──────┬───────────────────────┘
                         │ id_token (RS256, includes orgId, role)
       ┌─────────────────┼─────────────────┬───────────────────┐
       ▼                 ▼                 ▼                   ▼
  ┌─────────┐      ┌──────────┐      ┌──────────┐       ┌────────────┐
  │ admin   │      │ quikscale│      │ quikvc   │ ...   │ <your-app> │
  └────┬────┘      └────┬─────┘      └────┬─────┘       └─────┬──────┘
       │                │                 │                    │
       └────────────────┴─────────────────┴────────────────────┘
                              │
                              ▼
                  ┌────────────────────────┐
                  │  Postgres (Neon)       │  shared DB, RLS by orgId
                  │  Redis (Upstash)       │  cache + rate limit
                  └────────────────────────┘
```

**Core ideas you must internalize:**

| Concept | Meaning |
|---|---|
| **Org** | A customer organization (formerly "Tenant" — the v4 schema renamed it; the label "tenant" still appears in legacy code). Every row in every business table has an `orgId`. |
| **Membership** | A `User × Org` link with a role (`super_admin`, `org_admin`, `member`). Users can belong to many orgs but only one is "active" in the session at a time. |
| **App** | A first-class registered product (admin, quikscale, your app, …). Each has a slug, baseUrl, and a per-org enable flag. |
| **Module** | A sub-feature inside an app, gated per org via `FeatureFlag`. Module keys are dot-delimited (`kpi.teams`, `opsp.scoreboard`). |
| **Launcher** (`quikit`) | The IdP + app grid. Users land here, sign in once, and it issues tokens to every app. Your app must accept these tokens — it does not run its own credential login. |
| **Super Admin** | A platform operator (`isSuperAdmin = true` on the User). Lives in the launcher's `/super` admin pages. **You are not building super-admin tools.** |

**Tech stack you will use:**

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router, Server Components, Route Handlers) |
| Language | TypeScript strict mode |
| Monorepo | Turborepo + npm workspaces (`npm install` at the root) |
| Database | PostgreSQL via Prisma 5.22 |
| Auth | NextAuth v4 + a custom OAuth2/OIDC client to the launcher |
| Validation | Zod (same schema client + server) |
| UI | React 18 + Tailwind 3 + Radix primitives via [packages/ui/](packages/ui/) |
| State | TanStack Query v5 |
| Tests | Vitest (unit / component / API) + Playwright (e2e) |
| Cache / queue | Upstash Redis via [packages/redis/](packages/redis/) |
| Email | Resend (Office 365 SMTP is a deprecated fallback — see §6.8) |
| Hosting | Vercel — production deploys from `main` only |

---

## 3. Repo & branch workflow (non-negotiable)

You get a per-developer fork that is a slimmed-down copy of the master monorepo. You see only **your app**, the shared `packages/*`, the docs, and root config. Other teams' apps are intentionally not visible.

### Branch rules

- **NEVER commit or push directly to `dev`, `uat`, or `main`.** Branch protection blocks it; CI will reject the PR; the integration owner will close it.
- **Every change starts on a fresh branch** named:
  - `feature/<short-description>` — new functionality
  - `fix/<short-description>` — bug fix
  - `chore/<short-description>` — docs, scripts, deps
  - `refactor/<short-description>` — structural change, no behavior delta

### Standard merge path

```
feature/* | fix/* → dev (--no-ff) → uat (ff-only) → main (ff-only) → Vercel production
```

You drive everything up to "open a PR into `dev`". The integration owner drives every promotion after that.

### Pre-push deploy-impact check

Before `git push` on **any** branch, confirm with the integration owner what the push will redeploy:

```
📦 This push will redeploy (only if pushing to main):
   • <your-app>  (apps/<your-app>/**)
⏭️ Will skip (no apps/* changes):
   • quikscale, admin, quikvc, quikconstruction
```

A push to `main` for a `packages/*` change redeploys **every** app — that is why you do not edit `packages/*`.

Helper: [scripts/affected-apps.mjs](scripts/affected-apps.mjs) `<from-ref> <to-ref>`.

### Conventional Commits

```
feat(<app>): add campaign builder UI
fix(<app>): debounce search to avoid race
chore(<app>): bump zod to 3.23
refactor(<app>): extract Modal into shared component
```

CI rejects non-conforming messages.

### Branch cleanup after merge train

```bash
git branch -d <branch>
git push origin --delete <branch>
```

Once the PR has reached `main`, the feature branch is dead — delete it locally and on origin.

> Full details: [docs/02-integration-protocol.md](docs/02-integration-protocol.md).

---

## 4. Bootstrap checklist (Day 1)

You should be able to go from zero to "first PR" in roughly 60 minutes. Detailed walkthrough: [docs/00-getting-started.md](docs/00-getting-started.md).

**Prerequisites:**

- Node 20+, npm 11+
- PostgreSQL 14+ running locally
- Git
- GitHub account added to the integration org
- Claude Code (recommended) or any editor

**Steps:**

1. `git clone <your-per-dev-repo-url>` then `cd` in.
2. `npm install` at the repo root (workspaces resolve).
3. `createdb quikit_dev` (or `psql -c "CREATE DATABASE quikit_dev;"`).
4. `cp apps/<your-app>/.env.example apps/<your-app>/.env.local` and fill in:
   - `DATABASE_URL` — local Postgres URL.
   - `MIGRATION_DATABASE_URL` — same value (no pooler locally).
   - `NEXTAUTH_SECRET` — `openssl rand -base64 32`.
   - `NEXTAUTH_URL` — `http://localhost:<your-port>`.
   - `QUIKIT_CLIENT_ID` / `QUIKIT_CLIENT_SECRET` / `QUIKIT_ISSUER_URL` — leave placeholders; the integration owner provides real credentials at integration time.
5. `npm run db:push` to apply the Prisma schema.
6. `cd apps/<your-app> && npm run dev` to boot the dev server.
7. `npm run test && npm run typecheck && npm run lint` — these MUST pass before you commit; CI runs the same.
8. Make a tiny change in [app/(dashboard)/page.tsx](apps/_template/app/(dashboard)/page.tsx), commit, push, open a PR into `dev`.

**Local SSO caveat:** the OAuth flow to the launcher does not work without real credentials. For local dev, use a NextAuth credentials provider stub (covered in [docs/08-claude-code-setup.md](docs/08-claude-code-setup.md) Batch 3) or temporarily comment out middleware and re-enable before commit.

---

## 5. App identity — `manifest.ts`

Every app declares itself to the launcher at build time via a static [manifest.ts](apps/_template/manifest.ts):

```ts
export interface AppManifest {
  appId: string;            // stable kebab-case ID, used in URLs, audit logs, feature flags
  name: string;             // human label in the launcher grid
  description: string;      // tile hover tooltip
  routePrefix: string;      // path the app owns (e.g. "/social")
  icon: string;             // Lucide icon name (e.g. "Box", "BarChart3")
  permissions: string[];    // must match Permission enum in @quikit/shared
  navigation: { label: string; href: string; icon: string }[]; // sidebar entries, ordered
}
```

**Rules:**

- `appId` and `routePrefix` are part of the platform contract. Once the integration owner signs off, they do not change. Rename the app instead.
- `permissions` strings come from a curated set in `@quikit/shared`. Do not invent new permission strings; coordinate first.
- `navigation` order is what the user sees in the sidebar. Reorder freely during development; freeze after signoff.

The launcher reads every manifest at build time to populate the app grid + permission catalog. A missing or malformed manifest fails the platform build.

---

## 6. The common services you will consume

Everything in this section is provided by `@quikit/*` packages. **You import. You do not modify.** If a feature is missing, file a request in your PR description and the integration owner decides whether to upstream it or let you keep a local workaround.

### 6.1 Auth & SSO (`@quikit/auth`)

QuikIT runs its own OAuth2/OIDC IdP inside the launcher (`apps/quikit`). Every other app is an OAuth client. You never run your own credentials login UI.

#### Subpath exports (always prefer specific paths over the barrel)

| Import | Purpose |
|---|---|
| `import { createAuthOptions } from "@quikit/auth"` | NextAuth options factory (provider config, JWT/session callbacks). |
| `import { createMiddleware } from "@quikit/auth/middleware"` | Edge middleware factory (login redirect, org guard, role guard, central login fan-out). |
| `import { withTenantAuth } from "@quikit/auth/with-auth"` (legacy alias) / `withOrgAuth` | Wrap API route handlers; receives `{ orgId, userId, membershipRole }`. The recent v4 cleanup renames `withTenantAuth → withOrgAuth` — match the alias your app already uses. |
| `import { withTenantAuthForModule } from "@quikit/auth/with-auth"` | Same wrapper plus a module-key gate (returns 403 if the org has the module disabled). |
| `import { requireAdmin } from "@quikit/auth/require-admin"` | Tenant-admin only routes. |
| `import { requireSuperAdmin } from "@quikit/auth/require-super-admin"` | Cross-org platform operations — **almost certainly not yours to call**. |
| `import { getTenantId } from "@quikit/auth/get-tenant-id"` | Server-component / handler helper that returns the current `orgId` (or 401s). |
| `import { gateModuleApi } from "@quikit/auth/feature-gate"` | Module entitlement helper (uses `FeatureFlag` table). |
| `import { verifyTokenRemote } from "@quikit/auth/verify-token-remote"` | Verify a JWT by hitting the launcher's JWKS endpoint. |
| `import { getSessionStore } from "@quikit/auth/session-store"` | Persisted session-state store (Redis-backed). |
| `import { listMyOrgs, switchOrg } from "@quikit/auth/org-memberships"` | Org-list + active-org switcher used by the org picker. |
| `import type { Session, JWT } from "@quikit/auth/types"` | Augmented NextAuth types. |

#### Session shape

```ts
session.user.id              // string — User PK
session.user.email           // string
session.user.name            // string | null
session.user.orgId           // string — currently selected org (was tenantId in v3)
session.user.membershipRole  // "super_admin" | "org_admin" | "member"
                             //  + legacy: "admin" | "executive" | "manager" | "employee" | "coach"
session.user.isSuperAdmin    // boolean — only set on launcher / admin
session.user.impersonating?  // boolean — true when a super-admin is signed in as another user
session.user.impersonatorUserId? / impersonatorEmail? / impersonationExpiresAt?
session.user.membershipInvalid?  // true if org membership got revoked between requests
```

#### SSO flow (high level)

1. User opens `https://<your-app>.vercel.app/anything`.
2. Middleware (`createMiddleware`) sees no session → redirects to launcher's `/login` (or central auth at `NEXT_PUBLIC_AUTH_URL` if set).
3. Launcher authenticates the user (credentials provider in `apps/auth`) and presents the org picker.
4. User picks an org → launcher redirects back to your app's NextAuth `signIn` callback URL with an OAuth code.
5. Your app exchanges the code at `POST {QUIKIT_ISSUER_URL}/api/oauth/token` for an `id_token` (RS256, signed with the launcher's `JWT_SIGNING_KEY`).
6. NextAuth `jwt()` callback unpacks the id_token and stores `orgId`, `membershipRole`, `isSuperAdmin` in the session JWT.
7. Subsequent requests carry the NextAuth cookie. Middleware re-validates membership on every request.

You do not implement steps 3–5 — `createAuthOptions()` does. You configure the OAuth client ID/secret and trust the issuer.

#### Local dev SSO

Without real OAuth credentials you cannot run the full flow locally. Two options, in order of preference:

1. Run the auth app (`cd apps/auth && npm run dev` on port 3004) plus the launcher (`apps/quikit` on 3001) and configure your app to use them. The integration owner provides a `dev-creds.txt` with throwaway client IDs.
2. Use a NextAuth credentials provider stub for solo dev (acceptable for UI-only iteration). You must remove the stub before opening the PR.

### 6.2 RBAC & Roles

Roles are constants in [packages/shared/lib/constants.ts](packages/shared/lib/constants.ts). **Do not invent new role strings.**

#### v4 (current, preferred) roles

| Role | Level | Where it applies | What it can do |
|---|---|---|---|
| `super_admin` | 6 | Platform | Full cross-org access; bypasses every gate; only platform operators have this. |
| `org_admin` | 5 | Per org | Admin of one org: invite/remove members, configure modules, edit any resource. |
| `member` | 1 | Per org | Default. Per-app role granularity comes from `UserAppAccess` (`viewer` / `member` / `admin`). |

#### Legacy (v3) roles — still supported for QuikScale

| Role | Level | Notes |
|---|---|---|
| `admin` | 5 | Org admin in QuikScale terminology. |
| `executive` | 4 | Strategic visibility, fewer write privileges. |
| `manager` | 3 | Owns a team; can edit team-scoped resources. |
| `employee` | 2 | Individual contributor; edits own resources. |
| `coach` | 1 | Read-mostly external coach. |

#### Hierarchy check pattern

```ts
import { ROLES, ROLE_HIERARCHY } from "@quikit/shared";

if (ROLE_HIERARCHY[session.user.membershipRole] < ROLE_HIERARCHY[ROLES.MANAGER]) {
  return forbidden();
}
```

#### `canXxx()` permission helpers

Every domain that supports per-row permissions has helpers in `apps/<app>/lib/api/<domain>Permissions.ts`:

```ts
canEditKPI(userId, orgId, kpi)
canEditPriority(userId, orgId, priority)
canEditWWW(userId, orgId, wwwItem)
```

Pattern: a helper returns true if the user is the resource creator, the assignee, the team owner, an `org_admin`, or a `super_admin`. Mirror this pattern when you add domains.

Reference: [apps/quikscale/lib/api/](apps/quikscale/lib/api/).

### 6.3 Multi-Org tenancy model

> **The single most important rule in this codebase: every Prisma query that reads or writes business data MUST filter by `orgId`.**

CI does not catch missing `orgId` filters. Code review does. Missing `orgId` = data leak across customers = product-killing incident.

#### The flow

```
Login → JWT with orgId → Session → Middleware reads session
       → Route handler wraps in withOrgAuth({ orgId, userId, role })
       → Handler builds Prisma where: { orgId, ...rest }
       → (Defense in depth) RLS sees Postgres GUC app.org_id = $1 and re-filters
```

#### Org switching

Users with multiple memberships hit `POST /api/org/select` (provided by the launcher). This re-issues the JWT with a new `orgId`. Your app's middleware notices the change and re-authorizes the next request.

If membership is revoked mid-session, middleware sets `session.user.membershipInvalid = true` and bounces the user to `/select-org`.

#### The Tenant → Org rename

The current branch `feature_auth_merge` continues a v4 cleanup that renames `tenantId` → `orgId` in code, types, and APIs. Database column is still `orgId` (the field was already renamed at the schema level). When you see `tenantId` in older code or older docs, treat it as a synonym; do not introduce new `tenantId` references in new code.

### 6.4 Database (`@quikit/database`)

#### Imports

```ts
import { db } from "@quikit/database";                    // singleton Prisma client
import type { Org, User, OrgMember, KPI } from "@prisma/client"; // generated model types
```

**Always re-export** from your app's own `lib/db.ts`, then import via `@/lib/db` everywhere else. This indirection is what lets the test harness swap the client for a mock:

```ts
// apps/<your-app>/lib/db.ts
export { db } from "@quikit/database";
```

#### RLS (`@quikit/database/rls`)

Postgres row-level security is the second line of defense. The wrapper calls `setTenantContext(orgId)` to set a session GUC; RLS policies on every business table check `orgId = current_setting('app.org_id')`.

```ts
import { setTenantContext, clearTenantContext } from "@quikit/database/rls";
```

You should not need to call this directly — `withOrgAuth` does it for you. Set it manually only in long-running scripts or background jobs.

#### Models you will encounter

Platform models (in [packages/database/prisma/schema.prisma](packages/database/prisma/schema.prisma)):

- **`Org`** — slug, name, plan, brandColor, allowedEmailDomains, status (`active` / `suspended` / `trial`).
- **`User`** — email, hashed password (only when local credentials), isSuperAdmin, timezone, themeAccent.
- **`OrgMember`** — `(userId, orgId)` with role + status (`active` / `invited` / `inactive` / `declined` / `pending`).
- **`App`** — slug, baseUrl, status, requiresOrgAdmin.
- **`UserAppAccess`** — per-app role for a member (`viewer` / `member` / `admin`).
- **`OAuthClient`**, **`OAuthCode`**, **`OAuthRefreshToken`** — IdP plumbing; do not write to these.
- **`AuditLog`** — see §6.6.
- **`FeatureFlag`** — per-org module toggles.
- **`AppModuleFlag`** — org × app feature gate overrides.
- **`SessionEvent`** — login/logout analytics.
- **`Invoice`**, **`InvoiceTemplate`** — billing. Read-only from your app.

App-domain models (only relevant if you are extending an existing app's domain):
- QuikScale: `KPI`, `Priority`, `WWWItem`, `Team`, `Client`, `PerformanceReview`, `Goal`, `OneOnOne`, `FeedbackEntry`, `OPSPData`.
- QuikConstruction: `CnProject`, `CnPurchaseOrder`, etc.
- QuikVC: `VCDeal`, `VCInvestor`, etc.

When you add a new model, it MUST have:
1. `orgId String` field with a `(orgId)` index.
2. An `OrgMember`-aware permission story (who can read/write).
3. An RLS policy added by the integration owner before the migration ships.
4. Discussion in your PR description before the migration is written.

#### Query style — `select` vs `include`

```ts
// GOOD — list endpoints use select to keep payloads small
const items = await db.kpi.findMany({
  where: { orgId },
  select: { id: true, name: true, owner: { select: { id: true, firstName: true } } },
  ...paginationToSkipTake(params),
});

// GOOD — detail endpoints use include only when full relations are required
const item = await db.kpi.findUnique({
  where: { id, orgId },
  include: { owner: true, weeklyValues: true },
});
```

> Full details: [docs/04-db-patterns.md](docs/04-db-patterns.md).

### 6.5 Module registry & feature gates

Module registry lives in [packages/shared/lib/moduleRegistry.ts](packages/shared/lib/moduleRegistry.ts).

```ts
import {
  MODULE_REGISTRY,
  ancestorsOf,
  isModuleEnabled,
  visibleModules,
} from "@quikit/shared";

interface ModuleDef {
  key: string;        // dot-delimited, e.g. "kpi.teams"
  label: string;      // sidebar label
  icon?: string;      // Lucide
  href?: string;      // e.g. "/kpi/teams"
  parentKey?: string; // parent in the tree
}
```

#### The cascade rule

A module is visible iff the module key AND every ancestor key are enabled in the org's `FeatureFlag` set. So `kpi.teams.weekly` requires `kpi`, `kpi.teams`, and `kpi.teams.weekly` to all be enabled.

#### API gating

```ts
import { withTenantAuthForModule } from "@quikit/auth/with-auth";

export const POST = withTenantAuthForModule("yourapp.coolFeature")(
  async ({ orgId, userId }, req) => { /* ... */ }
);
```

Returns 403 with `{ success: false, error: "Module disabled" }` if the org has the key off.

#### Module IDs already taken (don't collide)

- **quikscale**: `dashboard`, `kpi`, `kpi.individual`, `kpi.teams`, `priority`, `www`, `clientMeetings.*`, `opsp.*`, `analytics.*`, `people.*`, `orgSetup.*`.
- **admin**: `overview`, `members`, `teams`, `apps`, `roles`, `settings`.
- **quikvc**: `home`, `sourcing`, `deals.*`, `investors.*`, `repayments`, `reports`, `underwriting.*`.
- **quikconstruction**: `projects.*`, `procurement.*`, `materials.*`.

Pick a top-level prefix for your app and add it to `MODULE_REGISTRY` via the integration owner.

### 6.6 Audit logging

Every mutating operation (CREATE, UPDATE, DELETE, RESTORE) writes an audit log entry. Helper lives at `apps/<app>/lib/api/auditLog.ts` (copy from QuikScale).

```ts
import { writeAuditLog } from "@/lib/api/auditLog";

await writeAuditLog({
  orgId,
  actorId: userId,
  actorRole: session.user.membershipRole,
  action: "CREATE",                          // CREATE | UPDATE | DELETE | RESTORE
  entityType: "Widget",
  entityId: widget.id,
  changes: ["name", "description"],          // FIELD NAMES ONLY, not values
  oldValues: undefined,                      // optional snapshot (auto-diffed if omitted)
  newValues: undefined,
  reason: "User created widget via /api/widgets",
  ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  userAgent: req.headers.get("user-agent") ?? undefined,
});
```

**Rules:**

- Never include personal data, passwords, secrets, or token contents in `changes`, `reason`, `oldValues`, or `newValues`.
- Failure to write the audit log MUST NOT block the mutation — the helper swallows errors and logs them.
- The audit log is the legal record of who did what when. Treat the payload like it will be read by a regulator one day, because it might be.

### 6.7 Rate limiting

```ts
import { rateLimitAsync } from "@quikit/shared/rateLimit";   // server-only subpath

const ok = await rateLimitAsync({
  key: `create-widget:${orgId}:${userId}`,
  windowMs: 60_000,
  max: 10,
});
if (!ok) {
  return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
}
```

Use it on:
- Routes that accept untrusted input (signup, password reset, comments).
- Expensive operations (PDF generation, exports, fan-out emails).
- Any path that is publicly reachable before auth.

**Important:** import from `@quikit/shared/rateLimit`, **not** the `@quikit/shared` barrel. The barrel won't include it (it pulls `ioredis` which breaks client bundles with `dns/net/tls` errors).

Backend: Redis if `REDIS_URL` is set, otherwise an in-memory fallback (dev only).

### 6.8 Email service

#### Current (preferred): Resend

[apps/quikit/lib/email.ts](apps/quikit/lib/email.ts) wraps Resend. The shared template is exported via:

```ts
import { sendInvitationEmail } from "@quikit/shared";

await sendInvitationEmail({
  to: email,
  orgName,
  inviterName,
  role,
  token,
});
```

Required env: `RESEND_API_KEY` (set by integration owner), plus `APP_URL` for invite-link construction.

#### Legacy fallback: Office 365 SMTP

Some flows still read `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` (see [apps/quikit/.env.local.example](apps/quikit/.env.local.example)). Without those vars set, sends become no-ops + dev logs. Do not introduce new code that uses SMTP directly — go through the Resend wrapper.

#### What you can send

Right now: `sendInvitationEmail` only. Anything else (welcome, password reset, alert digest) is implemented inside the launcher and you call its endpoint, not your own SMTP.

If your app needs custom emails (e.g., "your report is ready"), file a request — the integration owner adds a template + transport rather than letting each app roll its own.

### 6.9 Redis (`@quikit/redis`)

```ts
import { getRedis, requireRedis, isRedisAvailable, closeRedis,
         cacheGet, cacheSet, cacheDel } from "@quikit/redis";
```

| Helper | Use |
|---|---|
| `getRedis()` | Lazy ioredis client, returns `null` if not configured. |
| `requireRedis()` | Throws if Redis is unavailable. Use for hard dependencies. |
| `isRedisAvailable()` | Boolean health check. |
| `cacheGet<T>(key)` / `cacheSet(key, val, ttlSeconds)` / `cacheDel(key)` | Typed JSON cache helpers. |
| `closeRedis()` | Graceful shutdown — for scripts, not Next.js handlers. |

**Env:** `REDIS_URL` (Upstash in prod, local Redis in dev). Production logs a one-time loud warning if missing.

**When to use Redis:**
- Per-request memoization across cold starts.
- Rate limiting (already wired — use `rateLimitAsync`, not Redis directly).
- Pub/sub for cross-instance signals (only with integration-owner approval).
- **NOT** as a primary store for anything you wouldn't be OK losing.

### 6.10 UI library & theming (`@quikit/ui`)

Forty+ components. Always import from `@quikit/ui` — never copy a component locally unless the integration owner says yes.

#### Component categories

| Category | Examples |
|---|---|
| Form primitives | `Button`, `Input`, `Textarea`, `Select`, `Checkbox`, `NumberInput`, `DateInput`, `Field`, `FormRow`, `FormSection`, `RichTextField`, `ToggleSwitch`, `Segmented` |
| Display | `Card`, `Badge`, `Avatar`, `Tooltip`, `Skeleton`, `EmptyState`, `TrashBanner` |
| Layout | `Tabs`, `Modal` (+ `ModalHeader`/`Body`/`Footer`), `SlidePanel`, `RightPanel`, `AppSidebar`, `ModuleTree` |
| Data | `DataTable`, `Pagination`, `ManageColsModal`, `ExportModal`, `ColMenu`, `HiddenColsPill` |
| Pickers | `UserPicker`, `UserMultiPicker`, `FilterPicker`, `DatePicker`, `TimePicker`, `TenantPicker` (org picker), `DropdownPicker`, `FiscalPeriodPicker` |
| Auth/banners | `SignInComponent`, `UserMenu`, `BroadcastBanner`, `ImpersonationBanner`, `FeatureDisabledToast` |
| Toolbar | `AddButton`, `MoreMenu`, `AppSwitcher` |
| Theming | `ThemeApplier`, `applyAccentColor`, `COUNTRIES`, `TIMEZONES` |
| Utils | `cn` (clsx merge), `formatDate`, `formatRelativeDate`, `generateInitials`, `slugify`, `isValidEmail`, `truncateText`, `globalSignOut` |

#### Subpath imports

```ts
import "@quikit/ui/styles";                        // global CSS — include at top of globals.css
import baseConfig from "@quikit/ui/tailwind-config"; // base Tailwind config — extend in your tailwind.config.ts
```

#### Theming

Every app reads the org's chosen accent color from `/api/settings/company` and applies it via `<ThemeApplier />` mounted in the dashboard layout. Mapping is exposed as `accent-50` / `accent-100` / … / `accent-900` Tailwind classes.

Use `accent-*` for branded interactive elements: buttons, focus rings, sidebar background, active tabs, table header backgrounds (`<th>`).

Use hardcoded Tailwind colors for semantic states: green/red/yellow/blue for success/error/warning/info; quarter badges; chart colors; the four locked tables (KPI / Team KPI / Priority / WWW) where cells must stay blue regardless of org theme. See the root [CLAUDE.md](CLAUDE.md) "Accent Color System" + "LOCKED TABLES" sections — that rule is permanent.

### 6.11 Pagination

```ts
import {
  parsePaginationParams,
  paginationToSkipTake,
  buildPaginationResponse,
} from "@quikit/shared";

export const GET = withOrgAuth(async ({ orgId }, req: NextRequest) => {
  const params = parsePaginationParams(req.nextUrl.searchParams);
  const [items, total] = await Promise.all([
    db.widget.findMany({
      where: { orgId },
      select: { id: true, name: true },
      ...paginationToSkipTake(params),
    }),
    db.widget.count({ where: { orgId } }),
  ]);
  return NextResponse.json({
    success: true,
    data: buildPaginationResponse(items, total, params),
  });
});
```

Response shape (frozen — do not deviate):
```jsonc
{
  "success": true,
  "data": {
    "data": [ /* items */ ],
    "pagination": { "page": 1, "limit": 20, "total": 137, "totalPages": 7 }
  }
}
```

Defaults: `page=1`, `limit=20`, max `limit=100`. Don't hand-roll skip/take. Don't omit pagination on list endpoints.

### 6.12 Observability

- **Console logging** is the baseline. Server logs go to Vercel; structured JSON-on-stdout is preferred but not enforced.
- **Sentry** wiring is provided per app via `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_AUTH_TOKEN` env vars. The integration owner sets these on Vercel; you don't need to do anything in code beyond the auto-instrumented Sentry config that ships with the template.
- **API call logging** (`@quikit/shared/apiLogging`) is opt-in for high-traffic routes and writes `SessionEvent`-style rows for analytics. Use sparingly — it's not free.
- **Health endpoint:** every app must expose `GET /api/health` returning `{ ok: true, version, db: "up" | "down" }`. The launcher's super-admin "health-check" cron pings this.

---

## 7. API route contract

Every route handler in your app must satisfy:

1. Wrapped in an auth helper (`withOrgAuth`, `requireAdmin`, or — almost never — `requireSuperAdmin`).
2. Validates input with Zod.
3. Filters every DB query by `orgId`.
4. Returns either `{ success: true, data }` (200/201) or `{ success: false, error }` (4xx/5xx).
5. Catches `(error: unknown)` — never `(e: any)`.
6. POSTs that create resources return **201**; everything else returns 200.
7. Has at least three tests: 401 unauthenticated, cross-org rejection, happy path.

#### Canonical example

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
});

export const GET = withOrgAuth(async ({ orgId }) => {
  const items = await db.widget.findMany({
    where: { orgId },
    select: { id: true, name: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ success: true, data: items });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map(i => i.message).join(", ") },
      { status: 400 },
    );
  }
  try {
    const widget = await db.widget.create({
      data: { ...parsed.data, orgId, createdBy: userId },
      select: { id: true, name: true },
    });
    return NextResponse.json({ success: true, data: widget }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
```

#### HTTP status codes

| Code | Meaning |
|---|---|
| 200 | Success (GET/PATCH/DELETE) |
| 201 | Resource created (POST) |
| 400 | Validation error |
| 401 | Not authenticated |
| 403 | Authenticated but not authorized (role, module, ownership) |
| 404 | Resource not found OR exists in another org (don't reveal which) |
| 409 | Conflict (already-finalized, duplicate slug, etc.) |
| 429 | Rate-limited |
| 500 | Unhandled |

Do not leak stack traces in `error`. The string is shown to the user.

> Full details: [docs/03-api-patterns.md](docs/03-api-patterns.md). Annotated reference: [docs/exemplars/](docs/exemplars/).

---

## 8. Middleware contract

Every app uses **the factory** from `@quikit/auth/middleware`. No bespoke middleware logic, ever.

#### Standard app middleware

```ts
// apps/<your-app>/middleware.ts
import { createMiddleware } from "@quikit/auth/middleware";

export const middleware = createMiddleware({
  loginRoute: "/login",
  publicRoutes: ["/login", "/select-org", "/invitations"],
  // requireAdmin: false (default — all members allowed)
  centralLoginUrl: process.env.NEXT_PUBLIC_AUTH_URL
    ? `${process.env.NEXT_PUBLIC_AUTH_URL}/login`
    : undefined,
  centralSelectOrgUrl: process.env.QUIKIT_URL
    ? `${process.env.QUIKIT_URL}/apps`
    : undefined,
});

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
```

#### Admin-only app

```ts
export const middleware = createMiddleware({
  loginRoute: "/login",
  publicRoutes: ["/login", "/select-org", "/invitations"],
  requireAdmin: true,    // non-admins bounced to /403
  centralLoginUrl: ...,
  centralSelectOrgUrl: ...,
});
```

What the factory handles for you:
- Redirect unauth'd traffic to login (central or local).
- Enforce org selection — bounce to `/select-org` if session has no `orgId`.
- Detect revoked memberships and re-bounce to org picker.
- Apply the super-admin override (super-admins bypass org checks).
- Detect redirect loops and break them with a 500 (so you don't infinite-loop in prod).
- Re-issue the JWT silently on org switch.

#### Login route

All apps use `/login` (NOT `/auth/login`). This is part of the platform contract.

#### Provider order

`SessionProvider → QueryClientProvider → ThemeProvider`. Frozen across every app. Do not reorder.

---

## 9. Environment variables

### Launcher (`apps/quikit/.env.local.example`)

You will not edit this — it is the integration owner's. Reproduced here so you understand the shape:

```bash
# Database
DATABASE_URL="postgresql://..."          # pooled (Neon prod uses pgbouncer)
DATABASE_URL_DIRECT="postgresql://..."   # unpooled — REQUIRED, used by migrations

# Redis
REDIS_URL="rediss://..."                 # Upstash in prod; local Redis in dev

# NextAuth
NEXTAUTH_SECRET="<openssl rand -base64 32>"
NEXTAUTH_URL="https://quik-it-auth.vercel.app"   # also the OIDC `iss` claim

# IdP RSA keypair (PEM, escaped \n, base64 PEM, or raw base64 body all accepted)
JWT_SIGNING_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
JWT_SIGNING_KEY_PUBLIC="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"

# Optional: central login app
NEXT_PUBLIC_AUTH_URL="http://localhost:3004"
QUIKIT_URL="http://localhost:3000"

# App registry redirects (the launcher links out to these)
QUIKSCALE_URL="https://quikscale.vercel.app"
ADMIN_URL="https://quik-it-admin.vercel.app"

# Email (Office 365 SMTP — legacy fallback)
SMTP_HOST="smtp.office365.com"
SMTP_PORT="587"
SMTP_USER="support@example.com"
SMTP_PASS="..."
SMTP_FROM="support@example.com"
```

### Your app's `.env.local`

```bash
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/quikit_dev"
MIGRATION_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/quikit_dev"

# Redis (optional in dev — falls back to in-memory)
REDIS_URL="redis://localhost:6379"

# NextAuth — your app's session
NEXTAUTH_SECRET="<openssl rand -base64 32>"
NEXTAUTH_URL="http://localhost:<your-port>"

# OAuth client credentials (from launcher) — placeholders until integration owner provides real ones
QUIKIT_CLIENT_ID="placeholder"
QUIKIT_CLIENT_SECRET="placeholder"
QUIKIT_ISSUER_URL="http://localhost:3001"

# Sentry (set by integration owner on Vercel, optional locally)
NEXT_PUBLIC_SENTRY_DSN=""
SENTRY_AUTH_TOKEN=""

# Resend (only if your app sends email; usually leave unset)
RESEND_API_KEY=""

# App self-URL (used in invite links, callbacks)
APP_URL="http://localhost:<your-port>"
```

**Never commit any `.env*` file.** `.gitignore` blocks them — don't fight it.

---

## 10. Testing requirements

The repo uses **Vitest** for unit / component / API tests and **Playwright** for E2E. All tests live under `apps/<app>/__tests__/` — never `tests/`.

#### When a test is required

- Every bug fix ships with a regression test that fails before the fix and passes after. No exceptions.
- Every new API route has at minimum: `unauthenticated → 401`, `cross-org request rejected`, and a happy path.
- Every new utility in `lib/utils/` reaches ≥90% line coverage.
- Every new permission helper has admin / role / self / other matrix coverage.

#### File conventions

| Path | Environment | Purpose |
|---|---|---|
| `__tests__/unit/*.test.ts` | node | Pure functions, no mocks |
| `__tests__/permissions/*.test.ts` | node + `vitest-mock-extended` | DB-touching permission logic |
| `__tests__/api/*.test.ts` | node + mocked Prisma + mocked session | Route handlers imported directly |
| `__tests__/components/*.dom.test.tsx` | jsdom (`// @vitest-environment jsdom`) | React components |
| `__tests__/e2e/*.spec.ts` | Playwright (excluded from Vitest) | Full-stack flows |

#### Mocking

- **Prisma**: mock via `__tests__/helpers/mockDb.ts` which `vi.mock`'s both `@quikit/database` and `@/lib/db` and preserves `@prisma/client` enum re-exports through `vi.importActual`.
- **Sessions**: `setSession(user)` from `__tests__/setup.ts` hooks `getServerSession` from both `next-auth` and `next-auth/next` once for the whole file.
- **Auth factories**: instantiate `createGetTenantId` / `createRequireAdmin` in the test file with a stub `authOptions`; the mocked `getServerSession` does the rest.
- **Never** mock the module under test. Never mock individual route handlers — import them and call them with a constructed `NextRequest`.

#### Running tests

```bash
npm run test           # all workspaces via turbo (cached)
npm run typecheck      # parallel tsc --noEmit
npm run lint           # turbo lint
npm run e2e            # Playwright (after e2e:install + db:seed:e2e)

cd apps/<app> && npm run test:watch   # Vitest watcher
cd apps/<app> && npm run test:ui      # Vitest web UI
```

#### Coverage ratchet

[scripts/coverage-ratchet.mjs](scripts/coverage-ratchet.mjs) compares fresh coverage to the committed baseline. CI fails if any of lines / statements / functions / branches drops more than 0.25 percentage points.

To intentionally update the baseline after adding tests:
```bash
npm run test -- --coverage
node scripts/coverage-ratchet.mjs apps/<app>/coverage/coverage-summary.json --update
git add coverage-baseline.json && git commit -m "chore: ratchet coverage baseline"
```

#### Before large refactors

Bring affected modules to ≥50% line coverage before touching them. The harness is your safety net — invest in tests *before* the move.

> Full details: [docs/07-testing.md](docs/07-testing.md).

---

## 11. Port assignments

Pick an unused port, ask the integration owner before claiming one >= 3010.

| App | Dev port | Notes |
|---|---|---|
| `quikit` (launcher / IdP) | 3001 (dev), 3000 (start) | OAuth issuer base. |
| `auth` (central credentials) | 3004 (dev), 3000 (start) | Optional shared login UI. |
| `admin` (org admin portal) | 3002 (dev), 3005 (start) | |
| `quikscale` (KPI/OKR) | 3003 (dev), 3002 (start) | |
| `quikconstruction` (ERP) | 3004 (dev), 3007 (start) | |
| `quikvc` (VC OS) | 3005 (dev), 3008 (start) | |
| `_template` | 3010 (example) | Customize when you fork. |
| **`<your-app>`** | **3010+** | Pick the next free slot. |

Set the port in `apps/<your-app>/package.json`:
```json
"dev": "next dev -p 3010",
"start": "next start -p 3010",
```

---

## 12. Deployment & release cycle

#### Vercel — `main` only

```
Git push to main  →  Vercel builds the changed app  →  Production live
```

Three layers prevent deploys from any other branch:

1. Per-app `vercel.json` — `deploymentEnabled: { main: true }` allow-list.
2. Per-app `vercel.json` — `ignoreCommand` exits 0 (skip) when `VERCEL_GIT_COMMIT_REF != main`.
3. Vercel dashboard → Git → Production Branch = `main`. Preview deployments disabled.

`dev` and `uat` are integration / QA branches. They do not auto-deploy.

#### Promotion cadence

```
your branch → CI → PR to dev → CI → integration-owner review → merge to dev (--no-ff)
                                                               ↓
                                              periodic ff to uat (QA cycle)
                                                               ↓
                                              periodic ff to main (production)
```

Typical end-to-end: 3–10 days. Don't pester the integration owner for the same PR more than once a week.

#### Manual preview (for stakeholder demos)

`vercel --prod=false` from your local checkout creates a one-off preview URL. Don't share these externally without integration-owner sign-off.

---

## 13. Non-technical: how we work together

#### Async expectations

| Action | Response time |
|---|---|
| Initial PR review | 1 working day |
| Re-review after changes | 1 working day |
| Architectural / schema question | 1–3 working days |
| Schema change request | 2–5 working days |
| Production smoke-test ping | 0–2 working days after merge to `main` |

Ping the team channel only if you've waited at least **twice** the expected time.

#### What you're expected to deliver

- Working code that satisfies §7 and §10.
- A PR description that explains **why**, not just what. "Lorem ipsum" descriptions are auto-rejected.
- Tests that fail before the change and pass after.
- Smoke-test confirmation on production after the integration owner promotes to `main`: sign in → navigate → one create → one read → comment on the PR.

#### Don't

- Don't open stacked PRs (PR-B depending on PR-A while it's still in review) unless explicitly OK'd.
- Don't sit idle while a PR is in review — start the next feature on a fresh branch.
- Don't bypass `--no-verify` to skip pre-commit hooks. If a hook fails, fix the cause.
- Don't commit screenshots of secrets, internal URLs, or production data to the PR.

#### Escalation

Architectural questions, new dependency requests, schema changes, cross-app concerns — comment in your PR. The integration owner answers; if they need to escalate to the architect, they will.

#### Freeze windows

Periodically the platform freezes non-critical merges (e.g., before a major release). The integration owner posts the freeze in the team channel. During a freeze:
- Hot-fix branches still merge.
- New features are paused at the PR-open stage.
- Don't open a PR-B while waiting — keep your branch ready and rebase when the freeze lifts.

---

## 14. Common rejection reasons

These will fail review or CI immediately. Avoid all of them and your PR lands faster.

| Category | What gets rejected |
|---|---|
| **Branch / git** | Pushing to `dev`/`uat`/`main`. Branch name not matching `feature/`/`fix/`/`chore/`/`refactor/`. Non-conventional commit messages. |
| **Packages** | Modifying any file under `packages/`. Creating a new package. Importing `rateLimitAsync` from the `@quikit/shared` barrel instead of `@quikit/shared/rateLimit`. |
| **Tenancy** | Prisma query without `orgId` filter. Cross-org data leak. |
| **Auth** | Custom auth check instead of `withOrgAuth` / `requireAdmin`. Skipping middleware. Reordering providers. |
| **API contract** | Returning a raw array. Missing `{ success, error }` shape. POST not returning 201. `catch (e: any)`. `as any` cast without justification. |
| **Tests** | New API route without 401 / cross-org / happy-path tests. New utility without ≥90% coverage. Bug fix without regression test. Coverage ratchet drop > 0.25pp. |
| **Validation** | `req.body` consumed without Zod. Hand-rolled validation. |
| **Audit** | Mutating route without audit log write. Audit payload includes PII or token contents. |
| **UI** | Re-implemented something that exists in `@quikit/ui`. Used `bg-blue-500` for branded interactive elements (should be `accent-*`). Modified a locked table's cell colors. |
| **Dependencies** | Added a new top-level npm dep without justification. Bumped a major version of a shared dep. |
| **Manifest** | Edited `manifest.ts` after integration-owner sign-off. Invented a new permission string. |
| **Secrets** | Committed `.env.local`, `DATABASE_URL`, OAuth credentials, OAuth client secrets, RSA keys. |
| **Hooks** | `--no-verify` flag. Disabled an ESLint rule with `// eslint-disable-next-line` and no justifying comment. |

---

## 15. Glossary

| Term | Meaning |
|---|---|
| **App** | A registered first-class product (`admin`, `quikscale`, your app). Has a slug, baseUrl, and per-org enable flag. |
| **AppManifest** | The static `manifest.ts` declaring an app's identity, route prefix, permissions, and sidebar nav. |
| **Audit log** | The append-only `AuditLog` table; every mutation is recorded with actor, action, entity, and changes. |
| **`canXxx()` helper** | An app-level permission function in `lib/api/<domain>Permissions.ts`. |
| **`createMiddleware`** | Factory from `@quikit/auth/middleware` — handles login, org selection, role guards. |
| **Feature flag** | An entry in the `FeatureFlag` table that toggles a module key on/off for an org. |
| **Integration owner** | The person who reviews your PRs and runs the merge train. Single source of truth for "is this OK". |
| **Launcher** | `apps/quikit` — the IdP and app picker. |
| **Module** | A sub-feature inside an app, identified by a dot-delimited key. Toggleable per org. |
| **`OrgMember`** | A `(userId, orgId)` row with a role and status. |
| **Org / Tenant** | A customer organization. Same thing — "Tenant" is the legacy term, "Org" is the v4 term. |
| **RLS** | Row-level security in Postgres; policies enforce `orgId = current_setting('app.org_id')` on every business table. |
| **Super admin** | A platform-wide operator (`isSuperAdmin = true`); bypasses every per-org check. |
| **`withOrgAuth`** / `withTenantAuth` | The route wrapper that injects `{ orgId, userId, membershipRole }`. New code uses `withOrgAuth`; the old name is a legacy alias. |

---

## 16. Where to look / where to ask

- **Onboarding**: [docs/00-getting-started.md](docs/00-getting-started.md)
- **Architecture**: [docs/01-architecture.md](docs/01-architecture.md)
- **Submission protocol**: [docs/02-integration-protocol.md](docs/02-integration-protocol.md)
- **API patterns** (canonical): [docs/03-api-patterns.md](docs/03-api-patterns.md)
- **DB patterns** (canonical): [docs/04-db-patterns.md](docs/04-db-patterns.md)
- **Frontend patterns**: [docs/05-frontend-patterns.md](docs/05-frontend-patterns.md)
- **Shared packages reference**: [docs/06-shared-packages.md](docs/06-shared-packages.md)
- **Testing guide**: [docs/07-testing.md](docs/07-testing.md)
- **Claude Code setup**: [docs/08-claude-code-setup.md](docs/08-claude-code-setup.md)
- **Troubleshooting**: [docs/09-troubleshooting.md](docs/09-troubleshooting.md)
- **Glossary (full)**: [docs/10-glossary.md](docs/10-glossary.md)
- **Database schema + flow**: [DATABASE_FLOW_AND_SCHEMA_GUIDE.md](DATABASE_FLOW_AND_SCHEMA_GUIDE.md)
- **Root rules**: [CLAUDE.md](CLAUDE.md) (monorepo) and `apps/<your-app>/CLAUDE.md` (your app — stricter)
- **Annotated exemplars**: [docs/exemplars/](docs/exemplars/)

**Where to ask:**

1. **In your PR** — best place for code-level questions; CODEOWNERS auto-routes the integration owner.
2. **Team channel** — for general async questions and blockers.
3. **Direct to the integration owner** — only if you're stuck > 30 minutes on a blocker that nobody else can answer.

If you can't find an answer in this handbook or in `docs/`, that's a documentation gap — flag it in your PR and the integration owner will fold the answer back into these files.

---

**Welcome to the platform. Ship carefully.**
