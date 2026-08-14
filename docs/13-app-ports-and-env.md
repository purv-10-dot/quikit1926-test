# App Ports & Environment Variables

A single reference for every app in the [QuikIT monorepo](../) — what port it runs on locally, and which environment variables it consumes.

> Source of truth: each app's [`package.json`](../apps/) (`dev` script) and `.env.local` / `.env.example`. If you change a port, update this file in the same PR.

---

## 1. App → Port Map (local dev)

> **Dev vs. start ports.** The table below is the **`next dev`** port (what you use locally). Some apps bind a *different* port under `npm start` (production `next start`): auth `3004`, admin `3005`, quikscale `3002`, quikvc `3008`. In production each app runs on its own Vercel domain, so the start port only matters for local `npm start` smoke tests. Always trust the `dev` script in each app's `package.json`.

| App | Dev port | `start` port | Source file | Role / one-liner |
|---|---|---|---|---|
| **quikit** | `3000` | `3000` | [apps/quikit/package.json](../apps/quikit/package.json) | Launcher + OAuth/OIDC IdP. Hosts `/api/oauth/{authorize,token,userinfo,jwks}`, `/.well-known/openid-configuration`, and the `/apps` launcher. Super-admin pages live here under `(super-admin)/`. |
| **auth** | `3001` | `3004` | [apps/auth/package.json](../apps/auth/package.json) | Central credentials login service. NextAuth + Google/Microsoft SSO. Hosts registration/OTP, password reset, `/api/post-login` handoff, `/api/verify-token`. Other apps redirect unauthenticated users here. |
| **admin** | `3002` | `3005` | [apps/admin/package.json](../apps/admin/package.json) | Org admin portal (members, teams, apps, roles, audit log, settings). |
| **quikscale** | `3003` | `3002` | [apps/quikscale/package.json](../apps/quikscale/package.json) | QuikScale — OKR / KPI / OPSP / Priority / WWW tooling. |
| **quiktrack** | `3004` | `3004` | [apps/quiktrack/package.json](../apps/quiktrack/package.json) | QuikTrack — project / task / docs tracker (Tiptap rich-text docs). |
| **quikinsight** | `3015` | `3015` | [apps/quikinsight/package.json](../apps/quikinsight/package.json) | QuikInsight — analytics and insights portal. |
| **quikvc** | `3005` | `3008` | [apps/quikvc/package.json](../apps/quikvc/package.json) | QuikVC — venture-capital deal flow (founder / investor / VC-admin portals). |
| **quikinfra** | `3006` | `3006` | [apps/quikinfra/package.json](../apps/quikinfra/package.json) | QuikInfra — construction ERP (BOQ, DPR/RAB, stock, procurement, finance). Own `Cn*` RBAC. |
| **quiksocial** | `3007` | `3007` | [apps/quiksocial/package.json](../apps/quiksocial/package.json) | QuikSocial — AI social media management. Talks to a Python AI service on Railway. |
| **quikcrm** | `3008` | `3008` | [apps/quikcrm/package.json](../apps/quikcrm/package.json) | QuikCRM — sales execution (leads, accounts, opportunities, automations). Has a separate BullMQ `worker` process (`npm run worker`). |
| **quikhrms** | `3009` | `3009` | [apps/quikhrms/package.json](../apps/quikhrms/package.json) | QuikHRMS (package name `quikit-hrms`) — HR management (employees, payroll, attendance, leave). Requires Node ≥ 20.14. |
| **quiksupport** | `3010` | `3010` | [apps/quiksupport/package.json](../apps/quiksupport/package.json) | QuikSupport — helpdesk / ticketing (tickets, SLA, categories, agent queues). Ported from `helpdesk-mgt`; own `Hd*`/`Qsp*` RBAC. Public domain `support.quikit.ai` / `uatsupport.quikit.ai`. |
| **_template** | `3010` | `3010` | [apps/_template/package.json](../apps/_template/package.json) | Reference scaffold for new apps. Shares port `3010` with quiksupport — don't run both (or a real app) on `3010` at once. |
| **quikchat** | `3011` | `3011` | [apps/quikchat/package.json](../apps/quikchat/package.json) | QuikChat — team messaging (channels, DMs, calls, notifications, calendar). |
| **quikasset** | `3012` | `3012` | [apps/quikasset/package.json](../apps/quikasset/package.json) | QuikAsset — asset/inventory management. |
| **quikfinance** | `3013` | `3013` | [apps/quikfinance/package.json](../apps/quikfinance/package.json) | QuikFinance — finance module. |
| **quiklms** | `3014` | `3014` | [apps/quiklms/package.json](../apps/quiklms/package.json) | QuikLMS — learning management (folded in from standalone quikskill_lms). **`dev` script disabled locally (2026-08-07)** — shares port `3014` with quikflow; run `npm run dev:manual` instead of `turbo dev` to start it standalone. |
| **quikflow** | `3014` | `3014` | [apps/quikflow/package.json](../apps/quikflow/package.json) | QuikFlow — no-code workflow automation (Zapier/n8n analog). Has a separate BullMQ `worker` process (`npm run worker`) shipped as its **own image** (`Dockerfile.worker`). Moved from `3011` (2026-08-07) to resolve a collision with quikchat; now shares `3014` with quiklms instead — see quiklms row. UAT: `uatflow.quikit.ai`; queue broker `bullmq.quikit.ai`. |

### Startup flow

1. Start **quikit** (`3000`) — the OAuth/OIDC IdP that mints tokens for sub-apps and hosts the `/apps` launcher.
2. Start **auth** (`3001`) — the central credentials host every other app redirects unauthenticated users to.
3. Start any sub-app (`3002`–`3009`).
4. The local Postgres (`postgresql://...:5432/quikit_dev`) and Redis (`redis://localhost:6379`) must be running.

### URL constants other apps depend on

| Variable | Value (dev) | Used by |
|---|---|---|
| `NEXT_PUBLIC_AUTH_URL` | `http://localhost:3001` | every app's middleware (redirect target — the `auth` credentials host) |
| `QUIKIT_URL` / `NEXT_PUBLIC_QUIKIT_URL` | `http://localhost:3000` | every sub-app (OAuth issuer + launcher — the `quikit` app) |
| `NEXT_PUBLIC_LAUNCHER_URL` | `http://localhost:3000/apps` | apps/auth (post-login redirect) |
| `NEXT_PUBLIC_ADMIN_URL` / `ADMIN_URL` | `http://localhost:3002` | auth, quikit |
| `QUIKSCALE_URL` / `NEXT_PUBLIC_QUIKSCALE_URL` | `http://localhost:3003` | quikit, admin |
| `QUIKASSET_URL` / `NEXT_PUBLIC_QUIKASSET_URL` | `http://localhost:3012` | quikit, admin (prod `https://asset.quikit.ai`, UAT `https://uatasset.quikit.ai`) |
| `NEXT_PUBLIC_SUPER_ADMIN_URL` | `http://localhost:3000` | quikscale, quiktrack, quikinfra (super-admin lives inside quikit) |

---

## 2. Common Environment Variables (used by every app)

These MUST be identical across every app in the cluster. A mismatched `NEXTAUTH_SECRET` or `INTERNAL_SECRET` silently breaks SSO — the cookie decrypts to garbage and the middleware bounces the user to `/login` on every request.

### 2.1 Database (shared Postgres)

All apps share **one** Postgres database (`quikit_dev` in dev). Schemas are namespaced (`auth.*`, `quikit.*`, `public.*`, `app_quikscale.*`, `app_quiktrack.*`, `app_quikinfra.*`, …).

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Runtime URL. Prisma Client reads this. In prod this is the Neon **pooler** URL (`-pooler` host + `?pgbouncer=true&connection_limit=1&pool_timeout=10`). |
| `DATABASE_URL_DIRECT` | yes | Migrations URL. **Must bypass the pooler** (advisory locks + DDL need a real session). On Neon, drop `-pooler` from the host. In dev, point at the same URL as `DATABASE_URL`. |
| `MIGRATION_DATABASE_URL` | quiktrack/quiksocial/quikvc/_template only | Same role as `DATABASE_URL_DIRECT` — older template naming. New apps should standardise on `DATABASE_URL_DIRECT`. |

Encode special chars in the password (e.g. `@` → `%40`). Example: `postgresql://postgres:sa%40123@localhost:5432/quikit_dev`.

#### Neon: always set `connect_timeout`

**Every Neon URL (`DATABASE_URL`, `DATABASE_URL_DIRECT`, `MIGRATION_DATABASE_URL`) must carry `connect_timeout=20`.**

```
postgresql://…@ep-xxxx-pooler.<region>.aws.neon.tech/quikit?sslmode=require&channel_binding=require&connect_timeout=20
```

Neon suspends the compute when idle. The first query after a suspend pays a cold
start, and a measured handshake against our instance takes **~4–5s** — right on
Prisma's default `connect_timeout` of **5s**. When the wake-up is a shade slower
Prisma throws:

```
PrismaClientInitializationError: Can't reach database server at `ep-…-pooler.…neon.tech:5432`
```

Nothing is actually wrong with the database — the port is open and the next
request usually succeeds. But because the app-access gate in
`packages/auth/app-access.ts` runs in every app's `(dashboard)/layout.tsx`
server component, a single missed handshake takes out the whole dashboard with
the generic "Something went wrong" boundary, which reads like an app bug.

This applies to local `.env.local` **and** the Vercel project env vars — the
param has to be on the deployed URLs too, not just dev.

### 2.2 NextAuth (shared session)

| Variable | Required | Purpose |
|---|---|---|
| `NEXTAUTH_SECRET` | yes (all apps) | **Must be identical across every app.** Decodes the shared session cookie. Generate with `openssl rand -base64 32`. |
| `NEXTAUTH_URL` | yes (all apps) | Public origin of **this** app — `http://localhost:<port>` in dev, the Vercel domain in prod. NextAuth builds OAuth callback URLs from it; a wrong port → ERR_CONNECTION_REFUSED loops. |

### 2.3 Cross-app SSO (every sub-app)

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_AUTH_URL` | yes | Central credentials login service URL (`http://localhost:3000` in dev). Middleware redirects unauthenticated users here. |
| `QUIKIT_URL` | yes (sub-apps) | Base URL of the QuikIT OAuth IdP (`http://localhost:3001` in dev). Used for OAuth discovery and the AppSwitcher "View all apps" link. |
| `NEXT_PUBLIC_QUIKIT_URL` | yes (sub-apps) | Same value as `QUIKIT_URL`, exposed to the client so `signIn("quikit")` knows where to send the browser. |
| `QUIKIT_CLIENT_ID` | yes (sub-apps) | OAuth client ID for this app (e.g. `quikscale`, `quiktrack`, `quikinfra`, `quiksocial`). |
| `QUIKIT_CLIENT_SECRET` | yes (sub-apps) | OAuth client secret. In dev: `<app>-dev-secret-change-in-prod`. In prod: set on Vercel only. |
| `QUIKIT_ISSUER_URL` | template apps | Legacy alias of `QUIKIT_URL` used by `_template` / `quikvc` / `quiktrack` / `quiksocial` `.env.example` files. |

### 2.4 Internal infrastructure

| Variable | Required | Purpose |
|---|---|---|
| `INTERNAL_SECRET` | yes | Shared secret sent on internal token-verify calls. Every app in the cluster uses the same value. Dev: `shared-secret-for-internal-calls`. |
| `REDIS_URL` | recommended | Distributed rate limiter + auth cache (memberships / app-access lookups). Dev: `redis://localhost:6379`. Prod: Upstash `rediss://default:PASSWORD@HOST.upstash.io:PORT`. Falls back to per-process in-memory counters when unset — fine in dev, **not** in prod. |

### 2.5 SMTP (outbound email)

Used by every app for transactional email (invites, OTPs, notifications). When all three of `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` are unset, sends are no-ops and the OTP / link is printed to the server console.

| Variable | Required | Purpose |
|---|---|---|
| `SMTP_HOST` | recommended | e.g. `smtp.office365.com`. |
| `SMTP_PORT` | recommended | e.g. `587`. |
| `SMTP_USER` | recommended | The mailbox (`support@quikit.ai`). |
| `SMTP_PASS` | recommended | Mailbox password. **Backslash-escape `$`** (e.g. `Q!kS#uPp0rt\$24%G4`) to prevent Next.js dotenv-expand from substituting `$24`. |
| `SMTP_FROM` | recommended | Bare sender address. |
| `MAIL_FROM` | quikinfra only | RFC 5322 display-name override (e.g. `QuikInfra <support@quikit.ai>`). |
| `RESEND_API_KEY` | auth only (fallback) | Used by `apps/auth` only if `SMTP_HOST` is unset. |

### 2.6 Logging & feature flags (most apps)

| Variable | Required | Purpose |
|---|---|---|
| `LOG_LEVEL` | optional | `debug` / `info` / `warn` / `error`. Default `info`. |
| `SENTRY_DSN` | optional | Server-side Sentry. Leave blank in dev unless you're debugging an instrumentation issue. |
| `NEXT_PUBLIC_SENTRY_DSN` | optional | Client-side Sentry. |
| `SENTRY_AUTH_TOKEN` | optional | Source-map upload during Vercel build. |

---

## 3. Per-app environment variables (app-specific only)

Variables listed in §2 apply everywhere and are not repeated here.

### 3.1 [apps/auth](../apps/auth/) — central credentials service

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_LAUNCHER_URL` | Post-login redirect target — `http://localhost:3000/apps`. |
| `NEXT_PUBLIC_ADMIN_URL` | Admin portal URL — `http://localhost:3002`. |
| `AUTH_ALLOWED_RETURN_ORIGINS` | Comma-separated allow-list of origins the `/api/post-login` cross-domain handoff may redirect back to. Dev defaults to the localhost app origins; **must be set explicitly in prod**. |
| `AUTH_CORS_ORIGINS` | Comma-separated allow-list of origins permitted to call `POST /api/auth/forgot-password` cross-origin. Required in prod. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google SSO OAuth client. Callback registered at `/api/auth/callback/google`. |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Microsoft SSO OAuth client. Callback at `/api/auth/callback/azure-ad`. |
| `MICROSOFT_TENANT_ID` | `common` allows work/school + personal accounts; replace with a tenant GUID to restrict. |
| `RESEND_API_KEY` | Fallback email transport used only when `SMTP_HOST` is unset. |
| `GMAIL_REFRESH_TOKEN` / `GMAIL_REDIRECT_URI` | Gmail send (optional). |
| `MICROSOFT_REDIRECT_URI` / `MICROSOFT_CALENDAR_REDIRECT_URL` / `MICROSOFT_TENANT` | Microsoft Outlook calendar (optional). |

### 3.2 [apps/quikit](../apps/quikit/) — launcher + OAuth IdP

| Variable | Purpose |
|---|---|
| `JWT_SIGNING_KEY` | RSA private key (PEM) used to sign `id_token`s. **Required in prod** — otherwise the IdP generates an ephemeral key per lambda and JWKS verification fails. Generate with `openssl genpkey -algorithm RSA -out private.pem -pkeyopt rsa_keygen_bits:2048`. |
| `JWT_SIGNING_KEY_PUBLIC` | Matching RSA public key (PEM). Served via `/.well-known/jwks.json`. |
| `QUIKSCALE_URL` | App registry entry for the `/apps` launcher tile. |
| `ADMIN_URL` | App registry entry for the admin portal tile. |

### 3.3 [apps/admin](../apps/admin/)

| Variable | Purpose |
|---|---|
| `QUIKSCALE_URL` / `NEXT_PUBLIC_QUIKSCALE_URL` | Used for cross-app navigation to QuikScale. |

### 3.4 [apps/quikscale](../apps/quikscale/)

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | AI Insights feature (Phase 13). |
| `FEATURE_AI_INSIGHTS` | Feature flag (`true`/`false`). |
| `FEATURE_POWER_OF_ONE` | Feature flag. |
| `FEATURE_SLACK_INTEGRATION` | Feature flag. |
| `GITHUB_ID` / `GITHUB_SECRET` / `GOOGLE_ID` / `GOOGLE_SECRET` | Reserved for future OAuth providers (not currently wired). |
| `STRIPE_SECRET_KEY` / `SLACK_BOT_TOKEN` / `SENDGRID_API_KEY` | Reserved for future external integrations. |

### 3.5 [apps/quiktrack](../apps/quiktrack/)

| Variable | Purpose |
|---|---|
| `AWS_REGION` | S3 region (e.g. `ap-south-1`). |
| `AWS_ACCESS_KEY_ID` | S3 access key. |
| `AWS_SECRET_ACCESS_KEY` | S3 secret. |
| `AWS_S3_BUCKET` | Bucket name for document/asset uploads (e.g. `quikit-bucket`). |

### 3.6 [apps/quikinfra](../apps/quikinfra/)

| Variable | Purpose |
|---|---|
| `MAIL_FROM` | RFC 5322 display-name sender (see §2.5). |
| `SMTP_SECURE` | `true` to use TLS on connect; `false` for STARTTLS on port 587. |
| `FEATURE_AI_INSIGHTS` / `FEATURE_POWER_OF_ONE` / `FEATURE_SLACK_INTEGRATION` | Feature flags. |
| `AUTH_DEMO_MODE` | `true` in dev bypasses NextAuth; switch personas via `x-test-role` header. **Never set in prod.** |

### 3.7 [apps/quiksocial](../apps/quiksocial/) — AI social media

| Variable | Purpose |
|---|---|
| `NODE_TLS_REJECT_UNAUTHORIZED` | `0` to skip TLS validation against the Railway AI service in dev. **Never `0` in prod.** |
| `AI_SERVICE_URL` | Python AI service base URL (Railway: `https://quiksocial-v2-production.up.railway.app`). |
| `AI_SERVICE_WS_URL` | WebSocket URL for AI streaming. |
| `QS_INTERNAL_TOKEN` | Bearer token sent on internal calls to the AI service. |
| `CRON_SECRET` | Bearer token required by the `publish-scheduled` cron route. |
| `DEFAULT_ORG_ID` | Single `quikit.Org` ID the cron operates against during the single-org migration window. |
| `ENVIRONMENT` | `staging` / `production` — surfaced in logs and AI calls. |
| `META_APP_ID` / `META_APP_SECRET` | Facebook + Instagram OAuth. Callback URIs: `/api/integrations/callback/facebook` and `/api/integrations/callback/instagram`. |
| `LINKEDIN_APP_ID` / `LINKEDIN_APP_SECRET` | LinkedIn OAuth (optional). Callback `/api/integrations/callback/linkedin`. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | YouTube / Google OAuth (optional). Callback `/api/integrations/callback/youtube`. |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Cloudinary asset upload (optional). |

### 3.8 [apps/quikcrm](../apps/quikcrm/) — CRM / sales

| Variable | Purpose |
|---|---|
| `REDIS_URL` | **Required** (not just recommended) — the BullMQ job queue backing imports, SLA checks, and the notification cron runs on Redis. The `worker` process (`npm run worker`) connects to the same instance. |
| `CRON_SECRET` | Bearer token required by the notification cron routes (morning 03:30 / evening 11:30 UTC per `vercel.json`). |
| `NEXT_PUBLIC_DASHBOARD_REFRESH_MS` | KPI auto-refresh interval (default `60000`). |
| Telephony / provider keys | RP Digital / IndiaVoice click-to-call credentials (see `apps/quikcrm/CLAUDE.md`). |

### 3.9 [apps/quikhrms](../apps/quikhrms/) — HR management

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` / Google Generative AI key | AI features (resume parsing, assistants). |
| `CRON_SECRET` | Bearer token for the payroll-create (02:00 UTC), ticket auto-close (03:00), and hourly SLA-breach crons. |
| `AWS_*` / storage keys | Document handling (offer letters, payslips). |

> Requires Node ≥ 20.14 (engines constraint in `package.json`).

### 3.10 [apps/quikvc](../apps/quikvc/) and [apps/_template](../apps/_template/)

Use the common variables only (§2). QuikVC additionally uses `RESEND_API_KEY` (react-email templates), `@vercel/blob` storage, and optional `QUIKVC_DEV_BYPASS` / `QUIKVC_DEV_ROLE` for local role simulation.

### 3.11 [apps/quiksupport](../apps/quiksupport/) — helpdesk / ticketing

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_QUIKSUPPORT_URL` | This app's own public origin (`http://localhost:3010` in dev; `https://support.quikit.ai` / `https://uatsupport.quikit.ai` in prod/UAT). Used by the marketing nav's `buildLoginUrl()`. Must equal `NEXTAUTH_URL`. |
| `NEXT_PUBLIC_APP_URL` | Base origin used in outbound email deep-links (`lib/email.ts`). Must equal this app's origin. |
| `REDIS_URL` | Backs the email/notification queue. Without it (and a running worker for `workers/email-worker.ts`), async email is a no-op — the ticket still saves. |

> Domain models live in the shared schema under `app_quiksupport` (`Hd*`/`Qsp*`). See [apps/quiksupport/CLAUDE.md](../apps/quiksupport/CLAUDE.md).

---

## 4. Quick copy-paste — dev `.env.local` template for a new sub-app

Replace `<port>` and `<app-name>` for your app. Assumes a Postgres password of `sa@123` (URL-encoded as `sa%40123`).

```bash
# Database — shared local Postgres
DATABASE_URL="postgresql://postgres:sa%40123@localhost:5432/quikit_dev"
DATABASE_URL_DIRECT="postgresql://postgres:sa%40123@localhost:5432/quikit_dev"

# NextAuth — secret MUST match every other app in the cluster
NEXTAUTH_SECRET="7ynQaE7hcVrogq9q7OdIQTnCaeg+uPLeqXELLAWQ7LE="
NEXTAUTH_URL="http://localhost:<port>"

# Central auth + cross-app SSO
NEXT_PUBLIC_AUTH_URL="http://localhost:3001"
QUIKIT_URL="http://localhost:3000"
NEXT_PUBLIC_QUIKIT_URL="http://localhost:3000"
NEXT_PUBLIC_SUPER_ADMIN_URL="http://localhost:3000"
QUIKIT_CLIENT_ID="<app-name>"
QUIKIT_CLIENT_SECRET="<app-name>-dev-secret-change-in-prod"

# Cross-app infrastructure — must match every other app
INTERNAL_SECRET="shared-secret-for-internal-calls"
REDIS_URL="redis://localhost:6379"

# SMTP (optional in dev)
SMTP_HOST="smtp.office365.com"
SMTP_PORT="587"
SMTP_USER="support@quikit.ai"
SMTP_PASS="Q!kS#uPp0rt\$24%G4"
SMTP_FROM="support@quikit.ai"

LOG_LEVEL="info"
```

---

## 5. Production notes

- Each app deploys to its own Vercel project. `NEXTAUTH_URL` must be set to the production domain on Vercel — there is no localhost fallback.
- The `INTERNAL_SECRET` and `NEXTAUTH_SECRET` rotation requires updating **every** app at the same time and redeploying all of them.
- The OAuth IdP RSA keypair (`JWT_SIGNING_KEY` / `JWT_SIGNING_KEY_PUBLIC`) is set only on `apps/quikit`; sub-apps verify against the public JWKS endpoint and need nothing.
- Only the `main` branch deploys to Vercel — see the [Git Workflow rules in the root CLAUDE.md](../CLAUDE.md#-git-workflow--branch-protection-non-negotiable).

---

*Last updated: 2026-07-02 — port table reconciled against every app's `package.json` `dev` script (quikit 3000 / auth 3001 swap from the pre-2026-05-29 layout; quikvc 3005, quikinfra 3006, quiksocial 3007; quikcrm 3008 and quikhrms 3009 added). When you change a port or add an env var, update this file in the same PR.*
