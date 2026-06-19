# QuikScale — API Contract

**Auto-generated**: 2026-04-29
**Total endpoints**: 143 method-rows across 18 modules.
**Source**: extracted from `apps/quikscale/app/api/**/route.ts` files.

> ⚠ This file is hand-regenerated. To rebuild, run `python3 /tmp/extract_api_contract.py | python3 /tmp/build_api_doc.py`. Routes change frequently — treat this as a snapshot, not a contract. For machine-consumable contracts, the long-term move is OpenAPI generation from the Zod schemas already present in each route file.

## Conventions

- **Route**: Next.js App Router path. `:foo` = dynamic segment (`[foo]`), `*foo` = catch-all (`[...foo]`).
- **Method**: HTTP verb exported by the route file. A single file may export multiple verbs.
- **Module**: First path segment under `/api/` — coarse domain grouping.
- **Description**: First descriptive line of the route's leading JSDoc block. Edit the JSDoc in the route file to update the description here.
- Routes WITHOUT a JSDoc block show `(no description)`. These are candidates for inline doc cleanup.

## Module summary

| Module | Endpoints |
|---|---:|
| [client-meetings](#module-client-meetings) | 32 |
| [performance](#module-performance) | 25 |
| [org](#module-org) | 20 |
| [kpi](#module-kpi) | 13 |
| [opsp](#module-opsp) | 11 |
| [priority](#module-priority) | 9 |
| [settings](#module-settings) | 8 |
| [www](#module-www) | 7 |
| [categories](#module-categories) | 4 |
| [auth](#module-auth) | 3 |
| [apps](#module-apps) | 2 |
| [health](#module-health) | 2 |
| [teams](#module-teams) | 2 |
| [dashboard](#module-dashboard) | 1 |
| [feature-flags](#module-feature-flags) | 1 |
| [metrics](#module-metrics) | 1 |
| [session](#module-session) | 1 |
| [users](#module-users) | 1 |
| **Total** | **143** |

## HTTP method distribution

| Method | Count |
|---|---:|
| `GET` | 66 |
| `POST` | 40 |
| `PUT` | 15 |
| `PATCH` | 5 |
| `DELETE` | 16 |
| `?` | 1 |

---

## Module `apps` <a id="module-apps"></a>

_2 endpoints_

| Route | Method | Description |
|---|---|---|
| `/api/apps` | `GET` | Returns apps the current user has access to for the given tenant. |
| `/api/apps/switcher` | `GET` | Returns the list of apps the current user has access to. |

## Module `auth` <a id="module-auth"></a>

_3 endpoints_

| Route | Method | Description |
|---|---|---|
| `/api/auth/*nextauth` | `?` | (no description) |
| `/api/auth/impersonate/:token` | `GET` | SA-D.3 — Impersonation accept endpoint (QuikScale side). |
| `/api/auth/impersonate/exit` | `POST` | SA-D.5 — Exit impersonation. |

## Module `categories` <a id="module-categories"></a>

_4 endpoints_

| Route | Method | Description |
|---|---|---|
| `/api/categories` | `GET` | GET /api/categories — list all categories for tenant |
| `/api/categories` | `POST` | GET /api/categories — list all categories for tenant |
| `/api/categories/:id` | `PUT` | PUT /api/categories/\[id\] — update a category |
| `/api/categories/:id` | `DELETE` | PUT /api/categories/\[id\] — update a category |

## Module `client-meetings` <a id="module-client-meetings"></a>

_32 endpoints_

| Route | Method | Description |
|---|---|---|
| `/api/client-meetings/clients` | `GET` | ?includeDeleted=true → return ONLY soft-deleted rows (trash view). |
| `/api/client-meetings/clients` | `POST` | ?includeDeleted=true → return ONLY soft-deleted rows (trash view). |
| `/api/client-meetings/clients/:id` | `GET` | (no description) |
| `/api/client-meetings/clients/:id` | `PUT` | (no description) |
| `/api/client-meetings/clients/:id` | `DELETE` | (no description) |
| `/api/client-meetings/clients/:id/logs` | `GET` | (no description) |
| `/api/client-meetings/clients/:id/restore` | `POST` | (no description) |
| `/api/client-meetings/daily-huddles` | `GET` | ?clientId=…&from=YYYY-MM-DD&to=YYYY-MM-DD&includeDeleted=true Returns rows with creator/updater name + initials + absence-member |
| `/api/client-meetings/daily-huddles` | `POST` | ?clientId=…&from=YYYY-MM-DD&to=YYYY-MM-DD&includeDeleted=true Returns rows with creator/updater name + initials + absence-member |
| `/api/client-meetings/daily-huddles/:id` | `GET` | PUT — full update. Absence sets (both kinds) and notes fields replace atomically. |
| `/api/client-meetings/daily-huddles/:id` | `PUT` | PUT — full update. Absence sets (both kinds) and notes fields replace atomically. |
| `/api/client-meetings/daily-huddles/:id` | `DELETE` | PUT — full update. Absence sets (both kinds) and notes fields replace atomically. |
| `/api/client-meetings/daily-huddles/:id/logs` | `GET` | (no description) |
| `/api/client-meetings/daily-huddles/:id/restore` | `POST` | (no description) |
| `/api/client-meetings/dashboard` | `GET` | ?clientId=...&mode=daily\|weekly&monthsBack=6 (optional) &punchInUserId=... → returns per-member weekly punch-in rows |
| `/api/client-meetings/export/daily` | `POST` | Body: { clientId, monthsBack? } Returns: xlsx blob with 6 metric rows × N month columns + Total Avg. |
| `/api/client-meetings/export/punch` | `POST` | Body: { clientId, year, month } — single-month member punch-in report. |
| `/api/client-meetings/export/weekly` | `POST` | Body: { clientId, monthsBack? } Returns: xlsx blob with 9 metric rows (spec §7.10) × months + Total Avg. |
| `/api/client-meetings/members` | `GET` | ?includeDeleted=true → return ONLY soft-deleted rows (trash view) |
| `/api/client-meetings/members` | `POST` | ?includeDeleted=true → return ONLY soft-deleted rows (trash view) |
| `/api/client-meetings/members/:id` | `GET` | (no description) |
| `/api/client-meetings/members/:id` | `PUT` | (no description) |
| `/api/client-meetings/members/:id` | `DELETE` | (no description) |
| `/api/client-meetings/members/:id/logs` | `GET` | Read-only history of CREATE/UPDATE/DELETE audit events for one member. |
| `/api/client-meetings/members/:id/restore` | `POST` | (no description) |
| `/api/client-meetings/weekly-meetings` | `GET` | Ordered newest first; soft-deleted hidden. |
| `/api/client-meetings/weekly-meetings` | `POST` | Ordered newest first; soft-deleted hidden. |
| `/api/client-meetings/weekly-meetings/:id` | `GET` | PUT — replaces absence + dashboardNA links atomically. |
| `/api/client-meetings/weekly-meetings/:id` | `PUT` | PUT — replaces absence + dashboardNA links atomically. |
| `/api/client-meetings/weekly-meetings/:id` | `DELETE` | PUT — replaces absence + dashboardNA links atomically. |
| `/api/client-meetings/weekly-meetings/:id/logs` | `GET` | (no description) |
| `/api/client-meetings/weekly-meetings/:id/scores/:userId` | `PATCH` | Upserts one member's scores. Used by the per-row "Update" button in the Update tab (image 1). |

## Module `dashboard` <a id="module-dashboard"></a>

_1 endpoints_

| Route | Method | Description |
|---|---|---|
| `/api/dashboard/summary` | `GET` | Shared selects — keep payload small by only returning what the dashboard actually renders. |

## Module `feature-flags` <a id="module-feature-flags"></a>

_1 endpoints_

| Route | Method | Description |
|---|---|---|
| `/api/feature-flags/me` | `GET` | Returns the set of disabled moduleKeys for the current user's tenant on THIS app (hard-coded to "quikscale"). Used by the sidebar to filter the |

## Module `health` <a id="module-health"></a>

_2 endpoints_

| Route | Method | Description |
|---|---|---|
| `/api/health` | `GET` | Returns 200 if the process is running. No auth, no DB check. |
| `/api/health/ready` | `GET` | Checks that both critical dependencies are reachable: 1. PostgreSQL (via Prisma `$queryRaw`) |

## Module `kpi` <a id="module-kpi"></a>

_13 endpoints_

| Route | Method | Description |
|---|---|---|
| `/api/kpi` | `GET` | GET /api/kpi - List KPIs with filters and pagination |
| `/api/kpi` | `POST` | GET /api/kpi - List KPIs with filters and pagination |
| `/api/kpi/:id` | `GET` | (no description) |
| `/api/kpi/:id` | `PUT` | (no description) |
| `/api/kpi/:id` | `DELETE` | (no description) |
| `/api/kpi/:id/logs` | `GET` | GET /api/kpi/\[id\]/logs - Get audit logs for a KPI |
| `/api/kpi/:id/notes` | `GET` | (no description) |
| `/api/kpi/:id/notes` | `POST` | (no description) |
| `/api/kpi/:id/restore` | `POST` | POST /api/kpi/\[id\]/restore — unset deletedAt, bring row back into active set. |
| `/api/kpi/:id/weekly` | `GET` | For individual KPIs: returns each weekly row as-is (one per week, already aggregated). |
| `/api/kpi/:id/weekly` | `POST` | For individual KPIs: returns each weekly row as-is (one per week, already aggregated). |
| `/api/kpi/bulk-restore` | `POST` | POST /api/kpi/bulk-restore body: { ids: string\[\] } |
| `/api/kpi/years` | `GET` | (no description) |

## Module `metrics` <a id="module-metrics"></a>

_1 endpoints_

| Route | Method | Description |
|---|---|---|
| `/api/metrics` | `GET` | Requires METRICS_TOKEN env var in production. Prometheus scraper must pass `Authorization: Bearer <token>` header. |

## Module `opsp` <a id="module-opsp"></a>

_11 endpoints_

| Route | Method | Description |
|---|---|---|
| `/api/opsp` | `GET` | Fetch fiscalYearStart from tenant |
| `/api/opsp` | `POST` | Fetch fiscalYearStart from tenant |
| `/api/opsp` | `PUT` | Fetch fiscalYearStart from tenant |
| `/api/opsp/config` | `GET` | Returns the OPSP plan configuration for the current user: - startYear: year of the earliest OPSPData record |
| `/api/opsp/deadline` | `GET` | Returns auto-finalize deadline info for the current user's OPSP. |
| `/api/opsp/history` | `GET` | Returns all OPSP records for the logged-in user's tenant for the given fiscal year, plus available fiscal years and tenant fiscal config. |
| `/api/opsp/review` | `GET` | Server-side mirror of the client `resolveProjected` logic. OPSP stores currency targets as "10 K" / "1.5 L" / etc. — naked parseFloat would drop |
| `/api/opsp/review` | `POST` | Server-side mirror of the client `resolveProjected` logic. OPSP stores currency targets as "10 K" / "1.5 L" / etc. — naked parseFloat would drop |
| `/api/opsp/review/logs` | `GET` | Returns audit log entries for a specific OPSP review row. |
| `/api/opsp/review/secondary` | `POST` | Saves status + comment for a secondary review row (rocks / key initiatives / key thrusts). |
| `/api/opsp/review/submit` | `POST` | Marks an OPSP as fully reviewed for a fiscal period. Two effects: 1. Locks the review surface for that period. |

## Module `org` <a id="module-org"></a>

_20 endpoints_

| Route | Method | Description |
|---|---|---|
| `/api/org/fiscal-years` | `GET` | Lightweight tenant-scoped endpoint used by the shared FiscalPeriodPicker. |
| `/api/org/info` | `GET` | Returns the current tenant's basic info (id, name, slug). |
| `/api/org/invitations` | `POST` | Accept or decline a pending invitation. |
| `/api/org/memberships` | `GET` | Wraps the shared factory from @quikit/auth. QuikScale-specific scoping: - filter to tenants where the user has UserAppAccess for "quikscale" |
| `/api/org/quarters` | `GET` | (no description) |
| `/api/org/quarters` | `POST` | (no description) |
| `/api/org/quarters` | `DELETE` | (no description) |
| `/api/org/quarters/:id` | `PUT` | PUT /api/org/quarters/\[id\] — only Q1 start date can be changed, recalculates all quarters |
| `/api/org/quarters/:id` | `DELETE` | PUT /api/org/quarters/\[id\] — only Q1 start date can be changed, recalculates all quarters |
| `/api/org/select` | `POST` | Wraps the shared factory from @quikit/auth. QuikScale scoping requires UserAppAccess for "quikscale" in the chosen tenant. |
| `/api/org/teams` | `GET` | GET /api/org/teams — all teams with member count and head info |
| `/api/org/teams` | `POST` | GET /api/org/teams — all teams with member count and head info |
| `/api/org/teams/:id` | `PUT` | PUT /api/org/teams/\[id\] — update team |
| `/api/org/teams/:id` | `DELETE` | PUT /api/org/teams/\[id\] — update team |
| `/api/org/teams/:id/members` | `POST` | Adds one or more users as members of the given team. For each user we: 1. Verify they have an active Membership in the tenant. |
| `/api/org/teams/:id/members/:userId` | `DELETE` | Removes a user from a team. Inverse of POST /members: - If Membership.teamId currently points to this team, clear it to null |
| `/api/org/users` | `GET` | (no description) |
| `/api/org/users` | `POST` | (no description) |
| `/api/org/users/:id` | `PUT` | PUT /api/org/users/\[id\] |
| `/api/org/users/:id` | `DELETE` | PUT /api/org/users/\[id\] |

## Module `performance` <a id="module-performance"></a>

_25 endpoints_

| Route | Method | Description |
|---|---|---|
| `/api/performance/cycle` | `GET` | Cycle Hub data endpoint — computes the current phase of the quarterly performance cycle from existing data (QuarterSetting + PerformanceReview |
| `/api/performance/feedback` | `GET` | Visibility rules: - `private` feedback is only visible to the sender and receiver |
| `/api/performance/feedback` | `POST` | Visibility rules: - `private` feedback is only visible to the sender and receiver |
| `/api/performance/feedback/:id` | `DELETE` | Only the original SENDER can delete their own feedback entry. This protects receivers from having feedback deleted out from under them |
| `/api/performance/goals` | `GET` | Filters: ownerId / quarter / year / status / parentGoalId |
| `/api/performance/goals` | `POST` | Filters: ownerId / quarter / year / status / parentGoalId |
| `/api/performance/goals/:id` | `GET` | (no description) |
| `/api/performance/goals/:id` | `PUT` | (no description) |
| `/api/performance/goals/:id` | `DELETE` | (no description) |
| `/api/performance/individual` | `GET` | Only load meetings whose attendees include the paginated user set — |
| `/api/performance/individual/:userId` | `GET` | Legacy team-meeting attendance removed in Client Meetings rewrite. |
| `/api/performance/one-on-one` | `GET` | Lists 1:1s visible to the current user: - if no filters → returns sessions where user is EITHER manager OR report |
| `/api/performance/one-on-one` | `POST` | Lists 1:1s visible to the current user: - if no filters → returns sessions where user is EITHER manager OR report |
| `/api/performance/one-on-one/:id` | `GET` | Visible to both manager and report |
| `/api/performance/one-on-one/:id` | `PUT` | Visible to both manager and report |
| `/api/performance/one-on-one/:id` | `DELETE` | Visible to both manager and report |
| `/api/performance/reviews` | `GET` | (no description) |
| `/api/performance/reviews` | `POST` | (no description) |
| `/api/performance/reviews/:reviewId` | `GET` | Tenant-scoped lookup: never cross-tenant |
| `/api/performance/reviews/:reviewId` | `PUT` | Tenant-scoped lookup: never cross-tenant |
| `/api/performance/scorecard` | `GET` | Legacy team-meeting attendance was part of this scorecard. The new |
| `/api/performance/talent` | `GET` | Fetch paginated members with performance data |
| `/api/performance/talent` | `POST` | Fetch paginated members with performance data |
| `/api/performance/teams` | `GET` | Legacy team-meeting attendance removed in Client Meetings rewrite. |
| `/api/performance/trends` | `GET` | (no description) |

## Module `priority` <a id="module-priority"></a>

_9 endpoints_

| Route | Method | Description |
|---|---|---|
| `/api/priority` | `GET` | (no description) |
| `/api/priority` | `POST` | (no description) |
| `/api/priority/:id` | `GET` | (no description) |
| `/api/priority/:id` | `PUT` | (no description) |
| `/api/priority/:id` | `DELETE` | (no description) |
| `/api/priority/:id/logs` | `GET` | GET /api/priority/\[id\]/logs — change history for a Priority (read-only) |
| `/api/priority/:id/restore` | `POST` | (no description) |
| `/api/priority/:id/weekly` | `POST` | POST /api/priority/\[id\]/weekly — upsert a weekly status |
| `/api/priority/bulk-restore` | `POST` | (no description) |

## Module `session` <a id="module-session"></a>

_1 endpoints_

| Route | Method | Description |
|---|---|---|
| `/api/session/validate` | `GET` | Checks if the current user still has: 1. An active membership for the selected tenant |

## Module `settings` <a id="module-settings"></a>

_8 endpoints_

| Route | Method | Description |
|---|---|---|
| `/api/settings/company` | `GET` | (no description) |
| `/api/settings/company` | `PATCH` | (no description) |
| `/api/settings/configurations` | `GET` | (no description) |
| `/api/settings/configurations` | `PATCH` | (no description) |
| `/api/settings/profile` | `GET` | (no description) |
| `/api/settings/profile` | `PATCH` | (no description) |
| `/api/settings/table-preferences` | `GET` | (no description) |
| `/api/settings/table-preferences` | `PATCH` | (no description) |

## Module `teams` <a id="module-teams"></a>

_2 endpoints_

| Route | Method | Description |
|---|---|---|
| `/api/teams` | `GET` | (no description) |
| `/api/teams` | `POST` | (no description) |

## Module `users` <a id="module-users"></a>

_1 endpoints_

| Route | Method | Description |
|---|---|---|
| `/api/users` | `GET` | (no description) |

## Module `www` <a id="module-www"></a>

_7 endpoints_

| Route | Method | Description |
|---|---|---|
| `/api/www` | `GET` | GET /api/www — list all WWWItems for tenant |
| `/api/www` | `POST` | GET /api/www — list all WWWItems for tenant |
| `/api/www/:id` | `PUT` | Permission: creator, assignee, admin-level role, or super-admin only |
| `/api/www/:id` | `DELETE` | Permission: creator, assignee, admin-level role, or super-admin only |
| `/api/www/:id/logs` | `GET` | GET /api/www/\[id\]/logs — change history for a WWW item (read-only) |
| `/api/www/:id/restore` | `POST` | (no description) |
| `/api/www/bulk-restore` | `POST` | (no description) |

---

## Coverage gaps

Routes returning `(no description)` lack a JSDoc block. Best-effort fix: add a `/** ... */` comment at the top of each `route.ts` summarizing the endpoint's purpose. Run the regen step above to refresh this document.

**50 method-rows currently have no description.**

| Route | Method |
|---|---|
| `/api/auth/*nextauth` | `?` |
| `/api/client-meetings/clients/:id` | `GET` |
| `/api/client-meetings/clients/:id` | `PUT` |
| `/api/client-meetings/clients/:id` | `DELETE` |
| `/api/client-meetings/clients/:id/logs` | `GET` |
| `/api/client-meetings/clients/:id/restore` | `POST` |
| `/api/client-meetings/daily-huddles/:id/logs` | `GET` |
| `/api/client-meetings/daily-huddles/:id/restore` | `POST` |
| `/api/client-meetings/members/:id` | `GET` |
| `/api/client-meetings/members/:id` | `PUT` |
| `/api/client-meetings/members/:id` | `DELETE` |
| `/api/client-meetings/members/:id/restore` | `POST` |
| `/api/client-meetings/weekly-meetings/:id/logs` | `GET` |
| `/api/kpi/:id` | `GET` |
| `/api/kpi/:id` | `PUT` |
| `/api/kpi/:id` | `DELETE` |
| `/api/kpi/:id/notes` | `GET` |
| `/api/kpi/:id/notes` | `POST` |
| `/api/kpi/years` | `GET` |
| `/api/org/quarters` | `GET` |
| `/api/org/quarters` | `POST` |
| `/api/org/quarters` | `DELETE` |
| `/api/org/users` | `GET` |
| `/api/org/users` | `POST` |
| `/api/performance/goals/:id` | `GET` |
| `/api/performance/goals/:id` | `PUT` |
| `/api/performance/goals/:id` | `DELETE` |
| `/api/performance/reviews` | `GET` |
| `/api/performance/reviews` | `POST` |
| `/api/performance/trends` | `GET` |
| _... 20 more_ | |

