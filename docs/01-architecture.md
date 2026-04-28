# Architecture Overview

A 10-minute read. Covers what the platform is, what your app fits into, and what you can / can't touch.

## What is QuikIT?

QuikIT is a multi-tenant SaaS platform with:

- A **launcher** (`quikit`) — landing page, app picker, SSO source.
- A set of **product apps** (`quikscale`, `admin`, plus the new ones being built — including yours).
- Shared **packages** that every app uses (`@quikit/ui`, `@quikit/database`, `@quikit/auth`, `@quikit/shared`).

A tenant (customer organization) signs in once via the launcher. The launcher's SSO token authenticates them across every app. Each app reads `tenantId` + `userId` from the session and scopes all data access to that tenant.

## Repo layout

```
QuikIT/
├── apps/
│   ├── _template/        # scaffold for new apps (you copy this)
│   ├── quikit/           # launcher (route prefix /, port 3000)
│   ├── quikscale/        # KPI / OPSP / Priority / WWW (port 3004)
│   ├── admin/            # tenant admin portal (port 3005)
│   └── <your-app>/       # YOUR app (port 3010+)
├── packages/
│   ├── auth/             # NextAuth wrappers, middleware factory, session types
│   ├── database/         # Prisma schema + client
│   ├── shared/           # constants (ROLES, ROLE_HIERARCHY, etc.) + utils
│   └── ui/               # shared React components, theme tokens, Tailwind config
├── docs/                 # this directory
└── CLAUDE.md             # monorepo-wide conventions
```

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
            ┌──────────────┐
            │   quikit     │  ← user lands here, signs in via OAuth provider
            │ (launcher)   │
            └──────┬───────┘
                   │ issues SSO token
                   ▼
   ┌───────┬───────┴────────┬───────┐
   │                         │       │
   ▼                         ▼       ▼
┌────────┐  ┌────────┐  ┌────────┐  ┌──────────┐
│quikscale│  │ admin  │  │<your-app>│  │  …more   │
└────────┘  └────────┘  └────────┘  └──────────┘
     │           │           │           │
     └───────────┴───────────┴───────────┘
                       │
                       ▼
            ┌──────────────────┐
            │  Postgres (Neon) │  ← single shared DB, schema-per-domain
            └──────────────────┘
```

Every product app:

1. Receives the user's session via NextAuth + `@quikit/auth`.
2. Hits the same Postgres database via `@quikit/database` (Prisma client).
3. Renders UI from `@quikit/ui` components.
4. Exposes its own routes under `app/` and own API endpoints under `app/api/`.

Your app does not call other apps directly. If you need data that lives in another app's domain, propose adding the domain to your app or share a service in `@quikit/shared`.

## Tech stack

| Layer | Tech | Why |
|---|---|---|
| Framework | Next.js 14 (App Router) | Server Components + edge middleware + opinionated routing |
| Language | TypeScript (strict) | Type safety across monorepo + Prisma client types |
| Monorepo | Turborepo + npm workspaces | Caching, parallel builds, single `npm install` |
| DB | PostgreSQL via Prisma | Multi-schema per app domain, type-safe queries |
| Auth | NextAuth (custom) | OAuth + session JWT with tenantId/membershipRole |
| UI | React 18 + Tailwind CSS | Standard, fast, well-known |
| Components | `@quikit/ui` (Radix-based) | Cross-app consistency |
| Forms | Zod for validation | Same schema for client + server |
| Tests | Vitest + Playwright | Fast unit/integration; e2e for full flows |
| Deploy | Vercel (main only) | Per-app config gates non-main pushes |

## Multi-tenancy — how data isolation works

This is the most important rule in the codebase:

> **Every Prisma query that reads or writes tenant-scoped data MUST filter by `tenantId`.**

Failure to do this leaks data across tenants. CI does not catch this automatically — it's caught at code review.

The `withTenantAuth` wrapper used in API routes injects `tenantId` from the session. You then pass it into your `where` clause:

```ts
export const GET = withTenantAuth(async ({ tenantId }) => {
  const items = await db.widget.findMany({
    where: { tenantId },                  // ← non-negotiable
    select: { id: true, name: true },
  });
  return NextResponse.json({ success: true, data: items });
});
```

When you add a new Prisma model, it needs a `tenantId String` field + an index on `(tenantId)`. The integration owner reviews schema changes for this.

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
