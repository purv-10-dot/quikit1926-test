# QuikIT Platform — Mind Map

> Purpose: fast self-reference for future sessions. When asked about anything,
> read this first before exploring. Reduces token consumption vs. repeatedly
> grepping the codebase.
>
> Last updated: 2026-04-18 (after SA Phase A-D + L1 visual refresh + tech-debt pass 1).

---

## 0. The 30-second picture

- **Monorepo**: Turborepo with 3 apps (`quikit`, `quikscale`, `admin`) + 4 packages (`@quikit/database`, `@quikit/auth`, `@quikit/ui`, `@quikit/shared`).
- **IdP model**: `quikit` is the OAuth2/OIDC identity provider. `quikscale` and `admin` are OAuth clients that redirect to `quikit/login`.
- **Dev ports**: quikit 3000 → `quikit.app` (launcher + super admin + IdP). quikscale 3004. admin 3005. super admin lives *inside* quikit at `/super-admin` (not port 3006 as sometimes written).
- **DB**: Postgres. Neon in prod/uat (`DATABASE_URL` pooled + `DATABASE_URL_DIRECT` unpooled). Local dev: plain `quikscale_dev`.
- **Git workflow**: `feature/*` → `dev` → `uat` → `main`. Never push without explicit green flag from user. Each push includes a backup tag.

---

## 1. Apps

### 1.1 `apps/quikit` — Launcher + IdP + Super Admin

- `(launcher)/apps` — Grid of apps user has access to
- `(launcher)/apps/[slug]` — App detail
- `(super-admin)/` — Super admin area (gated by `session.user.isSuperAdmin`)
  - `/analytics` — Platform health dashboard (SA-C.1)
  - `/organizations` — Tenant list + `[id]` detail (has 5 stacked panels: Health, AppAccess, Billing, Impersonate, Analytics)
  - `/app-registry` — App CRUD + OAuth credentials
  - `/feature-flags` + `/feature-flags/[appSlug]` — FF-1 module flags per tenant per app
  - `/pricing` — Plans CRUD (SA-B.2)
  - `/platform-users` — Cross-tenant user list with tenant picker
  - `/broadcasts` — Platform announcements CRUD (SA-B.6)
  - `/audit` — Audit log viewer with JSON diff expander
- `api/auth/[...nextauth]` — IdP + OAuth authorize/token/userinfo
- `api/super/*` — All super-admin backend routes
- `api/super/cron/*` — 5 cron endpoints (see §7)
- `api/broadcasts/active` + `api/broadcasts/[id]/dismiss` — tenant-facing banner API

### 1.2 `apps/quikscale` — OKR/KPI product (flagship)

- `(dashboard)/` — Main product surface
  - `/kpi` (individual) + `/kpi/teams`
  - `/priority`, `/www`, `/org-setup/{teams,users,quarters}`
  - `/meetings/*`, `/opsp/*`, `/performance/*`, `/people/*`
- `api/*/route.ts` — ~45 routes, 99% use `withTenantAuth` HOF → auto-logs ApiCall
- `api/auth/impersonate/[token]` + `api/auth/impersonate/exit` — SA-D target side
- **Locked tables**: KPITable, PriorityTable, WWWTable, Team KPI — never theme cells with `accent-*` classes (use blue-*/gray-*/semantic). Explained in `CLAUDE.md`.

### 1.3 `apps/admin` — Tenant admin (lean)

- `(dashboard)/dashboard/{overview,members,teams,apps,roles,settings}`
- `api/*/route.ts` — 12 routes, use `requireAdmin()` + `gateModuleApi()`. Only 1 migrated to `withAdminAuth` wrapper — rest are tech debt.

---

## 2. Packages

| Package | Purpose | Key exports |
|---|---|---|
| `@quikit/database` | Prisma client singleton | `db`, enums from `@prisma/client` |
| `@quikit/auth` | NextAuth factories + gate helpers | `createAuthOptions`, `createOAuthClientOptions`, `createRequireAdmin`, `requireSuperAdmin` (per-app), `gateModuleRoute`, `gateModuleApi`, `isTenantAppBlocked`, `gateTenantAppRoute`, `createMiddleware` |
| `@quikit/ui` | Design system components | `Button`, `Input`, `Card`, `Modal`, `SlidePanel`, `TenantPicker`, `ModuleTree`, `ToggleSwitch`, `BroadcastBanner`, `ImpersonationBanner`, `FeatureDisabledToast`, `EmptyState`, `ThemeApplier`, `AppSwitcher`, `Select`, `Pagination`, `DataTable`, `FilterPicker`, `Avatar`, `Badge`, plus `@quikit/ui/theme-applier`, `@quikit/ui/tailwind-config`, `@quikit/ui/styles` |
| `@quikit/shared` | Zero-client-dep utils | `ROLES`, `ROLE_HIERARCHY`, `paginationToSkipTake`, `parsePaginationParams`, `buildPaginationResponse`, `rateLimitAsync`, subpath-only: `@quikit/shared/moduleRegistry`, `@quikit/shared/apiLogging`, `@quikit/shared/withApiLogging`, `@quikit/shared/email`, `@quikit/shared/env` |

> ⚠️ Barrel safety: `@quikit/shared` index must not re-export Node-only code (ioredis, pg, fs) — client bundles pull in the barrel. Server-only utils live on subpaths.

---

## 3. Auth flow

### 3.1 OIDC flow (standard user login)
1. User hits `quikscale.app/login` → redirect to `quikit.app/login?callbackUrl=...`
2. User signs in → `quikit` issues auth code
3. `quikscale` callback exchanges code for tokens at `quikit/api/auth/token`
4. `quikscale` receives id_token (claims: `sub`, `email`, `tenant_id`, `role`)
5. NextAuth session JWT is populated from claims

### 3.2 Impersonation flow (SA-D)
1. Super admin clicks "View as" on `/organizations/[id]` → POST `/api/super/impersonate/start`
2. Server creates `Impersonation` row with 32-byte base64url token, 2h expiry
3. Returns URL: `<target-app>/api/auth/impersonate/<token>?landing=...`
4. Browser opens URL (new tab) → target-app validates token, sets `acceptedAt`, encodes JWT via `next-auth/jwt`, sets session cookie
5. JWT carries `impersonating: true, impersonatorUserId, impersonationExpiresAt`
6. `ImpersonationBanner` mounted in layout fetches `/api/auth/session`, shows sticky amber banner
7. Exit → POST `/api/auth/impersonate/exit` → stamps `exitedAt`, clears cookie, redirect to launcher

### 3.3 Gates (in order of evaluation for any request)
1. **`gateTenantAppRoute`** (hard gate) — `TenantAppAccess.enabled = false` → 403
2. **`gateModuleRoute` / `gateModuleApi`** (soft gate) — `AppModuleFlag.enabled = false` → 404 / redirect
3. Route-level permission (`requireAdmin`, `requireSuperAdmin`, membership role)

---

## 4. Data model highlights

### 4.1 Multi-tenant core
- `Tenant` — root of tenancy. Has `status`, `plan` (slug string), `billingEmail`
- `User` — cross-tenant. `isSuperAdmin: boolean` is platform-level
- `Membership` — (userId, tenantId, role, status). User ↔ Tenant link
- `UserAppAccess` — (userId, tenantId, appId). Which apps each user can open
- `AppModuleFlag` — (tenantId, appId, moduleKey, enabled). Sparse — only stored when disabled (FF-1)
- `TenantAppAccess` — (tenantId, appId, enabled). Sparse. Hard gate (SA-A.6)

### 4.2 Product models
- `KPI` + `KPIWeeklyValue` + `KPINote` + `KPILog`
- `Priority` + `PriorityWeeklyStatus`
- `WWWItem` + `WWWRevisionLog`
- `Meeting` + `MeetingTemplate` + `MeetingAttendee` + `MeetingMetric`
- `DailyHuddle`
- `OPSPData` + `OPSPReviewEntry` + `OPSPDocument` + `OPSPSection` + `OPSPPlan`
- `PerformanceReview` + `TalentAssessment` + `Goal` + `OneOnOne` + `FeedbackEntry`
- `HabitAssessment`
- `QuarterSetting` — tenant fiscal calendar
- `Team` + `UserTeam` + `AccountabilityFunction`
- `CategoryMaster`

### 4.3 Platform instrumentation (SA-A / SA-C)
- `ApiCall` — raw log, 30-day retention (cleanup cron)
- `ApiCallHourlyRollup` — aggregated by (tenantId, appSlug, hourBucket, method, pathPattern, statusClass). Null tenant maps to `"_global_"` sentinel.
- `AppHealthCheck` — uptime probe records (every 15 min)
- `SessionEvent` — login/logout/impersonation_start/impersonation_end
- `BroadcastAnnouncement` + `BroadcastDismissal` — platform banners
- `Plan` + `Invoice` — billing (dummy payment buttons; no Stripe yet)
- `PlatformAlert` — alerts engine output (4 rules: app_down, api_error_spike, payment_failed, tenant_inactive)
- `Impersonation` — single-use tokens + audit trail
- `AuditLog` — cross-entity compliance log (actor, action, entity, oldValues/newValues JSON)
- `FeatureFlag` — legacy per-tenant generic flags (unrelated to FF-1 module flags)

---

## 5. Route patterns

### 5.1 Writing a new API route (QuikScale)

```typescript
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("kpi");  // gates module
export const GET = withTenantAuth(async ({ tenantId, userId }, req) => {
  const data = await db.kpi.findMany({ where: { tenantId } });
  return NextResponse.json({ success: true, data });
});
```

### 5.2 Writing a new API route (Admin)

```typescript
import { withAdminAuth } from "@/lib/api/withAdminAuth";
export const GET = withAdminAuth(async ({ tenantId }, req) => {
  const blocked = await gateModuleApi("admin", "members", tenantId);
  if (blocked) return blocked as NextResponse;
  // ...
});
```

### 5.3 Writing a new API route (Super Admin)

```typescript
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
export const GET = withSuperAdminAuth(async ({ userId }, req) => {
  // do stuff
});
```

### 5.4 Response envelope (standard)

```json
{ "success": true, "data": { ... } }
{ "success": false, "error": "human-readable message" }
```

HTTP codes: 200 read, 201 create, 400 validation, 401 unauth, 403 forbidden/blocked, 404 not found/gate, 409 conflict, 429 rate limit, 500 internal.

---

## 6. Feature flag system (FF-1 module registry)

- Central TS registry: `packages/shared/lib/moduleRegistry.ts`
- Dot-notation keys: `kpi`, `kpi.teams`, `opsp.review`, `orgSetup.quarters`, etc.
- Cascade rule: parent disabled → all children disabled (`isModuleEnabled` applies)
- Storage: sparse — row in `AppModuleFlag` exists only when `enabled: false`
- Enforcement at 3 levels:
  - L1: Sidebar filter (client-side via `useDisabledModules` hook → `/api/feature-flags/me`)
  - L2: Layout route gate (`gateModuleRoute` in server layout.tsx)
  - L3: API 404 (`gateModuleApi` inside route handler)

---

## 7. Cron endpoints (all at `quikit/api/super/cron/*`)

| Path | Schedule | What it does |
|---|---|---|
| `rollup-api-calls` | hourly | ApiCall → ApiCallHourlyRollup, 24h lookback |
| `health-check` | every 15 min | Pings each `App.baseUrl + /api/health`, writes AppHealthCheck |
| `evaluate-alerts` | every 15 min | 4 rules; upsert PlatformAlert; sends email on first fire + resolution |
| `cleanup-api-calls` | daily 3am | Deletes ApiCall rows older than 30 days |
| `generate-invoices` | monthly 1st 1am | Creates pending Invoice per active tenant per plan |

All protected by `CRON_SECRET` bearer or `?secret=` query string.

---

## 8. Testing harness

- **Vitest** for unit / permission / API / component tests. Config per workspace + shared setup/helpers.
- **Playwright** for E2E. Only `apps/quikscale/playwright.config.ts` — quikit has no harness.
- Mocking pattern: `__tests__/helpers/mockDb.ts` uses `vitest-mock-extended` + double `vi.mock` for `@quikit/database` and `@/lib/db`.
- Session mocking: `setSession(user)` from `__tests__/setup.ts`.
- Coverage ratchet: `scripts/coverage-ratchet.mjs` fails CI if lines/statements/functions/branches drop > 0.25 pts.

**Current test counts (2026-04-18):**
- quikscale: 856 tests / 51 files
- shared: 44 tests / 4 files
- auth: 1 test (smoke only)
- admin: several passing, handful of test files
- quikit: ~10 API tests + 1 new (impersonateStart)

---

## 9. Important project invariants (DO NOT violate)

1. **Every DB query filters by `tenantId`** except super-admin cross-tenant operations.
2. **Never use `catch (e: any)`** — always `catch (error: unknown)`.
3. **API error responses always include `{ success: false, error: string }`**.
4. **File names are lowercase** (`sidebar.tsx`, not `Sidebar.tsx`). Exports are PascalCase.
5. **UI package imports** — never create local copies of Button, Input, Modal, etc. Use `@quikit/ui`.
6. **Provider order in layouts**: `SessionProvider → QueryClientProvider → ThemeProvider`.
7. **Login route**: all apps use `/login` (not `/auth/login`).
8. **CSS variables for theming**: `bg-[var(--color-bg-secondary)]`, never hardcoded `bg-gray-50`.
9. **Accent color**: `accent-*` for themeable/branded UI; semantic `blue-*`/`green-*`/`red-*` for fixed state UI (KPI statuses, quarter badges).
10. **Locked tables** (see CLAUDE.md): 4 KPI/Priority/WWW tables never get accent-themed cells. `<th>` headers use `bg-accent-50` — the only exception.
11. **Barrel client-safety**: don't re-export Node-only deps from `@quikit/shared/index.ts`. Use subpaths.
12. **Never push without user green flag.** Git workflow: feature → dev → uat → main.
13. **NEXTAUTH_SECRET is shared** across quikit/quikscale/admin — used for both OAuth and impersonation JWT.

---

## 10. Common task → file map

| Task | File to edit |
|---|---|
| Add a new module to FF-1 | `packages/shared/lib/moduleRegistry.ts` + create `layout.tsx` gate + `gateModuleApi` in route |
| Add a super admin page | `apps/quikit/app/(super-admin)/<slug>/page.tsx` + add to `NAV_ITEMS` in `layout.tsx` |
| Add a super admin API | `apps/quikit/app/api/super/<slug>/route.ts` + use `withSuperAdminAuth` |
| Add a KPI field | `packages/database/prisma/schema.prisma` (KPI model) + `lib/schemas/kpiSchema.ts` + KPITable columns |
| Add a cron | `apps/quikit/app/api/super/cron/<name>/route.ts` + `apps/quikit/vercel.json` cron entry |
| Change an accent color | `packages/ui/components/theme-applier.tsx` + tenant's `brandColor` field |
| Debug a failing migration | `packages/database/prisma/migrations/` + always use `prisma migrate diff --from-url` for Neon (shadow DB errors with older migrations) |

---

## 11. Env vars (what's required where)

### Platform-wide (all apps)
- `NEXTAUTH_SECRET` — must be identical across all 3 apps
- `DATABASE_URL` (pooled), `DATABASE_URL_DIRECT` (unpooled, for migrations)
- `REDIS_URL` — Upstash; fallback to in-memory if unset (rate limiter fail-open unless `failClosed`)

### Per-app
- `NEXTAUTH_URL` — each app's canonical URL
- `QUIKIT_URL` (on quikscale, admin) — points at the IdP
- `QUIKIT_CLIENT_ID`, `QUIKIT_CLIENT_SECRET` — OAuth client creds per app
- `RESEND_API_KEY` — optional. If unset, emails log to console instead.
- `CRON_SECRET` — required on quikit for cron auth

---

## 12. Reference docs in this repo

- `/CLAUDE.md` — hot-path rules + locked tables + theming
- `/docs/plans/*` — plan docs for each major feature (FF-1, SA-A, etc.)
- `/docs/PLATFORM_MIND_MAP.md` — THIS FILE
- `/docs/audit/AUDIT_2026-04-18.md` — full quality audit
- `/docs/audit/TEST_CASES.md` — comprehensive test scenario list
- `/docs/audit/ROADMAP_2026.md` — forward-looking suggestions

---

## 13. Common gotchas I hit (so future sessions don't)

- **Prisma compound `@@unique` with nullable columns**: SQL treats NULLs as distinct, breaks upsert. Use a sentinel (e.g. `"_global_"`) instead of null.
- **Prisma 5.22 requires `DATABASE_URL_DIRECT`** even when identical to `DATABASE_URL`. Error code P1012.
- **Shadow DB migration errors** on old migrations — use `prisma migrate diff --from-url <actual-db>` instead of `migrate dev`.
- **Vitest can't read Next.js subpath exports** — must add `@quikit/shared/<subpath>` alias in every vitest.config.ts.
- **React.cache()** isn't in React 18.2 stable. Use `(React as any).cache ?? identityFn` fallback.
- **NextAuth cookie name** — `__Secure-next-auth.session-token` in prod (HTTPS), `next-auth.session-token` in dev.
- **`EmptyState` prop shape** — `icon: ElementType` (component ref), `action: { label, onClick }` — not JSX.
- **Member/user role field** — `Membership.role` not `User.role`. Users are cross-tenant.
- **`isSuperAdmin`** lives on `User`, not `Membership`.
