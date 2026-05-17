# QuikScale — Code Structure (for AI handoff)

Compact map of `apps/quikscale` in the QuikIT monorepo. Paths are relative to `apps/quikscale/`.

## Stack
- **Framework:** Next.js 14 (App Router) on port 3003 dev / 3002 start
- **Auth:** NextAuth v4 (`lib/auth.ts`, `getServerSession(authOptions)`)
- **DB:** PostgreSQL + Prisma (schema lives in `packages/database/prisma/schema.prisma`, client via `lib/db.ts`)
- **Styling:** Tailwind CSS, shared UI from `@quikit/ui`
- **State:** Local React + TanStack React Query
- **Validation:** Zod (`lib/schemas/*`)
- **Tests:** Vitest (unit/integration), Playwright (e2e)
- **Observability:** Sentry (`sentry.*.config.ts`), prom-client (`/api/metrics`)
- **Monorepo deps:** `@quikit/auth`, `@quikit/database`, `@quikit/shared`, `@quikit/ui`

## Top-level layout
```
apps/quikscale/
├── app/                      Next.js App Router (UI + API)
│   ├── (auth)/login/         Public auth page group
│   ├── (dashboard)/          Authenticated app group (see below)
│   ├── api/                  Route handlers (see API map)
│   ├── select-org/           Org picker
│   ├── layout.tsx, page.tsx, globals.css, sentry-init.tsx
├── components/               UI components
│   ├── client-meetings/
│   ├── dashboard/
│   ├── table/                Reusable table primitives
│   ├── ui/                   Generic UI (likely re-exports from @quikit/ui)
│   ├── providers.tsx         App-wide providers (React Query, theme, session)
│   ├── session-guard.tsx, quarter-required-guard.tsx, LogsPanel.tsx
├── lib/                      App logic (server + client)
│   ├── api/                  Server-side helpers (auth wrapper, permissions, errors, audit, rate limit)
│   ├── auth.ts               NextAuth options
│   ├── db.ts                 Prisma singleton
│   ├── constants/            status enums, etc
│   ├── context/              React contexts (FilterContext)
│   ├── export/, exports/     Excel/PDF export helpers
│   ├── hooks/                Client-side React Query hooks (use*)
│   ├── opsp/                 OPSP-specific server logic (carry-forward)
│   ├── schemas/              Zod request/response schemas per resource
│   ├── services/             Domain services (kpi, email, notifications, client-meetings math)
│   ├── types/                Shared TS types (kpi, priority, www)
│   ├── utils/                Pure helpers (dates, fiscal, currency, sanitizeHtml, opspHelpers...)
│   ├── metrics.ts            Prom metrics
│   └── utils.ts              cn(), misc
├── docs/                     API_CONTRACT.md, MODULES.md
├── scripts/                  seed-app.ts, seed-dummy.ts
├── __tests__/, tests/        Vitest + Playwright suites
├── types/next-auth.d.ts      NextAuth module augmentation
├── middleware.ts             Route protection
├── instrumentation.ts        Next instrumentation hook (Sentry)
├── sentry.{client,server,edge}.config.ts
├── next.config.js, tsconfig.json, tailwind.config.ts, vitest.config.ts, playwright.config.ts
├── .env.example              Required env vars
└── package.json
```

## Feature modules (mirrored across `app/(dashboard)/`, `app/api/`, `lib/`)

| Module | UI route | API root | Schemas | Hook |
|---|---|---|---|---|
| KPI | `(dashboard)/kpi` | `api/kpi/[id]/{logs,notes,restore,weekly}`, `api/kpi/{bulk-restore,years}` | `kpiSchema.ts` | `useKPI` |
| Team KPI | `(dashboard)/kpi/teams` | (under `api/kpi/...`) | — | — |
| Priority | `(dashboard)/priority` | `api/priority/[id]/{logs,restore,weekly}`, `api/priority/bulk-restore` | `prioritySchema.ts` | `usePriority` |
| WWW (Who/What/When) | `(dashboard)/www` | `api/www/[id]/{logs,restore}`, `api/www/bulk-restore` | `wwwSchema.ts` | `useWWW` |
| OPSP | `(dashboard)/opsp` (+ `categories`, `history`, `review`) | `api/opsp/{config,deadline,history,carry-forward,review/...}` | `opspSchema.ts`, `opspReviewSchema.ts` | — |
| OPPP | `(dashboard)/oppp` | (likely under opsp) | — | — |
| Client Meetings | `(dashboard)/client-meetings/{clients,members,daily-huddle,weekly-meeting}` | `api/client-meetings/{clients,members,daily-huddles,weekly-meetings,dashboard,export/{daily,weekly,punch}}` | `clientMeetingsSchema.ts` | — |
| Performance | `(dashboard)/performance/{cycle,feedback,goals,individual,one-on-one,reviews,scorecard,self,talent,teams,trends}` | `api/performance/{cycle,feedback,goals,individual,one-on-one,reviews,scorecard,talent,teams,trends}` | `feedbackSchema, goalSchema, oneOnOneSchema, reviewSchema, talentSchema` | `useFeedback, useGoals, useOneOnOne, usePerformance` |
| Habits | `(dashboard)/habits` | — | — | — |
| Cash | `(dashboard)/cash` | — | — | — |
| Org setup | `(dashboard)/org-setup/{quarters,teams,users}` | `api/org/{fiscal-years,info,invitations,memberships,quarters,roles,select,teams,users}` | `orgSchema, teamSchema, userSchema, teamMembersSchema, quarterSchema` | `useTeams, useUsers, useFiscalYears` |
| Settings | `(dashboard)/settings` | `api/settings/{company,configurations,profile,table-preferences}` | `settingsSchema, tablePreferencesSchema` | `useTablePreferences` |
| Dashboard | `(dashboard)/dashboard` | `api/dashboard/summary` | — | `useDashboardSummary` |
| Auth/Session/Me | — | `api/auth/[...nextauth]`, `api/auth/impersonate/{exit,[token]}`, `api/session/validate`, `api/me/permissions` | — | `useMyPermissions` |
| Feature flags | — | `api/feature-flags/me` | — | `useFeatureFlags, useFeatureFlagsForApp` |
| Health/Metrics/Docs | — | `api/health/ready`, `api/metrics`, `api/docs` | — | — |

## Key API conventions
- **Auth wrapper:** `lib/api/withOrgAuth.ts` — every tenant route wraps its handler in this. Provides `{ session, userId, orgId }` (a.k.a. `TenantAuthContext`), enforces module gating (`withOrgAuthForModule(slug)`), and writes API audit logs via `logApiCall`.
- **Errors:** `lib/api/errors.ts` — standard error responses.
- **Permissions:** per-resource permission helpers in `lib/api/*Permissions.ts` (`kpi`, `kpiWeekly`, `priority`, `teamKPI`, `www`).
- **Rate limit:** `lib/api/rateLimit.ts`.
- **Audit logging:** `lib/api/auditLog.ts` + `lib/utils/auditLog.ts`.
- **Validation:** every POST/PUT parses body with the matching Zod schema from `lib/schemas/` and returns a unified `validationError` shape.
- **Pagination:** `lib/api/pagination.ts`.

## Auth flow (read-this-first)
1. `middleware.ts` redirects unauthenticated requests on `/dashboard/**` to `/login`.
2. Login posts to `/api/auth/[...nextauth]` (NextAuth credentials).
3. After login, user picks an org → `/api/org/select` sets `orgId` claim on the session.
4. Server routes call `getServerSession(authOptions)` inside `withOrgAuth` and resolve the active `(userId, orgId)` membership.
5. Service-to-service / internal callers are listed in `packages/shared/lib/internal-services.ts` (allowlist).

## Test layout
- `__tests__/` — Vitest unit + integration (mirrors module structure).
- `tests/` — Playwright e2e.
- Vitest config: `vitest.config.ts`. Playwright config: `playwright.config.ts`.
- Run: `npm run test`, `npm run test:watch`, `npm run typecheck`.

## Env vars (`.env.example`)
- `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
- Email/SMTP (`SMTP_*`), Sentry (`SENTRY_*`), feature flags
- See `.env.example` for the authoritative list (33 lines).

## Useful entry points when investigating a request
| Question | Where to look |
|---|---|
| How is a request authenticated? | `lib/api/withOrgAuth.ts`, `lib/auth.ts`, `middleware.ts` |
| What does endpoint X return? | `app/api/<resource>/route.ts` (+ `[id]/route.ts`) |
| What validation runs? | `lib/schemas/<resource>Schema.ts` |
| Who can do X? | `lib/api/<resource>Permissions.ts`, `rolesAndPermissions*.md` |
| Server-side business logic? | `lib/services/*` |
| Client-side data fetching? | `lib/hooks/use*.ts` |
| Shared UI primitives? | `components/ui/`, `components/table/` |
| DB schema | `packages/database/prisma/schema.prisma` (NOT in this app) |

## Things to ignore
- `src/` (Python — leftover scaffold, unrelated to the Next app)
- Top-level `*.md` files except `ARCHITECTURE.md` (also stale Python notes — trust this file instead), `CLAUDE_INDEX.md` (Claude-only notes), and module-specific notes (`teamKpiChanges.md`, `userManagement.md`, etc.) which are change logs, not docs.
- `Daily_clean_Report/`, `bugsResolve.md`, `BUG_FIXES.md`, `PHASE_1_COMPLETE.md` — historical.

---
*Generated 2026-05-13 for AI handoff. Source of truth is the code itself; regenerate this map if the API or module layout changes.*
