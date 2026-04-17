# QuikIT Platform — Test Case Catalog

**Date**: 2026-04-18
**Purpose**: comprehensive list of test SCENARIOS (not implemented code) across all apps. Use this as the shopping list when you sit down to write tests, so you don't have to think about coverage gaps from scratch.

Format per test: **ID** — intent — setup — expected behavior — severity.

**Severity**: ⚡ critical (write first), 🔵 important, ⚪ nice-to-have.

---

# §1. Authentication + Authorization

## T-A-001 ⚡ Unauthenticated user hits protected API
- **Setup**: no session cookie
- **Scenarios**: GET/POST to every wrapped route
- **Expected**: 401 + `{success: false, error: "Unauthorized"}`
- **Apps**: all 3

## T-A-002 ⚡ User with no active membership hits tenant API
- **Setup**: valid session but no `Membership` for target tenant
- **Expected**: 403 + "No active membership"
- **Apps**: quikscale, admin

## T-A-003 ⚡ Cross-tenant data access attempt
- **Setup**: user A has tenant X session. Tenant Y has KPI with id=abc.
- **Request**: `GET /api/kpi/abc`
- **Expected**: 404 (not 403 — don't leak existence)
- **Apps**: quikscale, admin

## T-A-004 ⚡ Role downgrade mid-session doesn't elevate access
- **Setup**: user was admin, now member. JWT still says admin (not yet refreshed).
- **Request**: admin-only endpoint
- **Expected**: 403 after DB check (membership re-validation)

## T-A-005 ⚡ Super admin status check is DB-sourced, not just JWT
- **Setup**: user had `isSuperAdmin: true`, demoted to false. JWT cache hasn't refreshed.
- **Request**: super admin endpoint
- **Expected**: 403 (already implemented in `requireSuperAdmin` fallback path)

## T-A-006 🔵 Session with `tenantId: null` attempting tenant operations
- **Setup**: session lacks tenantId
- **Expected**: 400 "No organisation selected"

## T-A-007 🔵 Middleware auth check on protected routes
- **Setup**: unauthenticated user visits /dashboard
- **Expected**: redirect to /login
- **Apps**: all

## T-A-008 ⚡ OAuth callback with invalid state
- **Expected**: NextAuth rejects with OAUTH_CALLBACK_ERROR

## T-A-009 ⚡ OAuth client secret rotation invalidates old tokens
- **Expected**: already-issued access_tokens still work until expiry; refresh fails

---

# §2. FF-1 Feature Flags

## T-FF-001 ⚡ Parent disabled → all children hidden
- **Setup**: `AppModuleFlag { moduleKey: "kpi", enabled: false }` for tenant X
- **Scenarios**: user visits `/kpi`, `/kpi/teams`
- **Expected**: both redirect to `/dashboard?feature_disabled=kpi` or `kpi.teams`

## T-FF-002 ⚡ Child disabled, parent enabled → only child hidden
- **Setup**: `kpi.teams` disabled, `kpi` enabled
- **Expected**: `/kpi` OK, `/kpi/teams` redirects

## T-FF-003 ⚡ Gated API returns 404 (not 403) when module disabled
- **Scenarios**: any `gateModuleApi` protected route

## T-FF-004 🔵 Sidebar filters disabled modules client-side
- **Setup**: `kpi.teams` disabled
- **Expected**: "Teams KPI" nav item not rendered
- **Type**: DOM component test

## T-FF-005 🔵 FeatureDisabledToast appears on `?feature_disabled=kpi`
- **Setup**: URL has query param
- **Expected**: amber toast shown with human-readable label, auto-dismiss after 6s

## T-FF-006 ⚡ Re-enabling a module clears sparse row
- **Setup**: module disabled row exists
- **Request**: POST toggle with `enabled: true`
- **Expected**: DB row deleted (sparse storage)

## T-FF-007 🔵 `useDisabledModules` hook caches across components
- **Setup**: 3 components on same page call the hook
- **Expected**: 1 HTTP request total

---

# §3. Super Admin — Tenant App Access (SA-A.6 hard gate)

## T-SAA-001 ⚡ Blocked tenant cannot hit any app route
- **Setup**: `TenantAppAccess { tenantId: X, appId: quikscale, enabled: false }`
- **Scenarios**: user from X opens /kpi
- **Expected**: redirect to `<launcher>/apps?blocked=quikscale`

## T-SAA-002 ⚡ Blocked API returns 403 "App access blocked for this tenant"
- **Request**: any protected API on blocked app
- **Expected**: 403

## T-SAA-003 🔵 Hard gate evaluated BEFORE module flags
- **Setup**: tenant blocked AND module disabled
- **Expected**: 403 (not 404) — tenant gate wins

## T-SAA-004 🔵 Re-enabling deletes sparse row
- **Setup**: blocked row exists; POST with `enabled: true`
- **Expected**: row deleted

## T-SAA-005 🔵 Blocking with reason persists reason to audit log
- **Request**: POST with `reason: "trial expired"`
- **Expected**: AuditLog entry has reason; tenant detail UI shows it

---

# §4. Impersonation (SA-D)

## T-IMP-001 ⚡ Super admin cannot impersonate another super admin
- **Request**: POST start with targetUserId = another super admin
- **Expected**: 403 "Cannot impersonate another super admin"
- **Test both**: start endpoint AND accept endpoint

## T-IMP-002 ⚡ Token is single-use
- **Setup**: accept endpoint called twice with same token
- **Expected**: first succeeds (session cookie set); second returns 410 Gone "Token already used"

## T-IMP-003 ⚡ Token expires after 2 hours
- **Setup**: create token, advance clock 2h+1min, hit accept
- **Expected**: 410 "Token expired"

## T-IMP-004 ⚡ Rate limit: 11th impersonation in 1h returns 429
- **Setup**: super admin creates 10 impersonations
- **Request**: 11th POST /start
- **Expected**: 429 with `retry-after` header

## T-IMP-005 ⚡ Impersonation session carries impersonating flag
- **Setup**: accept endpoint called with valid token
- **Request**: subsequent `/api/auth/session`
- **Expected**: `user.impersonating === true`, `user.impersonatorUserId`, `user.impersonationExpiresAt` populated

## T-IMP-006 ⚡ Session hard-expires at impersonationExpiresAt
- **Setup**: clock advanced past expiry
- **Request**: any authenticated API
- **Expected**: session callback returns empty user → effectively 401

## T-IMP-007 🔵 ImpersonationBanner shows countdown
- **DOM test**: banner visible when session.impersonating = true; not visible when false

## T-IMP-008 🔵 Exit endpoint clears all possible cookie names
- **Expected**: `next-auth.session-token` + `__Secure-next-auth.session-token` both cleared

## T-IMP-009 ⚡ Super admin demotion revokes pending tokens
- **Setup**: SA has pending unaccepted impersonation. PATCH /users/[saId] { isSuperAdmin: false }
- **Expected**: Impersonation.expiresAt updated to now for pending tokens (tech-debt #20 fix)

## T-IMP-010 🔵 Accept endpoint with invalid appSlug rejects
- **Setup**: token for quikscale presented at admin's accept endpoint
- **Expected**: "Token is not for this app"

## T-IMP-011 🔵 SessionEvent row created on impersonation_start
- **Setup**: accept endpoint succeeds
- **Expected**: SessionEvent(event="impersonation_start") exists

## T-IMP-012 🔵 SessionEvent + Impersonation.exitedAt on exit
- **Expected**: both written; best-effort (logged on failure)

---

# §5. Alerts Engine (SA-C.3)

## T-ALT-001 ⚡ `app_down` rule fires when probe status=down
- **Setup**: AppHealthCheck(appId=X, status="down") in last 15min
- **Request**: cron /evaluate-alerts
- **Expected**: PlatformAlert(rule="app_down", subjectKey=X) exists

## T-ALT-002 ⚡ Alert auto-resolves when condition clears
- **Setup**: open alert exists; next probe status="up"
- **Expected**: alert.resolvedAt = now

## T-ALT-003 ⚡ Email sent on first fire (non-info)
- **Setup**: new alert, severity=critical
- **Expected**: sendPlatformAlertEmail called with super admin recipients

## T-ALT-004 🔵 Email NOT sent on alert refresh (same condition still active)
- **Setup**: existing alert, second cron run with same condition
- **Expected**: lastSeenAt updated, no email

## T-ALT-005 🔵 Email sent on severity escalation (warning → critical)
- **Setup**: warning alert exists; next run rule fires with critical
- **Expected**: email

## T-ALT-006 🔵 "All clear" email on resolution of critical/warning
- **Setup**: critical alert exists; condition clears
- **Expected**: email with subject "Resolved: <title>"

## T-ALT-007 🔵 Info-level alerts never email
- **Setup**: tenant_inactive creates info-level alert
- **Expected**: no email on any lifecycle event

## T-ALT-008 ⚡ Concurrent cron invocations don't create duplicate alerts
- **Setup**: two cron requests race
- **Expected**: idempotent — one alert row per (rule, subjectKey)

## T-ALT-009 🔵 Ack endpoint sets acknowledgedAt + acknowledgedBy
- **Request**: POST /api/super/alerts/[id]/acknowledge
- **Expected**: fields populated; alert still visible in list

---

# §6. Plans + Invoices (SA-B.2/3)

## T-PLAN-001 🔵 Plan slug is immutable
- **Setup**: existing plan
- **Request**: PATCH with new slug
- **Expected**: 400 "Plan slug cannot be changed"

## T-PLAN-002 ⚡ Cannot delete plan with assigned tenants
- **Setup**: plan has 3 tenants on it
- **Request**: DELETE
- **Expected**: 409 "Reassign before deleting"

## T-PLAN-003 🔵 Invalid slug format rejected
- **Request**: POST with slug="Bad Slug!"
- **Expected**: 400 "slug must be 2-40 chars, [a-z0-9_-]"

## T-PLAN-004 ⚡ Mark-paid endpoint sets paidAt + status
- **Request**: POST /pay with outcome="paid"
- **Expected**: invoice.status="paid", paidAt=now, failedAt=null

## T-PLAN-005 ⚡ Mark-failed endpoint sets failedAt
- **Request**: POST /pay with outcome="failed"
- **Expected**: invoice.status="failed", failedAt=now

## T-PLAN-006 🔵 Dummy monthly cron is idempotent
- **Setup**: cron runs twice in same month
- **Expected**: one invoice per tenant, not two

## T-PLAN-007 🔵 Cron skips tenants whose plan slug isn't in Plan table
- **Setup**: tenant has plan="enterprise-custom" but no row
- **Expected**: skipped, reported in response

## T-PLAN-008 ⚡ Invoice totals reflect status breakdown
- **Setup**: 3 paid, 2 failed, 1 pending invoices
- **Request**: GET /api/super/invoices/[tenantId]
- **Expected**: totals.paid, totals.failed, totals.pending sum correctly

---

# §7. Broadcasts (SA-B.6)

## T-BC-001 ⚡ Active broadcasts respect time window
- **Setup**: broadcast with startsAt=yesterday, endsAt=tomorrow
- **Expected**: visible

## T-BC-002 ⚡ Future broadcasts hidden
- **Setup**: startsAt in future
- **Expected**: not visible

## T-BC-003 ⚡ Expired broadcasts hidden
- **Setup**: endsAt in past
- **Expected**: not visible

## T-BC-004 ⚡ Tenant-targeted broadcast invisible to other tenants
- **Setup**: broadcast with targetTenantIds=[A]; user from tenant B
- **Expected**: not visible

## T-BC-005 ⚡ App-targeted broadcast invisible to wrong app
- **Setup**: targetAppSlugs=["admin"]; user on quikscale
- **Expected**: not visible

## T-BC-006 🔵 Dismiss hides broadcast for that user only
- **Setup**: user A dismisses; user B still sees it

## T-BC-007 🔵 Double-dismiss is idempotent (upsert)
- **Expected**: no unique-constraint error

## T-BC-008 🔵 Delete broadcast cascades dismissals
- **Expected**: BroadcastDismissal rows deleted via `onDelete: Cascade`

---

# §8. KPI (QuikScale flagship)

## T-KPI-001 ⚡ Tenant isolation on list
- **Setup**: tenant A has 3 KPIs, tenant B has 2
- **Request**: user from A calls `GET /api/kpi`
- **Expected**: 3 rows returned

## T-KPI-002 ⚡ Weekly value upsert triggers progress recompute
- **Setup**: KPI exists with progressPercent=0; POST weekly value
- **Expected**: KPI.progressPercent updated atomically

## T-KPI-003 ⚡ Owner contributions sum to 100%
- **Request**: POST /api/kpi with owners [{id: X, pct: 60}, {id: Y, pct: 30}]
- **Expected**: 400 "contributions must sum to 100 (±0.5)"

## T-KPI-004 ⚡ Cannot duplicate owners
- **Request**: owners [{id: X, pct: 50}, {id: X, pct: 50}]
- **Expected**: 400

## T-KPI-005 ⚡ Negative target value rejected
- **Expected**: 400

## T-KPI-006 🔵 Target=0 with value>0 (reverse color)
- **Setup**: reverseColor KPI with target=0
- **Input**: weekly value = 5
- **Expected**: color=RED (recently fixed)

## T-KPI-007 🔵 Unentered cell (reverse color) renders NEUTRAL
- **Expected**: color.bg="", no BLUE on empty (recently fixed regression)

## T-KPI-008 🔵 Current quarter vs historical filter
- **Request**: GET /api/kpi?year=2026&quarter=Q1
- **Expected**: only Q1 2026 KPIs

---

# §9. API Logging (SA-A.2)

## T-LOG-001 ⚡ Every wrapped route writes an ApiCall row
- **Setup**: any withTenantAuth route
- **Expected**: ApiCall row with matching path, method, status, duration, userId, tenantId

## T-LOG-002 ⚡ Logging failures never break the request
- **Setup**: mock db.apiCall.create to throw
- **Expected**: original response returned normally

## T-LOG-003 🔵 Path normalization works
- **Request**: /api/kpi/ckabc12345def6789ghi01jkl
- **Expected**: pathPattern = "/api/kpi/[id]"

## T-LOG-004 🔵 UUID paths normalized too
- **Request**: /api/teams/550e8400-e29b-41d4-a716-446655440000
- **Expected**: pathPattern = "/api/teams/[id]"

## T-LOG-005 🔵 User-agent truncated at 500 chars
- **Expected**: longer UA stored at 500-char limit

---

# §10. Cron Endpoints

## T-CRON-001 ⚡ All crons reject without CRON_SECRET
- **Request**: GET without auth header
- **Expected**: 401

## T-CRON-002 ⚡ CRON_SECRET not configured returns 500
- **Setup**: env lacks CRON_SECRET
- **Expected**: 500 "CRON_SECRET not configured" (fail-closed)

## T-CRON-003 🔵 cleanup-api-calls respects 30-day cutoff
- **Setup**: ApiCall rows with createdAt 31 days ago and 29 days ago
- **Expected**: only 31-day-old rows deleted

## T-CRON-004 🔵 rollup-api-calls is idempotent
- **Setup**: cron runs twice over same window
- **Expected**: ApiCallHourlyRollup counts match expected from raw data, not doubled

## T-CRON-005 🔵 rollup handles null-tenantId rows via _global_ sentinel
- **Setup**: ApiCall rows with tenantId=null
- **Expected**: rolled up under tenantId="_global_"

## T-CRON-006 🔵 health-check writes AppHealthCheck on 200
- **Setup**: mock fetch returns 200
- **Expected**: AppHealthCheck(status="up")

## T-CRON-007 🔵 health-check handles timeout
- **Setup**: app doesn't respond in 8s
- **Expected**: AppHealthCheck(status="down", error="AbortError")

---

# §11. UI Components (DOM tests)

## T-UI-001 🔵 ToggleSwitch keyboard accessible
- **Setup**: focus toggle, press Space
- **Expected**: onChange fires

## T-UI-002 🔵 TenantPicker search filter
- **Input**: type "acm" in search
- **Expected**: only tenants with "acm" in name/slug visible

## T-UI-003 🔵 TenantPicker ArrowDown + Enter selects
- **Expected**: onChange fires with first tenant's id

## T-UI-004 🔵 ImpersonationBanner hidden when not impersonating
- **Setup**: session.user.impersonating = false
- **Expected**: component returns null

## T-UI-005 🔵 ImpersonationBanner visible + shows countdown
- **Setup**: impersonating=true, expiresAt=now+30min
- **Expected**: "30m left" visible

## T-UI-006 🔵 BroadcastBanner dismisses correctly
- **Setup**: /api/broadcasts/active returns 1 item
- **Click**: X button
- **Expected**: banner disappears + POST to /dismiss fires

## T-UI-007 🔵 ModuleTree cascade badge
- **Setup**: parent disabled, child enabled=true
- **Expected**: child row shows "Hidden: parent disabled"

## T-UI-008 🔵 Plans table tenantCount guards delete
- **Setup**: plan with tenantCount > 0
- **Click**: delete icon
- **Expected**: button disabled, tooltip or alert on click

---

# §12. E2E (Playwright) — currently missing for quikit

## T-E2E-001 ⚡ Super admin login round-trip
- **Setup**: seed super admin creds
- **Steps**: visit /login → fill email + password → submit → land on /analytics

## T-E2E-002 ⚡ Impersonation round-trip
- **Steps**: login as super admin → /organizations → pick tenant → pick user → click "View as" → new tab opens quikscale dashboard → banner visible → click "Exit" → returns to launcher

## T-E2E-003 ⚡ Full flag toggle flow
- **Steps**: go to /feature-flags/quikscale → pick tenant → toggle "Teams KPI" off → visit quikscale as that tenant → confirm nav item missing + direct URL redirects

## T-E2E-004 🔵 Broadcast visible to tenant
- **Steps**: create broadcast targeting all tenants → visit quikscale → amber banner appears → dismiss → reload → gone

## T-E2E-005 🔵 Block app access shuts out a tenant
- **Steps**: block quikscale for tenant → that tenant logs in → launcher shows blocked state → direct URL redirects

## T-E2E-006 🔵 Invoice mark-paid updates analytics narrative
- **Steps**: generate invoice → mark paid → refresh /analytics → revenue narrative updated

---

# §13. Performance / Load

## T-PERF-001 ⚪ Analytics dashboard P95 under 1s
- **Load**: 50 concurrent super admin hits
- **Measure**: P95 latency
- **Threshold**: < 1000ms (ideal < 400ms with cache)

## T-PERF-002 ⚪ KPI list endpoint scales
- **Setup**: tenant with 10k KPIs
- **Measure**: P95 of GET /api/kpi
- **Threshold**: < 300ms (pagination enforced at 50)

## T-PERF-003 ⚪ ApiCall table write latency
- **Measure**: overhead added by logApiCall per request
- **Threshold**: < 5ms async (fire-and-forget — should not block)

## T-PERF-004 ⚪ Rollup cron runs within window
- **Setup**: 100k ApiCall rows in 24h
- **Expected**: rollup completes in < 30s

---

# §14. Security (targeted)

## T-SEC-001 ⚡ SQL injection — any text field
- **Input**: `'; DROP TABLE "User";--` in name/description fields
- **Expected**: stored as literal text, no DB damage (Prisma query builder handles parameterization)

## T-SEC-002 ⚡ XSS in broadcast title/body
- **Input**: `<script>alert(1)</script>`
- **Expected**: React auto-escapes; HTML not executed when rendered
- **Exception**: email HTML — verify `esc()` helper is used

## T-SEC-003 ⚡ CSRF via session fixation
- **Setup**: attacker tries to trick user into POSTing to /api/super/impersonate/start from evil.com
- **Expected**: SameSite=Lax blocks the cookie on cross-site request → 401

## T-SEC-004 ⚡ Open redirect on impersonation `landing` param
- **Input**: `?landing=https://evil.com`
- **Expected**: code only honors paths starting with `/`. Anything else → default `/dashboard`

## T-SEC-005 ⚡ JWT tampering detection
- **Input**: modified impersonation claim in JWT
- **Expected**: invalid signature → session rejected

## T-SEC-006 🔵 Rate limiter bypass via IP spoofing
- **Input**: spoofed X-Forwarded-For
- **Status**: limiter keys by userId not IP for super admin, so this specific attack fails. Document the design choice.

---

# §15. Compliance tests (for when GDPR/SOC2 arrives)

## T-COMP-001 (future) User data export includes all owned rows
- **Setup**: user has 50 KPIs + 20 priorities + sessions + memberships
- **Request**: GET /api/user/export
- **Expected**: JSON blob containing all; no other users' data

## T-COMP-002 (future) Account deletion soft-deletes then hard-deletes after 30d
- **Setup**: user deletes account
- **Expected**: immediate soft-delete (status=deleted, tokens revoked). Background job hard-deletes after 30d.

## T-COMP-003 (future) Audit log retains 7 years
- **Policy**: AuditLog must not be deleted by cleanup cron
- **Expected**: cleanup-api-calls doesn't touch AuditLog (verified)

---

# §16. Rollout of testing — suggested order

When you get budget to add tests:

1. **Week 1 — Smoke tests** (T-A-001, T-A-003, T-E2E-001): don't ship a feature without these
2. **Week 2 — Impersonation + Alerts engine**: highest-leverage, most security-sensitive (T-IMP-* + T-ALT-*)
3. **Week 3 — Plans/Invoices/Broadcasts**: the un-tested phase-B APIs
4. **Week 4 — E2E harness for quikit**: the round-trips, not the units

Suggested **coverage targets**:
- Permission helpers: **≥95%** (already close in quikscale)
- API routes: **≥70%**
- UI components: **≥60%**
- E2E happy paths: **all critical user journeys**

---

*End of test catalog.*
