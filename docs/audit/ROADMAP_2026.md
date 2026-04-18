# QuikIT Platform — Forward Roadmap

**Date**: 2026-04-18
**Horizon**: 3 / 6 / 12 months
**Nature**: Information + suggestions. Nothing below has been committed. Prioritize against your own business signal.

---

## Guiding principle (don't skip)

Most of these suggestions are **wrong for you if you don't have customer pull for them**. The goal of this doc is to give you a menu to pick from when a customer asks for X — so you can cite existing thinking instead of starting from scratch. **Do not just build down the list.**

---

# 🏁 Q2 — next 3 months (April-June 2026)

Theme: **make what we have actually usable in production**.

## R2-1. Finish push-ready state [🔴 must-do]
- Deploy-blockers already identified: Neon migrate, CRON_SECRET, vercel.json (written), Plan seeds (migration ready).
- Verify impersonation flow end-to-end in uat with real OAuth.
- Wire a Sentry DSN for quikit so first-push errors are caught.

## R2-2. Sell the first customer [🔴 must-do]
- Product-wise this is not a roadmap item but a **filter** on everything else:
- Until the first paying customer, any feature built is speculation. Let customer #1 drive priorities.
- Concrete output: a signed design partner (even at $0) who uses QuikScale weekly and provides feedback.

## R2-3. Wrap existing routes in instrumentation [🟠 high ROI]
- 36 admin + super-admin routes don't log to `ApiCall`.
- Mechanical PR. ~4-6 hours.
- Result: analytics dashboard tells the truth.

## R2-4. Replace self-hosted health check with UptimeRobot [🟠 low effort]
- Free tier: 50 monitors, 5-min cadence, webhook on failure.
- Delete the health-check cron; write webhook handler that maps UR events → AppHealthCheck rows.
- Bonus: gives you a public status page.

## R2-5. Real Stripe integration [🟡 customer-dependent]
- Currently: dummy "Mark paid / Mark failed" buttons.
- Stripe Checkout + webhook handler for `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`.
- Do this **only when customer #1 needs to pay**. Until then, dummy buttons work for demos.
- Scope: 1 engineer-week.

## R2-6. Customer-facing status page [🟢 optional]
- Free Better Uptime status page, pinned to `status.quikit.app`.
- Auto-populates from UptimeRobot.
- Signals professionalism without much work.

## R2-7. Playwright harness for quikit + impersonation E2E [🟠 high ROI]
- Copy config from quikscale.
- Critical E2E: login → impersonate → banner → exit round-trip.
- See `TEST_CASES.md` §12.

## R2-8. Finish the docs pass [🟡 light but useful]
- Update `PLATFORM_MIND_MAP.md` on every major landing (already set up).
- Add `/docs/OPERATIONS.md` — runbook for common incidents (tenant blocked, payment failed, app-down alert, etc.). See R3-5.

---

# 🧭 Q3 — 3-6 months (July-September 2026)

Theme: **harden the platform + enterprise readiness basics**.

## R3-1. SSO for enterprise tenants
- **Why**: first enterprise prospect will ask. SAML 2.0 via `@boxyhq/saml-jackson` (open source, self-host).
- **Scope**: `EnterpriseSSO` model, per-tenant IdP config, tenant-scoped OAuth flow override.
- **Effort**: 2-3 weeks.

## R3-2. Audit log export + search
- **Why**: compliance + debugging at scale.
- **Scope**:
  - Full-text search on `oldValues` / `newValues` (Postgres `tsvector` or simple ILIKE with GIN index)
  - CSV + JSON export for a date range
  - Retention policy: auto-delete entries > 7 years
- **Effort**: 1 week.

## R3-3. Impersonation security upgrades
- IP allowlist (env var)
- WebAuthn step-up for high-risk impersonations (e.g. into enterprise tenants)
- Hash impersonation tokens at rest
- **Effort**: 1 week.

## R3-4. Data export + deletion API (GDPR baseline)
- `/api/user/export` — JSON of all user-owned rows
- `/api/user/delete` — soft-delete, 30-day hard-delete cron
- **Effort**: 1-2 weeks including auditing every model for user references.

## R3-5. Operational runbook
- What to do when: tenant can't log in / invoices are failing / app-down alert / data corruption suspected
- Include: who to page, what queries to run, how to rollback a migration
- Store in `/docs/OPERATIONS.md`. Test once with a drill.

## R3-6. Analytics: cohort view
- Current dashboard: aggregates.
- New: "customers acquired in March: how many still active in April, May, June?"
- Data's already there via SessionEvent. 1-2 days of viz work.

## R3-7. Developer API keys + Webhooks
- **Why**: the first customer who wants Zapier / Make / custom integration.
- **Scope**:
  - `ApiKey` model scoped to tenant, with rate limits
  - Key auth middleware (bearer token, not session)
  - Webhook subscription (tenantAdmin subscribes to "kpi.created" event, gets POSTed)
- **Effort**: 2 weeks.

---

# 🚀 Q4+ — 6-12 months (October 2026 →)

Theme: **scale signals + differentiation**.

## R4-1. Multi-region Postgres read replicas
- Only if latency becomes a complaint.
- Neon supports read replicas; wire `read: readReplicaUrl` in Prisma.

## R4-2. Embedded analytics for end users
- Not super admin. Tenant admins seeing their own org's KPI dashboards.
- QuikScale already has this. Expand to shareable permalinks + embeddable iframes (with signed tokens).

## R4-3. ML-powered KPI forecasting
- For each KPI, show "projected end-of-quarter based on current velocity".
- Simple linear regression or ARIMA. Runs server-side nightly.
- Bonus: alert when projection falls below target.

## R4-4. Workspace / folder concept
- Currently everything is flat-per-tenant. Large orgs want "North America KPIs" vs "Europe KPIs" namespacing without separate tenants.
- Add `Workspace` model; scope KPIs/Priorities to workspaces.

## R4-5. Self-service tenant signup + onboarding
- Currently super admin creates every tenant. Not scalable.
- Signup flow → email verification → trial plan → onboarding wizard.
- Tied to Stripe for trial→paid conversion.

## R4-6. Native iOS / Android apps
- React Native on shared API.
- **Only build if** mobile DAU/WAU is the actual blocker. Most B2B SaaS gets away with responsive web.

## R4-7. Compliance certifications (if enterprise demands)
- SOC 2 Type II: ~6-9 months + ~$30-50k auditor
- ISO 27001: similar
- HIPAA: only with BAAs + strict data segmentation
- Don't pursue speculatively. One enterprise customer willing to sign a $100k+ contract triggers this, not ambition.

---

# 🔬 Experiments (short, small, learn fast)

Not major features — quick bets to test ideas.

## E-1. A/B test: warm gradient theme vs. cool light theme
- Enterprise customers may prefer cooler palette. Quick toggle in ThemeApplier. Track which tenants switch back.

## E-2. Onboarding checklist on first super-admin login
- "1. Create a plan ✓ / 2. Invite your first team ✗ / 3. Set up KPIs ✗"
- Ship in a week. Measure whether new super admins complete more setup steps.

## E-3. Daily "platform digest" email to super admins
- MRR, new tenants, alerts resolved, top 3 engaged tenants.
- Costs nothing to build, kills the "need to check dashboard" instinct.

## E-4. "Offer help" nudge when a tenant's health score < 50
- Auto-drafted support email the super admin reviews and sends.
- Leading indicator of a save-able churn event.

## E-5. Public changelog + "What's new" modal
- First-class marketing channel at zero cost. Use existing broadcast table; just scope broadcasts to "public=true".

---

# ⚠️ Anti-roadmap (things NOT to do)

Documented so future-you remembers why these aren't prioritized.

## AR-1. Don't rebuild super admin with Radix/ShadCN right now
- The L1 refresh gave us 80% of enterprise polish. Going full ShadCN is 3 weeks of rewrite for marginal gain.

## AR-2. Don't add a "design system playground" site
- Nobody in the team is going to maintain it. The code IS the design system.

## AR-3. Don't build workflow automation builder (Zapier-in-the-app)
- You'll spend 3 months and customers still use Zapier because that's where their other integrations live.

## AR-4. Don't chase feature parity with competitors
- We've discussed this pattern in earlier brainstorm sessions. The right move is to be **different** (OKR with built-in quarter-aware analytics + feature flags + impersonation = unique combo), not to match what Lattice / 15Five have already shipped.

## AR-5. Don't invest in real-time collaboration (WebSockets / CRDTs)
- Cost: very high (custom sync engine). Value: marginal for B2B OKR tool where people edit at different times anyway.

---

# 📋 Decision framework for new requests

When a customer asks for feature X:

1. **Is it customer-requested or speculation?** No pull = no build.
2. **Is it on this roadmap already?** If yes, bump priority. If no, add it with a date.
3. **What's the smallest version that tests the idea?** E.g. "webhooks" could start as "1 event type, no UI, just API".
4. **Does it compound?** Some features unlock 3 future things. Prefer those.
5. **What's the carrying cost?** Every feature has ongoing maintenance — factor 15-20% of build effort per year for maintenance.

---

# 🎯 Top 5 bets I'd make if I were you

If you could only do 5 things this year:

1. **Get customer #1 paying** (R2-2, R2-5 Stripe when they're ready)
2. **UptimeRobot + Sentry** (R2-4 + sentry across all apps) — professional ops with ~1h work
3. **SSO** (R3-1) — unlocks the enterprise segment
4. **Webhooks + API keys** (R3-7) — makes the platform integratable
5. **Self-service signup** (R4-5) — scales without you in the loop

Everything else is optional.

---

*End of roadmap.*
