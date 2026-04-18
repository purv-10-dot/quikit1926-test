# API Inventory & Smoke-Test Scope

Generated: 2026-04-18 · Branch: `feature/p1-cache-and-indexes`

Complete route inventory for the QuikIT monorepo: 136 route files across 3 Next.js apps.

- quikscale: 69 files
- quikit (launcher + super admin): 47 files
- admin: 20 files

Auth levels:
- **public** — unauthenticated or only checks header token
- **tenant** — `withTenantAuth` / `getServerSession` inside a tenant scope
- **admin** — `withAdminAuth` (tenant admin role)
- **super-admin** — `withSuperAdminAuth`
- **cron** — `requireCronOrSuperAdmin` (dual auth: CRON_SECRET header OR super-admin session)

---

## quikscale — port 3004 (69 routes)

### health / metrics / sentry (public)

| Route | Methods | Auth | Purpose |
|---|---|---|---|
| `/api/health` | GET | public | Liveness probe (process up) |
| `/api/health/ready` | GET | public | Readiness — checks PG + Redis |
| `/api/metrics` | GET | public (token) | Prometheus scrape (METRICS_TOKEN) |
| `/api/sentry-test` | GET | public | Throws to verify Sentry wiring |

### auth / session

| Route | Methods | Auth | Purpose |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | public | NextAuth handler |
| `/api/auth/impersonate/[token]` | GET | public (signed) | Super-admin impersonation entry |
| `/api/auth/impersonate/exit` | POST | tenant | Exit impersonation |
| `/api/session/validate` | GET | tenant | Revalidates session + rate-limited |

### apps / org / feature-flags

| Route | Methods | Auth | Purpose |
|---|---|---|---|
| `/api/apps` | GET | tenant | User's enabled apps |
| `/api/apps/switcher` | GET | tenant | App switcher menu data |
| `/api/feature-flags/me` | GET | tenant | Flags for current user |
| `/api/org/invitations` | POST | tenant | Accept invite |
| `/api/org/memberships` | GET | public | Memberships for session user |
| `/api/org/select` | POST | public | Switch active tenant |
| `/api/org/quarters` | GET/POST | tenant | Fiscal quarter settings |
| `/api/org/quarters/[id]` | PUT/DELETE | tenant | Update/delete quarter |
| `/api/org/teams` | GET/POST | tenant | List/create teams |
| `/api/org/teams/[id]` | PUT/DELETE | tenant | Update/delete team |
| `/api/org/teams/[id]/members` | POST | tenant | Add team member |
| `/api/org/teams/[id]/members/[userId]` | DELETE | tenant | Remove team member |
| `/api/org/users` | GET/POST | tenant | List/invite org users |
| `/api/org/users/[id]` | PUT/DELETE | tenant | Update/remove user |
| `/api/users` | GET | tenant | Tenant user picker |
| `/api/teams` | GET/POST | tenant | Legacy team listing |

### kpi

| Route | Methods | Auth | Purpose |
|---|---|---|---|
| `/api/kpi` | GET/POST | tenant | List / create KPI |
| `/api/kpi/[id]` | GET/PUT/DELETE | tenant | KPI detail CRUD |
| `/api/kpi/[id]/logs` | GET | tenant | Change log |
| `/api/kpi/[id]/notes` | GET/POST | tenant | Weekly notes |
| `/api/kpi/[id]/weekly` | GET/POST | tenant | Weekly values |
| `/api/kpi/years` | GET | tenant | Available years picker |

### priority / www / categories

| Route | Methods | Auth | Purpose |
|---|---|---|---|
| `/api/priority` | GET/POST | tenant | List / create priority |
| `/api/priority/[id]` | GET/PUT/DELETE | tenant | Priority CRUD |
| `/api/priority/[id]/weekly` | POST | tenant | Weekly update |
| `/api/www` | GET/POST | tenant | Who-What-When items |
| `/api/www/[id]` | PUT/DELETE | tenant | WWW CRUD |
| `/api/categories` | GET/POST | tenant | Category CRUD |
| `/api/categories/[id]` | PUT/DELETE | tenant | Category CRUD |

### opsp

| Route | Methods | Auth | Purpose |
|---|---|---|---|
| `/api/opsp` | GET/PUT/POST | tenant | Load / save / finalize OPSP |
| `/api/opsp/config` | GET | tenant | OPSP config |
| `/api/opsp/deadline` | GET | tenant | Deadline info |
| `/api/opsp/history` | GET | tenant | OPSP version history |
| `/api/opsp/review` | GET/POST | tenant | Primary review |
| `/api/opsp/review/logs` | GET | tenant | Review audit log |
| `/api/opsp/review/secondary` | POST | tenant | Secondary review |

### meetings / daily-huddle

| Route | Methods | Auth | Purpose |
|---|---|---|---|
| `/api/meetings` | GET/POST | tenant | List / create meeting |
| `/api/meetings/[id]` | GET/PUT/DELETE | tenant | Meeting CRUD |
| `/api/meetings/templates` | GET/POST | tenant | Template CRUD |
| `/api/meetings/templates/[id]` | GET/PUT/DELETE | tenant | Template CRUD |
| `/api/daily-huddle` | GET/POST | tenant | Daily-huddle items |
| `/api/daily-huddle/[id]` | PUT/DELETE | tenant | Huddle item CRUD |

### performance

| Route | Methods | Auth | Purpose |
|---|---|---|---|
| `/api/performance/cycle` | GET | tenant | Cycle Hub (phase inference) |
| `/api/performance/feedback` | GET/POST | tenant | Peer feedback |
| `/api/performance/feedback/[id]` | DELETE | tenant | Remove feedback |
| `/api/performance/goals` | GET/POST | tenant | Goals |
| `/api/performance/goals/[id]` | GET/PUT/DELETE | tenant | Goal CRUD |
| `/api/performance/individual` | GET | tenant | Scoreboard for self |
| `/api/performance/individual/[userId]` | GET | tenant | Scoreboard for user |
| `/api/performance/one-on-one` | GET/POST | tenant | 1:1 list / create |
| `/api/performance/one-on-one/[id]` | GET/PUT/DELETE | tenant | 1:1 CRUD |
| `/api/performance/reviews` | GET/POST | tenant | Review list / create |
| `/api/performance/reviews/[reviewId]` | GET/PUT | tenant | Review detail |
| `/api/performance/scorecard` | GET | tenant | Tenant scorecard |
| `/api/performance/talent` | GET/POST | tenant | Talent calibration |
| `/api/performance/teams` | GET | tenant | Teams with perf stats |
| `/api/performance/trends` | GET | tenant | Trend charts |

### settings

| Route | Methods | Auth | Purpose |
|---|---|---|---|
| `/api/settings/company` | GET/PATCH | tenant | Theme / accent for user |
| `/api/settings/configurations` | GET/PATCH | tenant | Misc tenant config |
| `/api/settings/profile` | GET/PATCH | tenant | Own profile |
| `/api/settings/table-preferences` | GET/PATCH | tenant | Table column prefs |

---

## quikit — port 3000 (47 routes)

### health / diag / sentry (public)

| Route | Methods | Auth | Purpose |
|---|---|---|---|
| `/api/sentry-test` | GET | public | Sentry test |

### auth / oauth / org

| Route | Methods | Auth | Purpose |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | public | NextAuth |
| `/api/oauth/authorize` | GET | public | OIDC authorization endpoint |
| `/api/oauth/diag` | GET | public | OIDC diagnostics |
| `/api/oauth/jwks` | GET | public | JWKS for id_token verify |
| `/api/oauth/token` | POST | public | OIDC token exchange |
| `/api/oauth/userinfo` | GET | tenant | OIDC userinfo |
| `/api/org/memberships` | GET | public | Current user's memberships |
| `/api/org/select` | POST | public | Pick tenant |

### apps

| Route | Methods | Auth | Purpose |
|---|---|---|---|
| `/api/apps/enable` | POST | tenant | Enable app for user |
| `/api/apps/launcher` | GET | tenant | Launcher cards |

### broadcasts

| Route | Methods | Auth | Purpose |
|---|---|---|---|
| `/api/broadcasts/active` | GET | tenant | Active banners for user |
| `/api/broadcasts/[id]/dismiss` | POST | tenant | Dismiss banner |

### super/orgs, users, plans, apps, broadcasts (super-admin)

| Route | Methods | Auth | Purpose |
|---|---|---|---|
| `/api/super/orgs` | GET/POST | super-admin | List / create tenants |
| `/api/super/orgs/[id]` | GET/PATCH/DELETE | super-admin | Tenant CRUD |
| `/api/super/orgs/[id]/members` | POST | super-admin | Add member to tenant |
| `/api/super/orgs/bulk` | POST | super-admin | Bulk tenant ops |
| `/api/super/users` | GET/POST | super-admin | Global user admin |
| `/api/super/users/[id]` | GET/PATCH | super-admin | Global user CRUD |
| `/api/super/users/bulk` | POST | super-admin | Bulk user ops |
| `/api/super/plans` | GET/POST | super-admin | Plan CRUD |
| `/api/super/plans/[id]` | GET/PATCH/DELETE | super-admin | Plan CRUD |
| `/api/super/apps` | GET/POST | super-admin | App registry |
| `/api/super/apps/[id]` | GET/PATCH/DELETE | super-admin | App CRUD |
| `/api/super/apps/[id]/oauth` | POST/PATCH/DELETE | super-admin | App OAuth creds |
| `/api/super/apps/bulk` | POST | super-admin | Bulk app ops |
| `/api/super/broadcasts` | GET/POST | super-admin | Broadcast mgmt |
| `/api/super/broadcasts/[id]` | GET/PATCH/DELETE | super-admin | Broadcast CRUD |
| `/api/super/feature-flags/[appSlug]` | GET | super-admin | Flags per app |
| `/api/super/feature-flags/[appSlug]/toggle` | POST | super-admin | Toggle flag |
| `/api/super/impersonate/start` | POST | super-admin | Start impersonation |
| `/api/super/invoices/[tenantId]` | GET/POST | super-admin | Invoices for tenant |
| `/api/super/invoices/[tenantId]/[invoiceId]/pay` | POST | super-admin | Mark paid |
| `/api/super/tenant-app-access/[tenantId]` | GET/POST | super-admin | App access toggles |
| `/api/super/tenant-health/[tenantId]` | GET | super-admin | Health per tenant |
| `/api/super/tenants/[id]/full` | GET | super-admin | Full tenant snapshot |
| `/api/super/analytics/overview` | GET | super-admin | Global analytics |
| `/api/super/analytics/tenant/[tenantId]` | GET | super-admin | Per-tenant analytics |
| `/api/super/alerts` | GET | super-admin | Alerts list |
| `/api/super/alerts/[id]/acknowledge` | POST | super-admin | Ack alert |
| `/api/super/audit` | GET | super-admin | Audit log search |

### super/cron (dual-auth)

| Route | Methods | Auth | Purpose |
|---|---|---|---|
| `/api/super/cron/cleanup-api-calls` | GET | cron | Vacuum old call logs |
| `/api/super/cron/evaluate-alerts` | GET | cron | Run alert rules |
| `/api/super/cron/generate-invoices` | GET | cron | Monthly invoice run |
| `/api/super/cron/health-check` | GET | cron | Ping each app's /api/health |
| `/api/super/cron/last-run` | GET | super-admin | Last run for each cron |
| `/api/super/cron/rollup-api-calls` | GET | cron | Aggregate per-day counts |

---

## admin — port 3005 (20 routes)

### auth / session / feature-flags

| Route | Methods | Auth | Purpose |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | public | NextAuth |
| `/api/sentry-test` | GET | public | Sentry test |
| `/api/feature-flags/me` | GET | tenant | Flags for current user |
| `/api/session/validate` | GET | tenant | Session revalidation |

### org / invitations

| Route | Methods | Auth | Purpose |
|---|---|---|---|
| `/api/org/memberships` | GET | public | Memberships |
| `/api/org/select` | POST | public | Switch tenant |
| `/api/invitations/accept` | GET/POST | public | Accept invite token |

### dashboard / apps / settings

| Route | Methods | Auth | Purpose |
|---|---|---|---|
| `/api/dashboard/stats` | GET | admin | Overview counts |
| `/api/apps` | GET | admin | Apps + access counts |
| `/api/apps/switcher` | GET | tenant | App switcher |
| `/api/apps/access` | GET/POST/DELETE | admin | Per-user app access |
| `/api/settings` | GET/PATCH | admin | Tenant settings |

### members / roles / teams

| Route | Methods | Auth | Purpose |
|---|---|---|---|
| `/api/members` | GET/POST | admin | List / invite |
| `/api/members/[id]` | GET/PATCH/DELETE | admin | Member CRUD |
| `/api/members/[id]/permissions` | PATCH | admin | Edit permissions |
| `/api/members/[id]/resend-invite` | POST | admin | Resend invite |
| `/api/roles` | GET | admin | Role definitions |
| `/api/teams` | GET/POST | admin | Team CRUD |
| `/api/teams/[id]` | GET/PATCH/DELETE | admin | Team CRUD |
| `/api/teams/[id]/members` | POST/DELETE | admin | Team membership |

---

## Smoke-test scope

The harness (`scripts/smoke-test.mjs`) only hits **safe, idempotent GET** endpoints with a session cookie. Mutation routes (POST/PATCH/PUT/DELETE) are explicitly excluded.

**Excluded:**
- All `/api/super/cron/*` — dual-auth weirdness + side effects
- All POST/PATCH/DELETE — state mutations
- `/api/sentry-test` — intentionally throws
- `/api/auth/impersonate/*` — session mutation
- `/api/auth/[...nextauth]` catch-all — complex parameterization
- OAuth endpoints that require client credentials

**Covered per app:**
- quikscale: 26 endpoints across 9 modules
- quikit: 14 endpoints across 4 modules
- admin: 11 endpoints across 7 modules
