# Architecture Overview

A 10-minute read. Covers what the platform is, what your app fits into, and what you can / can't touch.

## What is QuikIT?

QuikIT is a multi-tenant SaaS platform with:

- A **launcher + identity provider** (`quikit`) — landing page, app picker, and the OAuth/OIDC IdP. Super-admin pages live here too.
- A **central credentials service** (`auth`) — hosts the login form, registration/OTP, password reset, and the cross-domain session handoff.
- An **org admin portal** (`admin`) — members, teams, apps, roles, audit log.
- A set of **product apps** — `quikscale`, `quiktrack`, `quikvc`, `quikinfra`, `quiksocial`, `quikcrm`, `quikhrms` (plus any new one you're building).
- Shared **packages** that every app uses (`@quikit/ui`, `@quikit/database`, `@quikit/auth`, `@quikit/redis`, `@quikit/shared`).

A user signs in once through the `auth` credentials host (or an SSO provider). `quikit` acts as the OAuth/OIDC IdP; a short-lived signed handoff token bridges the session to each app's own host-scoped cookie. Each app reads `orgId` + `userId` from the session and scopes all data access to that org.

> **Naming:** the tenant/organization is called an **org**. The scoping column is `orgId` (a repo-wide migration renamed the legacy `tenantId` → `orgId`), the Prisma org model maps to the `Org` table, and membership is `OrgMember`. You'll still see the word "tenant" in some prose and OAuth scope strings — it means the same thing.

## Repo layout

```
QuikIT/                          # dev ports in parentheses
├── apps/
│   ├── _template/        # scaffold for new apps (you copy this) (3010)
│   ├── quikit/           # launcher + OAuth/OIDC IdP + super-admin (3000)
│   ├── auth/             # central credentials / login service (3001)
│   ├── admin/            # org admin portal (3002)
│   ├── quikscale/        # OKR / KPI / OPSP / Priority / WWW (3003)
│   ├── quiktrack/        # project / task / docs tracker (3004)
│   ├── quikvc/           # venture-capital deal flow (3005)
│   ├── quikinfra/        # construction ERP (3006)
│   ├── quiksocial/       # AI social-media management (3007)
│   ├── quikcrm/          # CRM / sales (3008)
│   ├── quikhrms/         # HR management system (3009)
│   └── <your-app>/       # YOUR app
├── packages/
│   ├── auth/             # NextAuth factories, middleware factory, guards, session store
│   ├── database/         # Prisma schema + client singleton
│   ├── redis/            # ioredis singleton + cache helpers (fail-open)
│   ├── shared/           # constants (ROLES, ROLE_HIERARCHY, etc.), pagination, email, module registry
│   └── ui/               # shared React components, theme tokens, Tailwind config
├── docs/                 # this directory
└── CLAUDE.md             # monorepo-wide conventions
```

Ports come from each app's `package.json` `dev` script — see [`13-app-ports-and-env.md`](./13-app-ports-and-env.md) for the definitive table.

Your per-dev repo only contains `apps/<your-app>/`, `packages/*`, `docs/`, and the root config. Other apps are not visible.

## What your app owns

Inside `apps/<your-app>/`, you own everything:

- All routes under `app/`.
- All components under `components/`.
- All app-local utilities under `lib/`.
- All app-local types.
- All app-local tests.
- Your `manifest.ts`.

You can do whatever you want here as long as you follow the conventions.

## What you DON'T own

- `packages/` — read-only. Submit a request via PR description if you need a feature.
- Other apps — not visible in your repo, not your concern.
- The root `CLAUDE.md` — owned by the integration team.
- The Prisma schema (`packages/database/prisma/schema.prisma`) — propose models in your PR; the integration owner adds them.
- Deploy config (Vercel, GitHub Actions) — owned by the integration team.

## How the apps connect

```
     ┌──────────────┐        ┌──────────────┐
     │    auth      │        │    quikit    │
     │ (credentials │◄──────►│ (OAuth/OIDC  │  ← user signs in on auth;
     │   login)     │ handoff│   IdP +      │    quikit issues tokens,
     └──────┬───────┘        │  launcher)   │    hosts the /apps picker
            │                └──────┬───────┘
            │ 120s signed handoff token │
            ▼                            ▼
   ┌───────────┬───────────┬───────────┬───────────┐
   ▼           ▼           ▼           ▼           ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐
│quikscale│ │ admin  │ │quikinfra│ │  …etc  │ │<your-app>│
└────────┘ └────────┘ └────────┘ └────────┘ └──────────┘
     │          │          │          │          │
     └──────────┴──────────┴──────────┴──────────┘
                       │
                       ▼
            ┌──────────────────┐
            │  Postgres (Neon) │  ← single shared DB, 10 schemas (auth, quikit,
            └──────────────────┘    public, app_quikscale, app_quikinfra, …)
```

Each app sets its own host-scoped session cookie after verifying the handoff token; on later navigations middleware re-validates it server-to-server against the `auth` app's `/api/verify-token`.

Every product app:

1. Receives the user's session via NextAuth + `@quikit/auth` (JWT strategy; Redis-backed soft-revocation).
2. Hits the same Postgres database via `@quikit/database` (Prisma client), scoping every query by `orgId`.
3. Renders UI from `@quikit/ui` components.
4. Exposes its own routes under `app/` and own API endpoints under `app/api/`.

Your app does not call other apps directly. If you need data that lives in another app's domain, propose adding the domain to your app or share a service in `@quikit/shared`.

## Tech stack

| Layer | Tech | Why |
|---|---|---|
| Framework | Next.js 14 (App Router) | Server Components + edge middleware + opinionated routing |
| Language | TypeScript (strict) | Type safety across monorepo + Prisma client types |
| Monorepo | Turborepo + npm workspaces | Caching, parallel builds, single `npm install` |
| DB | PostgreSQL via Prisma | 10-schema multiSchema layout per app domain, type-safe queries |
| Auth | NextAuth (JWT) | `quikit` OAuth/OIDC IdP + `auth` credentials host; session JWT carries `orgId`/`membershipRole`/`isSuperAdmin` |
| Cache / sessions | Redis via `@quikit/redis` | Soft-session store, rate limiting, layered cache (fail-open) |
| UI | React 18 + Tailwind CSS | Standard, fast, well-known |
| Components | `@quikit/ui` (Radix-based) | Cross-app consistency |
| Forms | Zod for validation | Same schema for client + server |
| Tests | Vitest + Playwright | Fast unit/integration; e2e for full flows |
| Deploy | Vercel (main only) | Per-app config gates non-main pushes |

## Multi-tenancy — how data isolation works

This is the most important rule in the codebase:

> **Every Prisma query that reads or writes org-scoped data MUST filter by `orgId`.**

Failure to do this leaks data across orgs. CI does not catch this automatically — it's caught at code review.

Each app wraps the shared `@quikit/auth` guards in a thin `lib/api/` helper — most apps call it `withOrgAuth` (quikcrm still calls its copy `withTenantAuth`; admin uses `withAdminAuth`). The wrapper resolves `orgId` from the session via `getOrgId` (= `createGetOrgId(authOptions, { appSlug })`) and hands it to your route. You then pass it into your `where` clause:

```ts
export const GET = withOrgAuth(async ({ orgId }) => {
  const items = await db.kpi.findMany({
    where: { orgId },                     // ← non-negotiable
    select: { id: true, name: true },
  });
  return NextResponse.json({ success: true, data: items });
});
```

The wrapper also layers on **module gating** (`gateModuleApi`) and **RBAC v2** permission checks (`withOrgAuthForResource` → `userCan(userId, orgId, resource, action)`) — see [`login-roles-architecture-and-flow.md`](./login-roles-architecture-and-flow.md).

When you add a new Prisma model, it needs an `orgId String` field, an index on `(orgId)`, and a `@relation` to `Org` with `onDelete: Cascade`. The integration owner reviews schema changes for this.

## The 4 status branches

| Branch | Purpose | Who can push? |
|---|---|---|
| `main` | Production. Deploys to Vercel automatically. | Integration owner only. |
| `uat` | Pre-prod QA. Manual fast-forward from `dev`. | Integration owner only. |
| `dev` | Integration branch. Where your PRs land. | Integration owner only (via PR merge). |
| `feature/*`, `fix/*`, etc. | Your branches. | You — push freely. |

You open PRs from your `feature/*` branch into `dev`. Never push to `dev`, `uat`, or `main` directly — branch protection blocks it anyway.

## How code flows from "you wrote it" to "in production"

```
[your local machine]
    │ git push
    ▼
[your per-dev repo]                  ← CI runs lint/test/typecheck here
    │ open PR → master monorepo's `dev`
    ▼
[master monorepo dev branch]         ← CODEOWNERS + integration owner review
    │ integration owner promotes
    ▼
[uat branch]                         ← QA runs here
    │ integration owner promotes
    ▼
[main branch]                        ← Vercel deploys to production
```

A change you write today typically reaches `main` in 3–10 days, depending on the QA cycle and how many other PRs are queued.

## What to read next

- `02-integration-protocol.md` — exact mechanics of submitting code.
- `apps/<your-app>/CLAUDE.md` — the strict app-level rules.
- The Prisma schema at `packages/database/prisma/schema.prisma` to see the existing data model.
- An exemplar API route at `apps/<your-app>/app/api/example/route.ts`.
