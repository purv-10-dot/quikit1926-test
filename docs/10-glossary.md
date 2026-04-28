# Glossary

Domain language used across QuikIT. Read whenever you see a term you don't recognize. Add new terms via PR when you coin one.

---

## Platform terms

**Tenant** — a customer organization. The top-level isolation boundary. Every business object in the platform is scoped to a `tenantId`. Tenants don't see each other's data.

**Membership** — the link between a `User` and a `Tenant`, with a `role` (`admin`, `executive`, `manager`, `employee`, `coach`). One user can have memberships in multiple tenants.

**App** — a top-level product surface like `quikscale`, `quikit`, `admin`, or your new app. Apps are independently deployed Next.js applications under `apps/`.

**Module** — a sub-feature of an app, gateable per tenant via the module registry. Examples: `kpi.quikscale`, `opsp.quikscale`, `priority.quikscale`. Tenants can have a module enabled or disabled depending on their plan.

**Launcher** — the `quikit` app. Hosts the cross-app sign-in page, app picker, and SSO source for all the other apps.

**Super Admin** — a platform-wide role (NOT a tenant role) that allows cross-tenant operations. Used by the `admin` app for support tasks. You will not be writing code for super admin.

**Plan** — a tenant's subscription tier. Affects which modules they can enable. Today plans are `startup`, `growth`, `scale`. The integration owner manages plan-to-module mapping.

---

## Workflow / data terms

These come from the existing apps. You may or may not encounter them depending on what your app does.

### From quikscale

**OPSP** — One-Page Strategic Plan. Quarterly strategic planning document with sections for People, Process, Targets, Goals, Actions, Theme, Accountability. Each tenant has one OPSP per (year, quarter).

**KPI** — Key Performance Indicator. Tracked weekly with traffic-light status (blue = exceeded, green = achieved, yellow = near, red = below). Each KPI has a target and weekly actuals.

**Priority** — a quarterly initiative tracked in the Priorities table. Each has a status (completed / on-track / behind-schedule / not-yet-started / not-applicable).

**WWW** — "What Went Well" / weekly retrospective items. Same status set as Priority.

**Rocks** — quarterly priorities (a Rockefeller Habits term). Lives inside the OPSP under the Process section. 5 rocks per quarter is the convention.

**Critical #** — the single number that, if achieved, determines the quarter's success. OPSP convention.

**Balancing Critical #** — a counter-metric to the Critical # to prevent "winning the metric, losing the war."

**Brand Promise** — what the tenant promises every customer.

**BHAG** — Big Hairy Audacious Goal (Collins, "Built to Last"). 10–25 year outsized ambition.

**Sandbox** — the boundaries the tenant operates within (geography, customer segment, channel). OPSP convention.

**Theme** — the quarter or year's rallying-cry slogan.

### Cross-app

**Audit log** — append-only history of every mutation in the platform. Lives in `public.AuditLog`. Written via `writeAuditLog()` after every create/update/delete on tenant-scoped data.

**Feature flag** — a boolean (or numeric) tenant setting controlled via `FeatureFlag` model. Used for gradual rollout of new features.

**Tenant settings** — per-tenant configuration on the `Tenant` model. Includes `fiscalYearStart`, `quarterStartMonth`, `weekStartDay`, `accentColor`, and others.

**Fiscal year / fiscal quarter** — non-calendar year boundaries used by tenants whose business year doesn't start in January. Stored as `fiscalYearStart` (1-12, month number) on the Tenant. Defaults to 1 (January) but most tenants set 4 (April) for the Indian fiscal year.

---

## Engineering terms

**Branch protection** — GitHub setting that prevents direct pushes to `main`, `uat`, `dev` and requires PR + review.

**CODEOWNERS** — `.github/CODEOWNERS` file mapping path patterns to required reviewers.

**Coverage ratchet** — automated check that test coverage doesn't drop more than 0.25 percentage points between PRs. Lives in `scripts/coverage-ratchet.mjs`.

**Conventional Commits** — commit message format `type(scope): subject`. Required by CI on every PR.

**withTenantAuth** — the API route wrapper that injects `{ tenantId, userId }` from the session and rejects unauthenticated callers with 401.

**Server Component** — a Next.js component that runs on the server only. No `"use client"` directive. Default for new components in this codebase.

**Client Component** — a Next.js component with `"use client"` at the top. Runs in the browser. Required for hooks, event handlers, browser APIs.

**accent-* classes** — Tailwind utility classes (`accent-50` through `accent-900`) mapped to CSS variables that change per tenant. Used for branded interactive elements.

**Locked tables** — the 4 tables in quikscale (KPI individual, KPI team, Priority, WWW) whose cell styles are intentionally NOT theme-able. They use fixed semantic colors. You won't touch these in your apps but the rule extends: status indicators are semantic.

**`@quikit/*`** — the shared monorepo packages: `@quikit/auth`, `@quikit/database`, `@quikit/ui`, `@quikit/shared`. You import from these. You don't modify them.

**Per-dev repo** — your stripped-down copy of the master monorepo. Contains only your app + read-only `packages/`. Hosted as a fork in the integration owner's GitHub org.

**Master monorepo** — the source-of-truth repo. Contains all apps, all packages, all docs. You don't have direct write access — you open PRs into it from your fork.

**Integration owner** — the person who reviews and merges your PRs into `dev`, then promotes to `uat` and `main`. In this codebase: the team lead / architect.

**Manifest** — `apps/<app>/manifest.ts` exporting the app's contract: `appId`, `routePrefix`, `permissions`, `navigation`. The launcher reads these to build the app picker.

---

## Tooling terms

**Turborepo** — the monorepo build orchestrator. Runs `turbo dev`, `turbo build`, `turbo typecheck`, etc. Caches outputs across runs.

**Prisma** — the ORM. Schema in `packages/database/prisma/schema.prisma`. Generated client in `node_modules/.prisma/client`.

**Vitest** — the unit/component test runner. Faster than Jest.

**Playwright** — the e2e test runner. Headless Chromium browser automation.

**Vercel** — production host. Deploys `main` branch automatically; ignores all other branches via per-app `vercel.json`.

**Neon** — production Postgres host (currently). Edge-friendly, scales to zero on idle.

---

## Acronyms you may see

- **HMR** — Hot Module Replacement (Next.js dev-server feature).
- **PITR** — Point-In-Time Recovery (database backup feature).
- **BAA** — Business Associate Agreement (HIPAA compliance contract).
- **DPDPA** — Digital Personal Data Protection Act 2023 (Indian GDPR-equivalent).
- **GST** — Goods and Services Tax (Indian VAT).
- **SSO** — Single Sign-On (one credential, many apps).
- **JWT** — JSON Web Token (the auth cookie format NextAuth uses).
- **CSP** — Content Security Policy (browser security header).
- **PII** — Personally Identifiable Information.
- **RPS** — Requests Per Second.
- **COGS** — Cost Of Goods Sold (per unit infrastructure cost in the SaaS context).

---

## Adding a new term

If you coin or encounter a term that's not here and is likely to come up again, propose adding it via PR:

```
docs: glossary — add <Term>
```

Keep entries tight (1–3 sentences). Link to `/docs/04-db-patterns.md`-style doc for terms that need a full page.
