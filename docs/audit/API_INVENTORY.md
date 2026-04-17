# API Inventory + Duplicate-Call Analysis

**Date**: 2026-04-18
**Scope**: every HTTP endpoint across quikit, quikscale, admin. When each is called. Where we waste calls.

This is **information only** — nothing below has been executed. The ref-guard fix for the analytics page (+ tenant detail panels) IS implemented; the rest of the findings are recommendations.

---

## 📊 Totals at a glance

| App | Route files | Client fetch() calls |
|---|---|---|
| quikit | 45 | ~35 |
| quikscale | 65 | ~75 |
| admin | 19 | ~18 |
| **Total** | **129** | **~128** |

---

# §1. QuikIT — Launcher + IdP + Super Admin

## 1.1 Public / OAuth (no auth required)
| Route | When called | Notes |
|---|---|---|
| `GET /api/oauth/jwks` | Once per target-app startup (NextAuth discovery) | Public key exposure — must be cacheable |
| `GET /.well-known/openid-configuration` | Same | (handled by NextAuth config, not a file) |
| `GET/POST /api/oauth/authorize` | OAuth redirect | State-protected |
| `POST /api/oauth/token` | Post-callback exchange | Rate-limited |
| `GET /api/oauth/userinfo` | Token validation by client apps | 🟠 Called on every request from client apps → ~1 call per user per page |
| `GET /api/oauth/diag` | Manual debugging only | |
| `GET /api/auth/[...nextauth]` | NextAuth internal routes | |

## 1.2 Launcher (authenticated user area)
| Route | When called | Notes |
|---|---|---|
| `GET /api/apps/launcher` | AppSwitcher component on every page | 🟡 Once per page mount; no cache. **Duplicate risk**: each header mount re-fetches |
| `POST /api/apps/enable` | Request-access button click | On-demand |
| `GET /api/org/memberships` | `/select-org` page | Single shot |
| `POST /api/org/select` | Org picker submit | Single shot |
| `GET /api/broadcasts/active?app=quikit` | Launcher layout (BroadcastBanner) | Auto-poll every 5 min |
| `POST /api/broadcasts/[id]/dismiss` | Dismiss click | On demand |

## 1.3 Super admin pages → APIs
| Super Admin page | API calls on mount | Call count |
|---|---|---|
| `/analytics` | `GET /api/super/analytics/overview` + `GET /api/super/alerts` | 2 **(was 4 before ref-guard fix)** |
| `/organizations` | `GET /api/super/orgs?page=1&limit=20` | 1 |
| `/organizations/[id]` | `GET /api/super/orgs/[id]` + `GET /api/super/tenant-health/[tenantId]` + `GET /api/super/tenant-app-access/[tenantId]` + `GET /api/super/invoices/[tenantId]` + `GET /api/super/analytics/tenant/[tenantId]` + `GET /api/super/apps` | 6 **(was 12 before ref-guard fix)** |
| `/app-registry` | `GET /api/super/apps?page=1&limit=20` | 1 |
| `/app-registry/[id]` | `GET /api/super/apps/[id]` | 1 |
| `/feature-flags` | 0 (reads registry statically) | 0 |
| `/feature-flags/[appSlug]` | `GET /api/super/orgs?limit=1000` + `GET /api/super/feature-flags/[appSlug]?tenantId=X` (on tenant select) | 1 + 1-per-select |
| `/pricing` | `GET /api/super/plans` | 1 |
| `/platform-users` | `GET /api/super/orgs?limit=1000` + `GET /api/super/users?page=1&limit=20` | 2 |
| `/platform-users/[id]` | `GET /api/super/users/[id]` | 1 |
| `/broadcasts` | `GET /api/super/broadcasts` | 1 |
| `/audit` | `GET /api/super/audit?page=1` + refetches on filter change | 1 |

**Already fixed**: Analytics and tenant-detail pages use `useOnceEffect` to guard against React StrictMode double-invocation (dev-only behavior). In production StrictMode is off and only 1 call would fire — the fix just makes dev match prod.

## 1.4 Super admin API routes (full list)

### Organizations (tenants)
- `GET/POST /api/super/orgs` — list (paginated) + create
- `GET/PATCH/DELETE /api/super/orgs/[id]` — tenant CRUD
- `GET/POST /api/super/orgs/[id]/members` — tenant member list + add
- `POST /api/super/orgs/bulk` — bulk suspend

### Apps (registry)
- `GET/POST /api/super/apps` — list + create
- `PATCH /api/super/apps/[id]` — update
- `POST/PATCH/DELETE /api/super/apps/[id]/oauth` — OAuth client CRUD
- `POST /api/super/apps/bulk` — bulk ops

### Platform users
- `GET/POST /api/super/users` — list (with tenantId filter) + create
- `GET/PATCH /api/super/users/[id]` — detail + update
- `POST /api/super/users/bulk` — bulk grant/revoke super admin

### Feature flags (FF-1)
- `GET /api/super/feature-flags/[appSlug]` — disabled keys for tenant + app
- `POST /api/super/feature-flags/[appSlug]/toggle` — flip a module

### Audit
- `GET /api/super/audit` — paginated with filters

### New in Phase A-D
- `GET/POST /api/super/tenant-app-access/[tenantId]` — hard gate CRUD
- `GET/POST /api/super/plans` — plan list + create
- `GET/PATCH/DELETE /api/super/plans/[id]` — plan detail + update + delete
- `GET/POST /api/super/invoices/[tenantId]` — invoice list + manual gen
- `POST /api/super/invoices/[tenantId]/[invoiceId]/pay` — mark paid/failed
- `GET/POST /api/super/broadcasts` — announcement CRUD
- `GET/PATCH/DELETE /api/super/broadcasts/[id]` — one announcement
- `GET /api/super/tenant-health/[tenantId]` — 10-query tenant health blob
- `GET /api/super/analytics/overview` — 11-query platform dashboard
- `GET /api/super/analytics/tenant/[tenantId]` — per-tenant analytics blob
- `GET /api/super/alerts` — open alerts list
- `POST /api/super/alerts/[id]/acknowledge` — ack an alert
- `POST /api/super/impersonate/start` — mint impersonation token

### Crons (protected by CRON_SECRET)
- `GET /api/super/cron/rollup-api-calls` — hourly
- `GET /api/super/cron/health-check` — every 15min
- `GET /api/super/cron/evaluate-alerts` — every 15min
- `GET /api/super/cron/cleanup-api-calls` — daily
- `GET /api/super/cron/generate-invoices` — monthly

---

# §2. QuikScale — OKR/KPI product (flagship)

## 2.1 Public / auth
| Route | When called | Notes |
|---|---|---|
| `GET /api/health` + `/api/health/ready` | Uptime pings | Public, cheap |
| `GET /api/auth/[...nextauth]` | NextAuth routes | |
| `GET /api/auth/impersonate/[token]` | One-time token redemption | 410 on reuse |
| `POST /api/auth/impersonate/exit` | Banner exit click | |
| `GET /api/session/validate` | Middleware check | |
| `GET /api/metrics` | Prometheus scrape (if enabled) | |

## 2.2 Quikscale page → API mapping

| Page | API calls on mount | Count |
|---|---|---|
| `/dashboard` | `GET /api/feature-flags/me` (sidebar filter) + `GET /api/apps/switcher` + `GET /api/broadcasts/active?app=quikscale` | 3 |
| `/kpi` (individual) | `GET /api/kpi?year=X&quarter=Y` + `GET /api/kpi/years` + `GET /api/org/users` + `GET /api/org/teams` | 4 |
| `/kpi/teams` | `GET /api/kpi?scope=team...` + same supporting calls | 4 |
| `/priority` | `GET /api/priority?year=X&quarter=Y` + users + teams | 3 |
| `/www` | `GET /api/www?year=X&quarter=Y` + meta | 3 |
| `/org-setup/teams` | `GET /api/org/teams` + `GET /api/org/users` | 2 |
| `/org-setup/users` | `GET /api/org/users` + `GET /api/org/invitations` | 2 |
| `/org-setup/quarters` | `GET /api/org/quarters?year=X` | 1 |
| `/meetings/*` | `GET /api/meetings?type=X` + templates + attendees | 2-3 |
| `/meetings/daily-huddle` | `GET /api/daily-huddle?date=X` | 1 |
| `/opsp/review` | `GET /api/opsp?year=X&quarter=Y` + `GET /api/opsp/config` + `GET /api/opsp/review` + category master | 4 |
| `/opsp/history` | `GET /api/opsp/history` | 1 |
| `/performance/individual` | `GET /api/performance/individual` + cycle + scorecard | 3 |
| `/performance/reviews` | `GET /api/performance/reviews?quarter=X&year=Y` | 1 |
| `/settings/profile` | `GET /api/settings/profile` | 1 |
| `/settings/configurations` | `GET /api/settings/configurations` + `GET /api/settings/company` | 2 |

### Mutation examples (on user action only)
| User action | API call |
|---|---|
| Create KPI | `POST /api/kpi` |
| Log weekly value | `POST /api/kpi/[id]/weekly` |
| Edit KPI | `PATCH /api/kpi/[id]` |
| Add KPI note | `POST /api/kpi/[id]/notes` |
| Fetch KPI change log | `GET /api/kpi/[id]/logs` (lazy, on log-icon hover) |
| Create priority | `POST /api/priority` |
| Update priority week status | `POST /api/priority/[id]/weekly` |
| Create WWW | `POST /api/www` |
| Create/update category | `POST /api/categories`, `PATCH /api/categories/[id]` |
| Add team member | `POST /api/org/teams/[id]/members` |
| Invite user | `POST /api/org/users` |
| Generate quarters | `POST /api/org/quarters` |
| Save OPSP data | `PUT /api/opsp` |
| Submit review | `POST /api/performance/reviews` |
| Save goals | `POST /api/performance/goals` |
| Save 1-on-1 | `POST /api/performance/one-on-one` |
| Give feedback | `POST /api/performance/feedback` |
| Update settings | `PATCH /api/settings/profile` / `PATCH /api/settings/company` |

## 2.3 Background calls that EVERY page fires
- `GET /api/feature-flags/me` — **module-cached** after first fetch, so subsequent components don't re-fetch ✓
- `GET /api/apps/switcher` — header component re-fetches on every mount. **Duplicate risk**: on soft navigation, header re-mounts → re-fetch
- `GET /api/broadcasts/active?app=quikscale` — polled every 5 min
- Impersonation banner: `GET /api/auth/session` polled every 60s ⚠️ **Audit finding**: could be replaced with NextAuth's session update hook for free

---

# §3. Admin — Tenant admin

## 3.1 Admin page → API mapping
| Page | API calls on mount | Count |
|---|---|---|
| `/dashboard` | `GET /api/dashboard/stats` + `GET /api/feature-flags/me` + `GET /api/apps/switcher` | 3 |
| `/dashboard/members` | `GET /api/members?page=1` + `GET /api/roles` | 2 |
| `/dashboard/members/[id]` | `GET /api/members/[id]` + `GET /api/members/[id]/permissions` | 2 |
| `/dashboard/teams` | `GET /api/teams` | 1 |
| `/dashboard/teams/[id]` | `GET /api/teams/[id]` + `GET /api/teams/[id]/members` | 2 |
| `/dashboard/apps` | `GET /api/apps` + `GET /api/apps/access` | 2 |
| `/dashboard/roles` | `GET /api/roles` | 1 |
| `/dashboard/settings` | `GET /api/settings` | 1 |

## 3.2 Admin mutations
- `POST /api/members` — invite user
- `PATCH /api/members/[id]` — update role/status
- `POST /api/members/[id]/resend-invite` — resend
- `PATCH /api/members/[id]/permissions` — scoped perms
- `POST /api/teams` — create team
- `PATCH /api/teams/[id]` — update team
- `POST /api/teams/[id]/members` — add team member
- `POST /api/apps/access` — grant app to users
- `PATCH /api/settings` — org settings

---

# §4. Duplicate-call analysis — where we waste API calls

## 4.1 Confirmed waste (fixed in this commit)

### ✅ Analytics page — overview + alerts called twice in dev
**Before**: React 18 StrictMode double-invocation fired both API calls twice on mount
**After**: `useOnceEffect` ref guard → exactly 1 call each
**Impact**: production was already 1 call (StrictMode is dev-only) but dev network tab was confusing

### ✅ Tenant detail — 4 panels each firing twice in dev
**Before**: HealthPanel + AppAccessPanel + BillingPanel + AnalyticsPanel each had `useEffect(load, [])` → 4×2 = 8 calls in dev
**After**: all 4 switched to `useOnceEffect` → exactly 4 calls
**Impact**: same as above — dev-only visible improvement, but confusing before the fix

## 4.2 Remaining waste (not yet fixed)

### 🟠 D-1. Tenant detail page fires 6 separate HTTP requests on mount
Single trip to `/organizations/[id]` hits:
1. `/api/super/orgs/[id]`
2. `/api/super/tenant-health/[tenantId]`
3. `/api/super/tenant-app-access/[tenantId]`
4. `/api/super/invoices/[tenantId]`
5. `/api/super/analytics/tenant/[tenantId]`
6. `/api/super/apps` (for the impersonate dropdown)

**Recommendation**: consolidate into one `GET /api/super/tenants/[id]/full` that does all 6 queries server-side (via `Promise.all` we already do internally). Saves 5 HTTP roundtrips × ~100ms/trip = ~500ms on a cold nav. Effort: 1h.

### 🟠 D-2. Platform users page fires 2 calls even when no tenant filter is used
`GET /api/super/orgs?limit=1000` is always fetched just to populate the TenantPicker, even if the user never touches the picker.
**Recommendation**: lazy-fetch on picker open. Saves 1 call per page visit.

### 🟠 D-3. Every QuikScale dashboard page re-fetches `/api/apps/switcher`
Header component re-mounts on every soft navigation because it's not hoisted to layout.
**Recommendation**: hoist AppSwitcher fetch to the dashboard layout and use React Query to cache across navs. Saves ~1 call per navigation × many navs.

### 🟡 D-4. `/api/feature-flags/me` called on every app's dashboard
Each app (quikscale, admin) fetches its own. Fine — they're different URLs. But the result is **stable for 5-10 minutes** of a session; we don't cache beyond the current component tree.
**Recommendation**: add 5-min Redis cache server-side keyed by `(tenantId, appSlug)`. Saves ~5 DB queries per user-session-minute.

### 🟡 D-5. `ImpersonationBanner` polls `/api/auth/session` every 60s
Every open tab fires 60 req/hr against NextAuth just to check `impersonating` flag.
**Recommendation**: use NextAuth's `useSession({ required: false })` hook and let NextAuth's built-in polling handle it (default is no polling — session only updates on focus/login). Saves ~3600 req/user/day per tab.

### 🟡 D-6. KPI detail sub-components each fire their own API
`/kpi` page loads KPIs in one call, but the log-icon on each row (when hovered) fires `GET /api/kpi/[id]/logs` independently. If a user hovers 20 rows, 20 HTTP calls.
**Recommendation**: lazy-fetch with 5-sec hover debounce. Already mostly correct — verify debounce is in place.

### 🟢 D-7. `/api/org/users` + `/api/org/teams` fetched on many pages
These are reference data — they rarely change. Currently cached client-side module-scope in some places, but not all.
**Recommendation**: React Query with a 5-min `staleTime`. Cross-page cache. Saves ~5-10 req per session navigation.

### 🟢 D-8. Mutation responses could short-circuit next read
When a user creates a KPI via POST, the response includes the new KPI. But many components re-fetch the list right after (to "show it").
**Recommendation**: optimistic update or merge response into client cache. Saves 1 round-trip per mutation.

## 4.3 No waste found (good patterns in place)
- `GET /api/feature-flags/me` — module-level cache across components ✓
- Raw `POST /api/kpi/[id]/weekly` mutations go through one shared handler, not per-cell requests ✓
- Heath check endpoint (`/api/health`) is public and cacheable — no waste ✓

---

# §5. Server-side call patterns (N+1 risks)

## 🟠 S-1. `GET /api/super/analytics/overview` runs 11 parallel queries
All in one `Promise.all` — OK, but:
- None are cached
- Dashboard refresh every 30s if user leaves tab open = ~22 queries/minute
**Recommendation** (from AUDIT §5): 60s Redis cache on the entire response payload.

## 🟠 S-2. `GET /api/super/tenant-health/[tenantId]` runs 10 parallel queries
Same pattern.
**Recommendation**: 60s Redis cache per tenant.

## 🟡 S-3. `GET /api/super/orgs/[id]` uses `include: { users: { include: { user: ... } } }`
Nested include fires 1 query with JOINs — good.
But the subsequent `/api/super/tenant-health/[tenantId]` refetches some of the same data (member count).
**Recommendation**: if we do D-1 (consolidated `/tenants/[id]/full`), we de-duplicate internally.

## 🟢 S-4. `getDisabledModules` + `isTenantAppBlocked` use `React.cache`
Within a single render, called once per (tenantId, appSlug) regardless of how many components request. ✓

---

# §6. Latency profile (estimates)

| Operation | P50 local | Expected P50 prod | Notes |
|---|---|---|---|
| `/api/feature-flags/me` | 15ms | 30ms | Single Prisma query, cached |
| `/api/kpi` (tenant with 50 KPIs) | 40ms | 80ms | Include weekly values |
| `/api/super/analytics/overview` | 200-400ms | 500-1500ms | 11 queries, no cache |
| `/api/super/tenant-health/[tenantId]` | 150-300ms | 400-1200ms | 10 queries |
| `/api/auth/impersonate/[token]` | 50ms | 100ms | 3 queries + JWT encode |
| Cron rollup (100k rows) | 5-10s | 10-30s | Fine for hourly |

**Cold-start penalty on Vercel serverless**: first request after idle adds ~500-800ms for Prisma connection. Mitigated by Neon pooler.

---

# §7. Top 10 actions to reduce API calls (prioritized)

1. 🟠 Consolidate tenant detail 6→1 route (D-1) — saves 5 round-trips per tenant visit
2. 🟠 60s Redis cache on analytics overview (S-1) — saves 11 queries on every refresh
3. 🟠 60s Redis cache on tenant-health (S-2) — saves 10 queries
4. 🟠 Hoist AppSwitcher to layout + React Query (D-3) — saves 1 call per navigation
5. 🟡 React Query across super-admin pages — gives us stale-while-revalidate for free
6. 🟡 Switch ImpersonationBanner to NextAuth hook (D-5) — saves 60/hr/tab
7. 🟡 Lazy-load tenant list on /platform-users (D-2)
8. 🟡 5-min Redis cache on feature-flags/me (D-4) — saves DB load
9. 🟢 KPI log hover debounce (D-6) if not already
10. 🟢 Optimistic updates on mutation (D-8)

Total estimated saving in prod: ~30-40% fewer API calls from a typical super-admin session + ~500ms faster tenant-detail page.

---

*End of inventory.*
