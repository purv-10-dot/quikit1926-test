# Next Items — Prioritized Worklist

**Date**: 2026-04-18 (post super-admin merge into main)
**Format**: each row is one independently-executable unit of work. Pick one at a time.

## Legend

- **Severity**: 🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low
- **Effort**: ⏱️ < 30 min / ⏱️⏱️ ~1h / ⏱️⏱️⏱️ half day / ⏱️⏱️⏱️⏱️ full day / ⏱️⏱️⏱️⏱️⏱️ multi-day
- **Category**: `Deploy` / `Instrument` / `Perf` / `UX` / `Security` / `Test` / `Docs`

---

## Master table (ordered by recommended execution order)

| # | Item | Cat | Sev | Effort | Reference | Blocking? |
|---|---|---|---|---|---|---|
| 1 | Neon `prisma migrate deploy` (4 pending migrations) | Deploy | 🔴 | ⏱️ | AUDIT §10 | Push to prod |
| 2 | Set `CRON_SECRET` env in Vercel | Deploy | 🔴 | ⏱️ | AUDIT §10 | Cron execution |
| 3 | Decide cron strategy (Pro schedules vs UptimeRobot webhooks vs GitHub Actions) | Deploy | 🔴 | ⏱️⏱️ | **USER PARKED** | Cron execution |
| 4 | Verify impersonation round-trip in uat with real OAuth | Deploy | 🟠 | ⏱️⏱️ | ROADMAP R2-1 | — |
| 5 | Add Sentry DSN for quikit (first-push errors) | Ops | 🟠 | ⏱️⏱️ | AUDIT §8 | — |
| 6 | **Wrapper migration** — 11 admin routes to `withAdminAuth` | Instrument | 🟠 | ⏱️⏱️⏱️ | AUDIT §3 A-1 | Analytics accuracy |
| 7 | **Wrapper migration** — 25 super-admin routes to `withSuperAdminAuth` | Instrument | 🟠 | ⏱️⏱️⏱️ | AUDIT §3 A-1 | Analytics accuracy |
| 8 | **ImpersonationBanner** polling → focus listener (saves 60 req/hr/tab) | Perf | 🟠 | ⏱️ | API_INVENTORY §4.2 D-5 | — |
| 9 | **Analytics overview** — 60s Redis cache | Perf | 🟠 | ⏱️⏱️ | AUDIT §3 A-5 | — |
| 10 | **Tenant-health** — 60s Redis cache | Perf | 🟠 | ⏱️⏱️ | AUDIT §3 A-6 | — |
| 11 | **Tenant detail consolidation** — 6 API calls → 1 `/api/super/tenants/[id]/full` | Perf | 🟠 | ⏱️⏱️ | API_INVENTORY §4.2 D-1 | — |
| 12 | Tests — Plans CRUD API (4 scenarios) | Test | 🟠 | ⏱️⏱️ | TEST_CASES §6 | — |
| 13 | Tests — Invoices + pay API (4 scenarios) | Test | 🟠 | ⏱️⏱️ | TEST_CASES §6 | — |
| 14 | Tests — Broadcasts CRUD API (4 scenarios) | Test | 🟠 | ⏱️⏱️ | TEST_CASES §7 | — |
| 15 | Tests — Tenant-app-access API (3 scenarios) | Test | 🟠 | ⏱️⏱️ | TEST_CASES §3 | — |
| 16 | Tests — Tenant-health + Analytics APIs (5 scenarios) | Test | 🟡 | ⏱️⏱️ | TEST_CASES | — |
| 17 | Tests — Alerts list + ack API (2 scenarios) | Test | 🟡 | ⏱️ | TEST_CASES §5 | — |
| 18 | Playwright harness for quikit + super-admin login E2E | Test | 🟡 | ⏱️⏱️⏱️⏱️ | TEST_CASES §12 | — |
| 19 | Playwright E2E — impersonation full round-trip | Test | 🟡 | ⏱️⏱️⏱️ | TEST_CASES §12 T-E2E-002 | Needs #18 |
| 20 | Playwright E2E — flag toggle + feature-disabled flow | Test | 🟡 | ⏱️⏱️⏱️ | TEST_CASES §12 T-E2E-003 | Needs #18 |
| 21 | **Security** — IP allowlist env for super-admin login | Security | 🟡 | ⏱️⏱️ | AUDIT §1 S-1 | — |
| 22 | **Security** — hash `Impersonation.token` at rest | Security | 🟡 | ⏱️⏱️ | AUDIT §1 S-3 | — |
| 23 | **Security** — scrub PII from `AuditLog.oldValues/newValues` | Security | 🟡 | ⏱️⏱️⏱️ | AUDIT §1 S-4 | — |
| 24 | **Security** — row-count cap on bulk endpoints (100 max) | Security | 🟡 | ⏱️ | AUDIT §1 S-5 | — |
| 25 | **Security** — rate-limit all super-admin mutations | Security | 🟡 | ⏱️⏱️ | AUDIT §1 S-8 | — |
| 26 | Lazy-load tenant list on `/platform-users` (saves 1 call) | Perf | 🟡 | ⏱️ | API_INVENTORY §4.2 D-2 | — |
| 27 | Hoist `AppSwitcher` fetch to layout + React Query cache | Perf | 🟡 | ⏱️⏱️ | API_INVENTORY §4.2 D-3 | — |
| 28 | Server-cache `/api/feature-flags/me` (5-min Redis) | Perf | 🟡 | ⏱️⏱️ | API_INVENTORY §4.2 D-4 | — |
| 29 | Add **loading skeletons** to super admin pages | UX | 🟡 | ⏱️⏱️⏱️ | AUDIT §4 UX-1 | — |
| 30 | Add **empty-state guidance** for first-use tenants | UX | 🟡 | ⏱️⏱️⏱️ | AUDIT §4 UX-2 | — |
| 31 | Impersonation expiry **escalation warning** (15m / 5m flash) | UX | 🟡 | ⏱️ | AUDIT §4 UX-3 | — |
| 32 | Replace all `window.confirm()` with `ConfirmModal` in `@quikit/ui` | UX | 🟡 | ⏱️⏱️ | AUDIT §4 UX-4 | — |
| 33 | Standardized `formatDate(d, style)` helper in `@quikit/shared` | UX | 🟡 | ⏱️ | AUDIT §4 UX-7 | — |
| 34 | Persist `/platform-users` tenant filter to URL query param | UX | 🟡 | ⏱️ | AUDIT §4 UX-8 | — |
| 35 | Consolidate severity colors across alerts + broadcasts | UX | 🟢 | ⏱️ | AUDIT §4 UX-10 | — |
| 36 | Mobile responsive audit — overflow tables + card mode | UX | 🟢 | ⏱️⏱️⏱️⏱️ | AUDIT §4 UX-6 | — |
| 37 | **Remove overkill**: dead `@quikit/shared/withApiLogging` (unused) | Cleanup | 🟢 | ⏱️ | AUDIT §6 item 1 | — |
| 38 | **Consider removing**: `BroadcastDismissal` table → localStorage | Cleanup | 🟢 | ⏱️⏱️ | AUDIT §6 item 3 | — |
| 39 | **Consider removing**: `ApiCallHourlyRollup` + cron (premature at <10 tenants) | Cleanup | 🟢 | ⏱️⏱️ | AUDIT §6 item 5 | — |
| 40 | ~~Pick one: `SlidePanel` vs `Modal` and retire the other~~ **DEPRIORITIZED (2026-04-18)** — brainstorm concluded they serve genuinely different JTBD. SlidePanel = list-context-preserving drawer; Modal = focused blocking overlay. No consolidation needed. Replace with governance doc (`docs/engineering/UI_OVERLAY_GUIDE.md`) if confusion arises. | Docs | 🟢 | ⏱️ | Brainstorm 2026-04-18 | — |
| 41 | Seed a design-partner customer (business task, not code) | Business | 🔴 | multi-week | ROADMAP R2-2 | Revenue |
| 42 | Real Stripe integration (when customer #1 needs to pay) | Business | 🟡 | ⏱️⏱️⏱️⏱️⏱️ | ROADMAP R2-5 | Customer pull |
| 43 | **Unified toast/notification system across all 3 apps** — currently error/success/save feedback is inconsistent (silent fails in some flows, `setError` text in others, `alert()` in a few legacy spots). Build a shared `ToastProvider` + `useToast()` in `@quikit/ui` (variants: success, error, info, warning), wire `ToastProvider` into each app's providers, then migrate every `setError`/`alert()`/silent-fail site to emit a toast. Also show toasts on save (auto-dismiss 3s) and error (manual-dismiss). Expected surfaces: form saves, mutation success/fail in super-admin lists, impersonation start/exit, feature-flag toggles, OPSP autosave status. | UX | 🟠 | ⏱️⏱️⏱️ | User request 2026-04-18 | — |

---

## Execution groups — pick a group, not an item

### Group A — "Ship it" (before next prod-facing user)
1, 2, 3, 4, 5 → ~half day once you have prod credentials

### Group B — "Analytics actually works" (high ROI)
6, 7, 9, 10 → ~full day. Unblocks accurate dashboards.

### Group C — "Session + API call reduction" (from earlier brainstorm)
8, 11, 26, 27, 28 → ~half day. Cumulative ~30% fewer API calls per session.

### Group D — "Test coverage catch-up"
12 through 17 → ~1-2 days. One PR per API group.

### Group E — "Before first enterprise deal"
21, 22, 23, 24, 25 → ~2 days total.

### Group F — "Before demo day"
29, 30, 31, 32 → ~1 day. Enterprise-grade feel.

### Group G — "Clean out the overkills" (when feeling stale)
37, 38, 39, 40 → ~1 day. Lean codebase.

---

## Suggested first move

**Group B is the single best starting point.** Reasons:
- Mechanical work (low cognitive load)
- Low regression risk (wrapper swap + cache adds)
- Unblocks meaningful analytics
- Paves the way for the test-coverage push (Group D)

If you want a 1-hour win instead: **#8 alone** — ImpersonationBanner polling fix. 15 min of code, saves 60 req/hr/tab forever.

---

## What's deliberately NOT on this list

Per the earlier audit:

- **Real-time collaboration / WebSockets / CRDTs** — not justified at current scale
- **Workflow automation (Zapier-in-app)** — customers use Zapier instead
- **Native iOS/Android apps** — responsive web is sufficient
- **Impersonation removal** — decided against (it's premature, not overkill; carrying cost is near-0)
- **Full ShadCN rewrite** — L1 refresh gave 80% of enterprise polish already
- **Compliance certifications (SOC 2 / ISO)** — trigger on enterprise customer, not ambition

---

## Reminders parked for later

- **Cron execution in free tools** — when you want to tackle it, simplest path:
  - UptimeRobot free tier: 50 monitors, 5-min min cadence, webhooks → maps 4 of 5 crons
  - GitHub Actions scheduled workflow (`on: schedule: - cron: ...`) → monthly invoice cron
  - Or: upgrade Vercel to Pro plan ($20/month) and use native `vercel.json` crons

---

## How to use this doc

Each time you have a work session:
1. Pick one row (or one group)
2. Tell me which
3. I execute, verify, commit, update this doc to strike it through

**Current session pointer**: nothing in progress. Your move.
