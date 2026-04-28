# QuikIT

Multi-tenant SaaS platform — a launcher (`quikit`) + product apps (`quikscale`, `admin`, and more) sharing one Postgres database, one auth system, and one design system. Built as a Turborepo monorepo with Next.js 14 + Prisma + NextAuth + Tailwind.

## Quick links

- **New dev?** → [`docs/00-getting-started.md`](./docs/00-getting-started.md)
- **Documentation index** → [`docs/README.md`](./docs/README.md)
- **Repo-wide rules** → [`CLAUDE.md`](./CLAUDE.md)
- **How to integrate an app** → [`docs/02-integration-protocol.md`](./docs/02-integration-protocol.md)
- **Sample app to copy** → [`apps/_template/`](./apps/_template/)

## Repo at a glance

```
QuikIT/
├── apps/
│   ├── _template/           Skeleton for new apps (copy + rename via scripts/onboard-dev.sh)
│   ├── quikit/              Launcher (port 3000) — landing, app picker, SSO
│   ├── quikscale/           KPI / OPSP / Priority / WWW (port 3004)
│   └── admin/               Tenant admin portal (port 3005)
├── packages/
│   ├── auth/                NextAuth wrappers, middleware factory, session types
│   ├── database/            Prisma schema + client
│   ├── shared/              Constants (ROLES, MEMBERSHIP_STATUS), pagination, email
│   └── ui/                  Shared React components, Tailwind theme, design tokens
├── docs/                    Onboarding + reference (read docs/README.md first)
├── scripts/                 onboard-dev.sh, integrate-app.sh, coverage-ratchet.mjs, …
└── CLAUDE.md                Repo-wide LLM/contributor rules
```

## Branch flow (non-negotiable)

```
feature/* | fix/* → dev → uat → main → Vercel (production)
```

`dev`/`uat`/`main` only receive merges via the integration owner. Direct pushes to those branches are blocked. See [`CLAUDE.md`](./CLAUDE.md) for the full git workflow.

## Tech stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict) |
| Monorepo | Turborepo + npm workspaces |
| DB | PostgreSQL via Prisma (Neon in production) |
| Auth | NextAuth (custom; SSO from `quikit` launcher) |
| UI | React 18 + Tailwind CSS, components from `@quikit/ui` |
| Forms | Zod for validation |
| Tests | Vitest (unit/component/API), Playwright (e2e) |
| Deploy | Vercel — `main` branch only, per-app gating via `vercel.json` |

## Running locally

Prereqs: Node 20+, npm 11+, Postgres 14+.

```bash
git clone <repo-url>
cd QuikIT
npm install
npm run db:push            # syncs Prisma schema to your local DB
npm run dev                # turbo dev — runs all apps in parallel
```

App-specific dev:

```bash
npm run dev:quikscale      # quikscale on :3004
npm run dev:admin          # admin on :3005
```

## Adding a new app

If you're starting a fresh app following the `_template` pattern:

```bash
./scripts/onboard-dev.sh <app-id>
```

The script copies `apps/_template/`, renames placeholders, generates `.env.local`, and smoke-tests the build. See `scripts/onboard-dev.sh` for what it does.

## Contributing

This repo uses a multi-dev fork-and-PR model:

1. The integration owner provisions a per-dev repo (fork) for each contributor.
2. Contributors work in their fork on `feature/*` branches.
3. They open PRs into the master monorepo's `dev` branch.
4. CI runs (lint/typecheck/test/coverage-ratchet/branch-name/commit-format).
5. CODEOWNERS routes review to the integration owner.
6. Integration owner merges to `dev`; periodic promotion through `uat` to `main`.

Full protocol: [`docs/02-integration-protocol.md`](./docs/02-integration-protocol.md).

## Documentation

All onboarding + pattern docs live in [`docs/`](./docs/). Start with [`docs/README.md`](./docs/README.md) for the table of contents.

For LLM contributors (Claude Code, etc.):
- [`CLAUDE.md`](./CLAUDE.md) — repo-wide rules
- [`apps/<app>/CLAUDE.md`](./apps/_template/CLAUDE.md) — app-specific rules (override root)
- [`docs/08-claude-code-setup.md`](./docs/08-claude-code-setup.md) — effective prompting + blind spots

## Production

Production is hosted on Vercel + Neon Postgres. Deployment is gated:
- Only `main` branch deploys.
- Each app has a `vercel.json` `ignoreCommand` that skips builds for non-`main` refs.
- The integration owner controls the merge train; contributors never touch deploy infra.

## License

Proprietary. © QuikIT. All rights reserved.
