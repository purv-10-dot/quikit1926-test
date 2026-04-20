# 🧭 SESSION HANDOFF — READ THIS FIRST

**Created:** 2026-04-19 · **For:** The next Claude Code session picking up this project.
**Status of repo at handoff:** `main` / `dev` / `uat` all synced at commit `8f8bac9`. 1,360+ tests passing. Zero open feature branches.

---

## ⚡ TL;DR for the new session (read in this order)

1. You are continuing work on **QuikIT** — a multi-tenant SaaS platform (Turborepo, Next.js 14, Postgres/Neon, Prisma, Redis/Upstash, Vercel).
2. The user is **Ashwin Singone** (`ashwinsingone1993@gmail.com`). Based in India. Building QuikIT as a multi-app SaaS platform serving mid-size Indian organisations.
3. **Working style**: user wants brutally honest PM-style push-back, not validation. Be opinionated. Challenge premises. Don't fluff.
4. **Git rule (non-negotiable)**: feature branches only; NEVER push to `main` / `dev` / `uat` without explicit green-flag from user. Each push = backup tag first.
5. **Business context**: 15 Indian orgs ready to onboard on free trials. 5+ apps being built by end of Q2 (June 2026). Enterprise customer wants India data residency. User has a DevOps person. Will self-host on Linux by end of quarter.
6. **Architecture pattern**: **Platform (QuikIT) + Domain Apps** — already the right pattern, just needs governance as N grows.
7. **Current state**: OPSP decomp 100% complete, all super-admin non-cron routes 100% test-covered, mobile audit + skeletons + confirmation modals all shipped, smoke-tested against Vercel prod (healthy).
8. **Next up — user's call**: either continue backlog items (NEXT_ITEMS.md) or execute the self-hosted-on-Linux migration plan agreed at end of last session.

---

## 1. Identity, environment, working style

### User
- **Name:** Ashwin Singone
- **Email:** ashwinsingone1993@gmail.com
- **Location:** India
- **GitHub:** `ashwinsingone-pm` → repo `ashwinsingone-pm/QuikIT`
- **Role:** Product lead / founder. Has a DevOps person.

### How Ashwin works with you
- **Wants opinions, not options.** "Pick one and tell me why" beats "here are 5 options".
- **Pushes back on sycophancy.** If you agree with everything, you're useless. Challenge premises.
- **Ships incrementally.** Every session = at least one committed change OR a clear document.
- **Doesn't want emojis in commits unless asked.** Conventional commit style (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `docs:`).
- **Frustrated by scope creep.** If a task was "do X," do X — don't also secretly refactor Y.
- **Values speed + honesty:** tell him when something is harder / longer / smaller than he thinks. He'll adjust.
- **Gives short commands** like "fix this," "do that". When ambiguous, ask 1 clarifying question MAX before proceeding.

### Environment
- **OS:** macOS (Apple Silicon, Homebrew)
- **Node:** via Homebrew (check `which node` for path)
- **Package manager:** npm (workspaces, NOT pnpm/yarn)
- **Working dir:** `/Users/user/Documents/Claude_Code/QuikIT`
- **Editor:** Claude Code CLI (v2.1.87+), not VSCode/Cursor
- **Plugin installed (as of this session):** `woz@wozcode-marketplace` v0.3.42 — provides `mcp__plugin_woz_code__{Search,Edit,Sql,Recall}` tools. Use them over raw Bash/Write/Edit when the hook reminds you.

---

## 2. What we're building — the business

### The product
**QuikIT** is a multi-tenant SaaS platform for mid-size Indian organisations. It's not one app — it's a **suite of business apps unified under one identity/tenancy layer**.

Current shipped apps:
| App | Purpose | Status |
|---|---|---|
| **QuikIT launcher + super-admin** | Identity provider (OIDC), tenant/user/billing/app management, super-admin console | ✅ Shipped |
| **QuikScale** | OKR / KPI / strategy tracking (flagship product — OPSP quadrant planner, KPI traffic-light system, priority tracking, WWW wins, meetings, performance reviews) | ✅ Shipped |
| **Admin** | Per-tenant admin UI (member mgmt, teams, roles, settings) | ✅ Shipped (thin) |

Planned by end of Q2 2026 (June):
| App | Vertical | Status |
|---|---|---|
| **QuikCRM** | Sales / CRM | 🟡 Not started (greenfield) |
| **QuikConstruction** | Construction site / crew management | 🟡 Not started |
| **QuikPMS** | **Project or Property management — user to clarify scope before kickoff** | 🟡 Not started |
| **QuikWorkflows** | Automation / workflow engine | 🟡 Not started |

### Customers
- **15 mid-size Indian organisations** confirmed ready to onboard on free trial.
- All in India — no EU / US customers yet. Architecture decisions favour **India-only single-region deployment** for now.
- Current monetisation: free trial for feedback. Stripe integration deferred until customer #1 commits to paying (R2-5 in roadmap).
- Enterprise data residency requirement is real — they want data in India. Vercel's edge network is NOT compliant for some prospects' contracts.

### Strategic decisions made in this session's brainstorms (use these; don't re-litigate)

| Decision | Rationale | Documented in |
|---|---|---|
| **Move off Vercel → self-hosted Linux (Hetzner / Indian cloud)** | Data residency requirement is now real. 15 customers justifies infra cost. | End-of-session brainstorm (no doc yet — this file is the capture) |
| **Architecture pattern: Platform (QuikIT) + Domain Apps** | Already the pattern; need governance as N grows. NOT modular monolith, NOT microservices, NOT K8s. | This file §6 |
| **Single India regional pod** | 15 customers, 1 region. No multi-region until a customer in different region asks. | This file §6 |
| **Docker Compose on 1 VPS (Tier 2)** | Right-sized for current scale; easy graduation to multi-server later. | This file §6 |
| **Multi-lingual: Phase 0-1 only this quarter** | Build i18n infra (`next-intl`) + translation key scaffolding into every new app. Defer actual Hindi/regional translations until a customer asks. QuikConstruction is the most likely first use case (field workers need Hindi). | This file §7 |
| **#40 SlidePanel vs Modal consolidation: DEPRIORITIZED** | They serve different JTBD (list-context vs focused-blocking). Keep both. Write governance doc if confusion arises. | NEXT_ITEMS.md row 40 |
| **Notification / toast system: #43 added to backlog** | Current error/success feedback is inconsistent. Build shared `ToastProvider` in `@quikit/ui`. Medium priority. | NEXT_ITEMS.md row 43 |

---

## 3. Critical rules (NON-NEGOTIABLE — read before touching anything)

### 3.1 Git workflow — STRICT
- **Never `git push`** to `main` / `dev` / `uat` without explicit `OK`/`push`/`ship it` from Ashwin in chat.
- **Work in feature branches.** Naming: `feature/<short-description>`.
- **Merge order**: `feature/*` → `dev` → `uat` → `main`. All 3 primary branches stay at same HEAD after merges.
- **Create backup tags** before destructive ops (`git tag backup/pre-<x>-<timestamp>`).
- **PR-style merge**: prefer `git merge --no-ff` from feature branch so history shows the merge commit.
- **Delete merged feature branches** both locally and on origin after successful merge.
- **Commit style**: Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `docs:`, `perf:`). Include a short body explaining why, not just what.

### 3.2 Code rules (distilled from `CLAUDE.md`)
- **Always filter by `tenantId`** on every Prisma query (except super-admin cross-tenant ops).
- `catch (error: unknown)` — **never** `catch (e: any)`.
- API responses always: `{ success: true, data }` or `{ success: false, error: string }`.
- HTTP codes: 200 read · 201 create · 400 validation · 401 unauth · 403 forbidden · 404 not-found · 409 conflict · 429 rate-limit · 500 internal.
- **File names lowercase** (`sidebar.tsx`, not `Sidebar.tsx`). Exports PascalCase (`export function Sidebar`).
- **Import shared UI from `@quikit/ui`** — never create local copies of `Button`, `Input`, `Modal`, etc.
- **Shared utilities from `@quikit/shared`** (subpath imports for Node-only modules).
- Provider order: `SessionProvider → QueryClientProvider → ThemeProvider → ConfirmProvider`.
- Login route: `/login` on all apps (not `/auth/login`).
- **NEXTAUTH_SECRET is shared** across quikit/quikscale/admin (used by both OAuth and impersonation).

### 3.3 🔒 LOCKED TABLES (from CLAUDE.md — do NOT change)
Four tables have locked cell styling — NEVER theme cells with `accent-*`:
1. Individual KPI table — `apps/quikscale/app/(dashboard)/kpi/components/KPITable.tsx`
2. Team KPI table — `apps/quikscale/app/(dashboard)/kpi/teams/components/TeamSection.tsx` + shared `KPITable.tsx`
3. Priority table — `apps/quikscale/app/(dashboard)/priority/components/PriorityTable.tsx`
4. WWW table — `apps/quikscale/app/(dashboard)/www/components/WWWTable.tsx`

**Exception**: `<th>` header backgrounds may use `bg-accent-50` — that's it.

These use fixed `blue-*` / `gray-*` / semantic colours because:
- KPI weekly-value traffic-light (Blue=Exceeded, Green=Achieved, Yellow=Near, Red=Below) is SEMANTIC, not brandable.
- Priority/WWW "completed" is intentionally blue so all 4 tables share the same state across tenants.
- Row IDs must stay black (`text-gray-900`) so tenants with purple/teal/orange themes still have neutral readable ID columns.

Before any bulk CSS refactor, **exclude** these 4 files AND `apps/quikscale/lib/utils/colorLogic.ts` + `apps/quikscale/lib/utils/kpiHelpers.ts`.

### 3.4 Testing rules
- **Every bug fix ships a regression test** (fails before fix, passes after). No exceptions.
- **Every new API route** gets: 401-unauth test + tenant-isolation test + happy-path test.
- **Every new shared utility** in `lib/utils/` or `@quikit/shared` reaches ≥90% line coverage.
- Test file conventions (from `CLAUDE.md`):
  - `__tests__/unit/*.test.ts` — node env, pure functions
  - `__tests__/permissions/*.test.ts` — node + mocked DB
  - `__tests__/api/*.test.ts` — node + mocked Prisma + mocked session
  - `__tests__/components/*.dom.test.tsx` — jsdom via `// @vitest-environment jsdom`
  - `__tests__/e2e/*.spec.ts` — Playwright only (excluded from Vitest)
- Mocking: `setSession(user)` from `__tests__/setup.ts` + `mockDb` + `resetMockDb()` from `__tests__/helpers/mockDb.ts`.
- **Coverage ratchet**: `scripts/coverage-ratchet.mjs` fails CI if lines/statements/functions/branches drop >0.25 pts.

### 3.5 Security policies (sensitive — follow strictly)
- **Never commit secrets** (check `.env*`, no hardcoded keys in code).
- **Never push `.env.local`** (gitignored — verify before commits).
- Super-admin actions logged via `logAudit()` — audit trail matters for enterprise.
- Impersonation tokens are single-use + 2h expiry (SA-D design).
- Rate limiting: `withSuperAdminAuth` wraps all POST/PATCH/PUT/DELETE (60/min/user, fail-open).

---

## 4. Current state of the repo (2026-04-19)

### Branches
| Branch | HEAD | Status |
|---|---|---|
| `main` | `8f8bac9` | ✅ stable, all green |
| `dev` | `8f8bac9` | ✅ synced with main |
| `uat` | `8f8bac9` | ✅ synced with main |
| Feature branches | (none) | 0 open, merge backlog is clean |
| Backup tags | `backup/pre-ff1-merge-20260417-205000`, `backup/pre-super-admin-merge-20260418-094239` | retained |

### Tests
| Workspace | Count |
|---|---|
| quikscale | 975 |
| quikit | 267 |
| admin | 57 |
| @quikit/shared | 60 |
| @quikit/auth | 1 |
| **Total** | **1,360** |
| Super-admin non-cron API coverage | **100%** |

### What's deployed to prod (Vercel — still the live production)
| App | URL | Status |
|---|---|---|
| QuikIT (IdP + super-admin) | `https://quik-it-auth.vercel.app` | ✅ healthy (p50 ~279ms auth/session, p95 ~1717ms cold start) |
| QuikScale | `https://quikscale.vercel.app` | ✅ healthy (p50 ~26ms health endpoint, p95 ~1412ms cold) |
| Admin | `https://quik-it-admin.vercel.app` | ✅ healthy (p50 ~315ms, p95 ~1826ms cold) |

Prod smoke test (2026-04-18): 360 requests across 12 public endpoints, **0 errors**. Full report: `docs/audit/PROD_SMOKE_RESULTS_2026-04-18.md`.

---

## 5. What was shipped in the preceding sessions (for context)

To understand what the user has already done, here's the full arc across ~6 sessions that preceded this handoff. Listed in rough chronological order.

### Phase 1 — Stability + merge backlog cleanup
- ✅ Sentry wired across all 3 apps (`feat(observability)` commit, client/server/edge configs + `instrumentation.ts`). **User still needs to set `SENTRY_DSN` in Vercel env vars.**
- ✅ Redis fail-loud in prod (loud one-time banners when `REDIS_URL` missing or first connection error; `requireRedis()` helper exported)
- ✅ Rate-limit on `/api/auth/impersonate/*` endpoints (`/auth/impersonate/[token]` accept: 20/15min fail-closed; `/auth/impersonate/exit`: 30/min fail-open)
- ✅ #3A QuikScale components rewired from local shims → `@quikit/ui` (21 imports across 17 files, 5 shim files deleted)
- ✅ #37 dead `@quikit/shared/withApiLogging` removed (zero imports, was speculative)
- ✅ #24 pageSize cap 100 on list schemas (was 200–1000)
- ✅ #25 per-super-admin mutation rate limit (60/min, fail-open) added **inside** `withSuperAdminAuth` — auto-covers all 27 mutation routes
- ✅ #31/#33/#34/#35 UX polish bundle: impersonation expiry escalation (15m warn / 5m critical), `formatDate` in `@quikit/shared`, URL-persistent platform-users filter, shared `severity` helper in `@quikit/ui`
- ✅ #32 ConfirmModal: promise-based replacement for `window.confirm`. 19 call-sites migrated across all 3 apps.
- ✅ #29 Loading skeletons replaced "Loading…" text across 12 super-admin pages
- ✅ #36 Mobile responsive audit (16 issues → 12 fixed inline, 4 documented) + deferred items (card-view table for /organizations, AvgKPICard compact, audit date-range stack)
- ✅ #27 AppSwitcher: module-level cache (5min TTL) + idle-time prefetch + in-flight request dedupe
- ✅ #30 Empty-state guidance on 6 quikscale modules (KPI, priority, WWW, goals, meetings daily-huddle, meetings cadences) — each with CTA wired to existing Create flow
- ✅ Playwright harness for quikit (`playwright.config.ts` + 11 smoke specs + e2e-super seed user)
- ✅ E2E flows: super-admin login, page-loads, impersonation (4 API-level tests), feature-flags, tenant CRUD full flow (2 tests)

### Phase 2 — Test coverage sweep (Group D)
- ✅ #17 alerts list + ack tests (9 tests)
- ✅ #12-16 5 new API test files: plans, invoices, broadcasts, tenant-app-access, tenant-health+analytics (55 tests)
- ✅ Group D extension: 5 more super-admin routes (feature-flags, feature-flags/toggle, tenants/full, users/bulk, orgs/members) — 37 tests
- ✅ This-session finale: last 4 uncovered routes (apps/[id]/oauth 12 tests, users/[id] 8 tests, apps/bulk 4 tests, analytics/tenant 4 tests) — 29 tests
- **Result: 100% of non-cron super-admin routes have test coverage.**

### Phase 3 — OPSP decomposition (page.tsx 1891 → 414 lines, -78%)
The flagship refactor. OPSP (One-Page Strategic Plan) was a 1891-line React page. Decomposed across 5 phases:
- **Phase 0** — Pure helpers extracted to `apps/quikscale/lib/utils/opspHelpers.ts` (+42 unit tests)
- **Phase 1** — `YearQuarterPicker` component + Word-export helpers to `lib/previewExport.ts` (+25 tests)
- **Phase 2** — `useOPSPForm` hook (state + autosave + cascade effects) to `hooks/useOPSPForm.ts` (+20 tests; -242 lines from page)
- **Phase 3** — 5 quadrant sections to `components/{Objectives,Targets,Goals,Actions,Accountability}Section.tsx` (+24 tests; -447 lines)
- **Phase 4** — `OPSPPreview` (read-only view, 770 lines) to `components/OPSPPreview.tsx` (+8 tests; -788 lines)

Final state: `page.tsx` is 414 lines — pure composition shell (hook + 5 sections + preview). Full plan at `docs/audit/OPSP_DECOMP_PLAN.md`.

### Phase 4 — Production ops
- ✅ Smoke-test harness built: `scripts/smoke-test.mjs` (zero-dep Node ESM)
- ✅ API inventory: `docs/audit/API_INVENTORY_AND_SMOKE.md` (136 routes catalogued)
- ✅ Live prod smoke (2026-04-18): 360 requests, 0 errors, p50/p95/p99 per module, cold-start analysis

---

## 6. Architecture — Platform + Domain Apps (the shape to preserve)

### The mental model
```
┌──────────── QuikIT = Platform (identity, tenancy, billing, app registry) ────────────┐
│                                                                                        │
│  Auth (OIDC) · Tenant mgmt · User mgmt · RBAC · Billing · Audit log · Feature flags  │
│  App registry · Super-admin console · Launcher UI · Broadcasts                        │
│                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────┘
         ▲ ▲ ▲ ▲ ▲ ▲ ▲            (domain apps consume platform APIs)
         │ │ │ │ │ │ │
   ┌─────┘ │ │ │ │ │ └──────┐
   │       │ │ │ │ │        │
QuikScale  QuikCRM  QuikPMS  QuikConstruction  QuikWorkflows  (more apps later)
(OKR/KPI)  (sales)  (proj.)  (field/crews)     (automation)
```

**The rule**: if it's true for ALL apps → lives in platform (`@quikit/*` packages). If it's unique to a vertical → stays in the app.

### Monorepo layout (current)
```
apps/
  quikit/        Platform: launcher, super-admin console, IdP, OAuth authorize/token/userinfo
  quikscale/     Domain app: OKR/KPI/OPSP/priority/meetings (flagship)
  admin/         Platform: per-tenant admin UI (lean)

packages/
  ui/            Design system (Button, Input, Modal, SlidePanel, ConfirmModal, ToggleSwitch, AppSwitcher, ImpersonationBanner, EmptyState, Skeleton, severityClass, ThemeApplier, …)
  auth/          NextAuth factories, OIDC, gate helpers, middleware
  database/      Prisma client + schema + migrations
  redis/         ioredis wrapper with fail-loud + requireRedis helper
  shared/        Subpath-only Node utils (apiLogging, rateLimit, email, env, moduleRegistry, dateFormat, pagination, redisCache)
```

### Expected monorepo layout as N grows (target for Q2/Q3)
```
apps/
  quikit/ admin/                         ← platform surfaces
  quikscale/ quikcrm/ quikconstruction/  ← domain apps
  quikpms/ quikworkflows/ …

packages/
  platform/
    auth/ database/ tenancy/ billing/ audit/ flags/ notifications/
  ui/
    components/ layouts/ theming/
  shared/
    i18n/ dateFormat/ redis/ validation/
  domains/                               ← NEW — shared domain models when 2+ apps need them
    people/ money/ workflow/
  app-template/                          ← NEW — scaffold for spinning up new apps
```

### Key invariants (DO NOT break)
1. **Apps don't touch each other's DB tables.** Cross-app data = platform API call OR shared domain model in `@quikit/domains/*`.
2. **Shared code earns its place.** Promotion to `@quikit/*` requires ≥2 apps actually using it. No speculative sharing.
3. **Platform is thin.** Only genuinely cross-cutting stuff.
4. **Conventions beat configuration.** Every app follows the same patterns. Enforced by scaffolds + lint rules, not code-review heroism.

### Target deployment architecture (self-hosted, Q2 2026)
```
🌐 Cloudflare (DNS + CDN + DDoS + WAF) — free tier
         │
         ▼
┌──────────────────── India Pod (cloud provider TBD — options below) ────────────────────┐
│                                                                                            │
│  Caddy reverse proxy (auto SSL via Let's Encrypt)                                         │
│       │                                                                                     │
│       ├── /quikit     → Node :3000                                                         │
│       ├── /quikscale  → Node :3004                                                         │
│       ├── /admin      → Node :3005                                                         │
│       ├── /quikcrm    → Node :3006 (when built)                                            │
│       ├── …                                                                                │
│  Postgres (self-hosted or Neon India) — schema-per-app                                    │
│  Redis (self-hosted or Upstash India)                                                      │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```
- **Tier 2: Docker Compose on single beefy VPS.** Not K8s. Not multi-server yet.
- **Build in CI** (GitHub Actions), ship Docker images to GHCR.
- **Rollback via docker tag swap.** ~10-30s with health-check gate.
- **No preview-per-PR** (lose that vs Vercel — accepted trade-off).
- **CDN via Cloudflare** fronts everything.

### Cloud provider decision for the India pod (UNRESOLVED)

Hetzner does NOT have Indian data centres (closest is EU). For genuine India data residency, pick one of:

| Option | Cost (mid-size VM) | Pros | Cons |
|---|---|---|---|
| **AWS Mumbai** (`ap-south-1`) | ~₹8-12k/mo (c6i.xlarge) | Mature India presence, broad service menu | Most expensive option |
| **Azure India** (Mumbai / Pune / Chennai) | ~₹8-12k/mo (D4s v5) | Enterprise procurement friendly | Similar cost to AWS |
| **GCP Mumbai** (`asia-south1`) | ~₹7-10k/mo (e2-standard-4) | Good dev tooling | Fewer India regions than AWS |
| **DigitalOcean Bangalore** (`BLR1`) | ~₹3-5k/mo | Simple pricing, developer-friendly | Less enterprise credibility in procurement |
| **E2E Networks / CtrlS / Netmagic** (Indian domestic cloud) | ~₹2-5k/mo | Strongest residency story (Indian company) | Tooling gap; not widely known; potential support SLA concerns |
| **Hetzner EU** | €60/mo (~₹5k/mo) | Cheapest, best value for CPU/RAM | **Violates India data residency** — only viable if customer confirms "EU is OK" |

**Action for DevOps person:** confirm one with the first paying/committed customer. If residency is contractual, Hetzner is OUT. Default recommendation: **DigitalOcean Bangalore** (cheap, simple, India-hosted) OR **AWS Mumbai** if customer wants enterprise-grade provider names on the contract.

### Migration plan (Vercel → self-hosted)
Agreed sequence:
1. **Week 1-2: Foundation.** Add `output: "standalone"` to every `next.config.js`. Write `Dockerfile` per app. Validate full stack on laptop with `docker compose up`.
2. **Week 3: Provisioning.** 1 Hetzner CCX43 (or Indian cloud equivalent). Caddy + Docker Compose + Postgres + Redis. Migrate QuikIT + QuikScale + Admin for parity.
3. **Week 4: CI/CD.** GitHub Actions → build → push to GHCR → SSH deploy → health-check → rollback. Run Vercel + self-hosted IN PARALLEL for 2 weeks before cutover.
4. **Weeks 5-8: New apps.** Use `@quikit/app-template` (to be built) to scaffold QuikCRM, QuikConstruction, QuikPMS, QuikWorkflows. Each app 1 week at most if scaffold is right.
5. **Weeks 9-12: Polish + onboarding.** SLA status page, backup/restore runbook, per-tenant data export, enterprise onboarding UI, 3-5 real customers onboarded.

**User has a DevOps person who will own most of this infra work.** Your role = shared package refactors, app-template authoring, CI configuration, database schema migration planning.

---

## 7. Multi-lingual (i18n) — phased plan

### Decision made in last session's brainstorm
- **Phase 0 this quarter (1 week work):** install `next-intl` in `packages/i18n`, set up locale-based routing, add `User.locale` + `Tenant.defaultLocale` columns, language switcher UI (hidden behind feature flag).
- **Phase 1 this quarter:** migrate ALL hardcoded strings in the 6 new apps to translation keys (still English) — ESLint rule forbids raw strings in JSX.
- **Phase 2 deferred:** actual Hindi translation, starting with QuikConstruction (field workers most likely to need it).
- **Phase 3 deferred:** regional languages (Tamil, Marathi, Gujarati, Telugu) — only when a customer asks.

### What NOT to do
- ❌ Translate QuikIT super-admin console (internal, English fine).
- ❌ Translate QuikScale (exec users operate in English).
- ❌ All 22 Indian official languages preemptively.
- ❌ RTL support (Urdu can come later if asked).
- ❌ Transliteration (Hinglish input) — defer.

### Key technical choices
- Library: **`next-intl`** (not i18next, not Lingui). Type-safe keys, works with App Router.
- URL-based locale: `quikscale.quikit.in/hi-IN/dashboard`.
- Per-user preference stored in `User.locale`, falls back to `Tenant.defaultLocale`, falls back to `en-IN`.
- Number formatting: use `Intl.NumberFormat('en-IN', ...)` — handles Indian lakhs/crores (`10,00,000`) out of the box.
- Fonts: `next/font/google` → `Noto_Sans_Devanagari` for Hindi ligatures.

---

## 8. Pending user actions (not code — things only Ashwin can do)

| # | Action | Where | Impact if not done |
|---|---|---|---|
| 1 | Set `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` in Vercel env vars (all 3 apps) | Vercel dashboard | Prod 500s invisible — find out from users |
| 2 | Set `CRON_SECRET` env var in Vercel quikit project | Vercel dashboard | Daily crons (cleanup-api-calls, generate-invoices) can't run |
| 3 | Run `prisma migrate deploy` on Neon prod DB if any pending migrations | Neon + Vercel | New code can crash on missing schema |
| 4 | Click "Refresh data" on Super-Admin Analytics + "Probe all" on App Registry | Prod super-admin UI | Cron-output tables stay empty (rollup, health-check, alerts) |
| 5 | Sign off deploy strategy (Vercel → self-hosted) before DevOps person starts | Chat | Blocks Q2 migration |
| 6 | Confirm QuikCRM / QuikConstruction / QuikPMS / QuikWorkflows requirements for greenfield build | Chat (user said "starting from scratch with proper implementation") | Can't scaffold apps without scope |

---

## 9. Active backlog (NEXT_ITEMS.md summary)

Full backlog: `docs/audit/NEXT_ITEMS.md`. Highlights below:

### 🔴 Critical / blocking
- **#1 Neon `prisma migrate deploy`** (4 pending migrations) — deploy gate
- **#2 Set `CRON_SECRET`** — see pending user actions above
- **#3 Cron strategy decision** — USER PARKED. Choose: Vercel Pro ($20/mo cron), UptimeRobot webhooks (free), GitHub Actions scheduled workflow, or defer entirely.
- **#5 Set Sentry DSN** — see pending user actions above
- **#41 Seed first design-partner customer** — revenue unlock; **the real bottleneck, not code**

### 🟠 High priority ready-to-work
- **#43 Toast/notification system** — consistent error/success feedback across all apps. ~3h effort. My pick for next session if user wants UX polish.
- **#22 Hash `Impersonation.token` at rest** — needs Prisma migration; low-risk security hardening. ~3h.
- **#21 IP allowlist env for super-admin login** — touches auth flow; needs user design call.

### 🟡 Medium — ready-to-work
- **#23 Scrub PII from AuditLog oldValues/newValues** — retroactive migration needed. ~4h.
- **#28 Server-cache `/api/feature-flags/me` (5-min Redis)** — ~2h.
- **#42 Real Stripe integration** — wait until customer #1 needs to pay.

### 🟢 Low — explicitly deprioritized
- **#40 SlidePanel vs Modal consolidation** — deprioritized; they serve different JTBD.
- **#37 dead withApiLogging** — ✅ already done this session.
- **#38 BroadcastDismissal → localStorage** — cleanup.
- **#39 ApiCallHourlyRollup + cron removal** — premature at <10 tenants; consider after 10.

### Explicitly NOT doing (from anti-roadmap)
- Real-time collaboration / WebSockets / CRDTs (wrong stage)
- Native iOS/Android apps (responsive web sufficient)
- Full ShadCN rewrite (L1 visual refresh already done)
- Workflow automation builder (Zapier does it)
- SOC 2 / compliance certs (defer until enterprise customer demands)

---

## 10. Quick reference — key files and where they live

### Docs (read these if the session asks about context)
- `CLAUDE.md` — hot-path rules, locked tables, theming system
- `docs/PLATFORM_MIND_MAP.md` — 30-second self-reference for codebase layout
- `docs/audit/NEXT_ITEMS.md` — prioritized backlog (43 items)
- `docs/audit/ROADMAP_2026.md` — 3/6/12-month forward plan
- `docs/audit/AUDIT_2026-04-18.md` — full quality audit
- `docs/audit/TEST_CASES.md` — comprehensive test scenario list
- `docs/audit/PROD_SMOKE_RESULTS_2026-04-18.md` — live Vercel prod latency report
- `docs/audit/API_INVENTORY_AND_SMOKE.md` — 136-route inventory grouped by app → module
- `docs/audit/OPSP_DECOMP_PLAN.md` — the decomp roadmap (now complete)
- `docs/audit/MOBILE_AUDIT_2026-04-18.md` — mobile responsive audit + deferred items
- `docs/engineering/SENTRY_SETUP.md` — Sentry configuration guide
- `docs/engineering/prod-safety-rules.md` — env-var safety gate
- `docs/architecture/10k-users-iaas-rollout.md` — scaling plan beyond current

### Key source paths
- `packages/database/prisma/schema.prisma` — full data model
- `packages/auth/index.ts` — auth factories + middleware
- `packages/ui/index.ts` — barrel of all shared components
- `packages/shared/lib/*.ts` — Node-only utilities (all subpath-exported)
- `apps/quikit/app/(super-admin)/` — super-admin console surface
- `apps/quikit/app/api/super/*` — super-admin backend routes (~27 POST/PATCH/PUT/DELETE, all wrapped)
- `apps/quikscale/app/(dashboard)/opsp/` — the flagship decomposed feature (414-line page + hook + 5 sections + preview)
- `scripts/smoke-test.mjs` — production smoke-test harness (runnable against any URL)

### Env vars (summary — see `apps/*/.env*.example` for full list)
- Platform-wide: `NEXTAUTH_SECRET` (shared), `DATABASE_URL` + `DATABASE_URL_DIRECT`, `REDIS_URL`
- Per-app: `NEXTAUTH_URL`, `QUIKIT_URL` (on quikscale/admin), `QUIKIT_CLIENT_ID`, `QUIKIT_CLIENT_SECRET`
- Optional: `RESEND_API_KEY` (emails), `CRON_SECRET` (cron auth), `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`

### Common commands
```bash
# Dev
npm run dev                     # all apps via turbo
npm run dev:quikscale           # just quikscale

# Quality gates (must pass before any commit)
npm run typecheck               # tsc --noEmit across all workspaces
npm run test                    # vitest across all workspaces (1,360 tests, <5s warm)
npm run lint                    # next lint across apps

# DB
npm run db:push                 # push schema (dev only)
npm run db:migrate              # migrate dev (creates migration file)
npm run db:migrate:deploy       # apply pending migrations (prod)
npm run db:seed:e2e             # reset E2E tenant
npm run db:studio               # Prisma Studio UI

# E2E
npm run e2e                     # quikscale Playwright
npm run e2e:quikit              # quikit Playwright (super-admin smoke + impersonation + feature-flags + tenant CRUD)
npm run e2e:all                 # both

# Prod smoke (run against any URL)
BASE_URL=https://quikscale.vercel.app APP=quikscale PUBLIC_ONLY=1 REQS=30 node scripts/smoke-test.mjs
```

---

## 11. Plugins / MCP tools available (as of this session)

### Woz (installed via Claude Code plugin marketplace)
- Marketplace: `wozcode-marketplace` (from `WithWoz/wozcode-plugin` on GitHub)
- Plugin: `woz@wozcode-marketplace` v0.3.42
- Scope: user (persists across sessions once installed)
- Status: installed but **requires Claude Code restart to fully activate the `woz:*` main-thread agents** (tools work now via `ToolSearch`)

### Tools provided
Before Claude Code restart: these appear as *deferred* tools — you must load schemas via `ToolSearch` before calling them (e.g. `ToolSearch("select:mcp__plugin_woz_code__Edit,mcp__plugin_woz_code__Search")`).

After restart: the plugin boots a `woz:code` main-thread agent that has these tools first-class, and the PreToolUse hook nudges you to use them over raw Bash for file discovery / editing.

- `mcp__plugin_woz_code__Search` — combined file discovery + grep + read (prefer over Bash `find`/`grep`/`cat` and over standalone `Grep`/`Glob`/`Read`)
- `mcp__plugin_woz_code__Edit` — batched fuzzy-match edits (prefer over `Write`/`Edit` when doing multiple edits at once)
- `mcp__plugin_woz_code__Sql` — SQL introspection
- `mcp__plugin_woz_code__Recall` — semantic search of past sessions

### Skills provided
- `/woz-savings`, `/woz-login`, `/woz-status`, `/woz-logout`, `/woz-update`, `/woz-recall`, `/woz-benchmark`, `/woz-settings`

### Active hook
- PreToolUse hook enforces: **use `mcp__plugin_woz_code__Edit` for file writes/edits** (not Bash `echo >` or `cat <<EOF`), and **`mcp__plugin_woz_code__Search` for discovery** (not Bash `grep`/`find`/`cat`). Raw Bash for these triggers a reminder — use the correct tool for subsequent calls.

---

## 12. Communication style cheatsheet (so you don't waste time)

### When Ashwin writes a terse command
- "fix this" → diagnose + fix + verify (typecheck + tests) + report result. Don't ask 5 clarifying questions.
- "do that" → pick the most obvious interpretation + execute; ask MAX 1 clarifying question.
- "analyse X" → analyse + give strong opinion + recommend; don't just list options.
- "/product-management:product-brainstorming X" → push back on premise FIRST; then divergent ideation; then converge to 1-2 concrete recommendations.
- "check if Y works" → actually test; don't trust previous state.
- "continue" → pick up where prior agent/thread left off without re-explaining.

### What he's allergic to
- Long preambles before the answer.
- Disclaimers ("I'm happy to help" / "Great question!").
- Generic option lists without an opinion.
- Silent failures ("it probably works" — no, run the test).
- Scope creep ("while I was there I also refactored X").
- Unsolicited TodoWrite when the task is simple.

### What he rewards
- Opinionated recommendations with reasoning.
- Pushing back on bad premises ("that's actually the wrong question — the real question is…").
- Concrete deliverables + verification.
- Naming patterns / anti-patterns directly ("this is the feature-parity trap").
- Short status reports (table > prose).

---

## 13. Decision log (so we don't re-litigate)

| Decision | Date | What was decided | Why |
|---|---|---|---|
| Platform + Domain Apps architecture | 2026-04-19 brainstorm | Keep current pattern; invest in governance (CODEOWNERS, app-template, schema-per-app) | Correct for N=6→N=20, proven by Shopify/Atlassian |
| Move off Vercel → self-hosted Linux by Q2 end | 2026-04-19 brainstorm | Tier-2 Docker Compose on single Hetzner/India VPS | Data residency real, 15 customers justifies it, DevOps person available |
| Single India regional pod (not multi-region) | 2026-04-19 brainstorm | One pod serving all 15 Indian customers | 15 customers in 1 region; no customer in different region yet |
| Multi-lingual: Phase 0-1 only this quarter | 2026-04-19 brainstorm | Build `next-intl` infra into every new app; defer actual Hindi/regional translation | Retrofitting i18n is 5-10× harder than building i18n-ready; translating without demand = maintenance burden |
| #40 SlidePanel vs Modal: keep both | 2026-04-18 brainstorm | They serve different JTBD (list-context vs focused-blocking) | Consolidation = feature-parity trap; write governance doc instead |
| #6b OPSP decomp: execute all 4 phases | 2026-04-18 | 1891 → 414 lines, 5 phases | Biggest maintainability win; safety net = 119 tests covering every extracted piece |
| Merge backlog cleanup: all 20 branches to main | 2026-04-18 | Sequential merge by phase (A pure adds → B infra → C UX overlays → D Playwright → E OPSP) | Branch debt was blocking any new work |
| Sentry tests routes (`/api/sentry-test`) DELETED | 2026-04-19 (this session) | Removed after Sentry smoke test done | Were blocking static-export builds |

---

## 14. How to pick up where this session ended

If the new session opens with no specific task from Ashwin, here's the priority list:

### If Ashwin wants to ship self-hosted Q2 migration (MOST LIKELY next focus)
1. Add `output: "standalone"` to each `next.config.js` in `apps/*/`
2. Write `Dockerfile` per app
3. Write root `docker-compose.yml` (caddy + 3 node apps + postgres + redis)
4. Validate locally on laptop: `docker compose up`
5. Only THEN touch Vercel migration

### If Ashwin wants to build QuikCRM / QuikWorkflows / etc.
1. First build `packages/app-template` (the scaffold)
2. Then use it to create each new app
3. Each new app: use platform auth, database (schema-per-app), UI components; domain logic only in the app

### If Ashwin wants small UX polish
1. **#43 Toast system** — the biggest remaining UX consistency gap. ~3h.

### If Ashwin wants security hardening
1. **#22 Hash Impersonation.token** — needs a Prisma migration; plan the 3-step migration carefully.

### Always-safe default
1. `npm run typecheck && npm run test && npm run lint` — ensure state is green.
2. `git status && git log --oneline -5` — confirm you know what's deployed.
3. Ask Ashwin what to pick up. One clarifying question.

---

## 15. Pre-flight checklist for the new session

Before taking any action, verify:

- [ ] `git branch --show-current` = `main` (or a feature branch, NEVER dev/uat without reason)
- [ ] `git log --oneline -5` — the two most recent commits on `main` should be the handoff commit (this doc) and `8f8bac9 test(api): cover last 4 uncovered super-admin routes`. If the handoff branch was merged, HEAD will be the handoff commit. If not merged yet, HEAD is still `8f8bac9`.
- [ ] `npx turbo typecheck && npx turbo test && npx turbo lint` — all green (tests ~1,360; exact count grew as new work lands)
- [ ] User is who I think they are (`ashwinsingone1993@gmail.com`). Cross-reference the project auto-memory file at `~/.claude/projects/-Users-user-Documents-Claude-Code-QuikIT/memory/MEMORY.md` — it indexes git workflow preferences, dev ports, monorepo structure, and barrel-export client-safety rules.
- [ ] Working dir is `/Users/user/Documents/Claude_Code/QuikIT`
- [ ] WOZ plugin tools available (if not, ignore the PreToolUse hook reminder — use standard Edit/Write/Grep instead). After a Claude Code restart the plugin registers a `woz:code` main-thread agent that auto-routes the MCP tools.

If any of these fail: stop, report, ask Ashwin before continuing.

---

## 16. "What would I regret not writing down" (honest notes)

A few things that aren't on the other lists but the next session should know:

1. **The user is solo + has 1 DevOps person.** Don't propose process overhead that implies a 10-person team (Jira sprints, RFC council, etc.). Small-team conventions (CODEOWNERS, lint, scaffolds) yes; big-company ceremonies no.

2. **He's moved fast across 6+ sessions.** Don't treat every session as if starting from scratch. Read recent commits (`git log --oneline -20`) and `PLATFORM_MIND_MAP.md` first.

3. **The `DevOps person` is a variable:** you don't talk to them directly; Ashwin relays. Write docs and scripts such that a DevOps human can execute without your context.

4. **`CLAUDE.md` is the gospel for code style.** Break rules there and expect pushback.

5. **The existing code is mostly GOOD** — high coverage, clear patterns, working production. Don't "improve" things that aren't broken. Scope creep = frustration.

6. **OPSP is the flagship feature** — the decomp was hard-won. If you touch `apps/quikscale/app/(dashboard)/opsp/*`, read `docs/audit/OPSP_DECOMP_PLAN.md` first and respect the phase boundaries (helpers / hook / sections / preview are now separate on purpose).

7. **Prisma gotcha to remember:** Prisma 5.22 requires `DATABASE_URL_DIRECT` even when identical to `DATABASE_URL`. Error code P1012.

8. **Vitest gotcha:** must add `@quikit/shared/<subpath>` alias in every `vitest.config.ts` for subpath imports to work. Already done; don't forget when adding new subpaths.

9. **When a command fails:** investigate root cause, don't retry. Ashwin pushed back on "it's a stale cache" once; the actual root cause was missing `prisma generate` in Vercel build.

10. **The Sentry / CRON_SECRET pending items have been pending for 3+ sessions.** Don't keep asking Ashwin about them; he'll set them when he's ready. Mention once if relevant, then drop.

---

## 17. Prompt for the new session

Paste this as your first message to the new Claude Code session:

```
I'm continuing work on the QuikIT project. Please read
/Users/user/Documents/Claude_Code/QuikIT/docs/SESSION_HANDOFF_2026-04-19.md
end-to-end before doing anything else. It captures everything from the
prior sessions — identity, architecture, business context, strategic
decisions, rules, current state, backlog, working style.

Once you've read it, confirm you're caught up by telling me:
1. What we're building (1 sentence)
2. The 3 rules you must NOT break (git, code, locked tables)
3. The top 3 items from the backlog you'd recommend next
4. One clarifying question (max)

Then wait for my instruction.
```

---

*End of handoff. Good luck, next session.*
