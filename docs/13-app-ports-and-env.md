# App Ports & Environment Variables

A single reference for every app in the [QuikIT monorepo](../) — what port it runs on locally, and which environment variables it consumes.

> Source of truth: each app's [`package.json`](../apps/) (`dev` script) and `.env.local` / `.env.example`. If you change a port, update this file in the same PR.

---

## 1. App → Port Map (local dev)

| App | Port | Source file | Role / one-liner |
|---|---|---|---|
| **auth** | `3000` | [apps/auth/package.json](../apps/auth/package.json) | Central credentials login service. NextAuth + Google/Microsoft SSO. Other apps redirect unauthenticated users here. |
| **quikit** | `3001` | [apps/quikit/package.json](../apps/quikit/package.json) | Launcher + OAuth IdP. Hosts `/api/oauth/{authorize,token,userinfo,jwks}` and the `/apps` launcher. Super-admin pages live here under `(super-admin)/`. |
| **admin** | `3002` | [apps/admin/package.json](../apps/admin/package.json) | Admin portal (tenant/org/user/app management). |
| **quikscale** | `3003` | [apps/quikscale/package.json](../apps/quikscale/package.json) | QuikScale — OKR / KPI / Priority / WWW tooling. |
| **quiktrack** | `3004` | [apps/quiktrack/package.json](../apps/quiktrack/package.json) | QuikTrack — task / project tracker. |
| **quikconstruction** | `3005` | [apps/quikconstruction/package.json](../apps/quikconstruction/package.json) | QuikConstruction — construction ERP (BOQ, DPR/RAB, stock, procurement). |
| **quiksocial** | `3006` | [apps/quiksocial/package.json](../apps/quiksocial/package.json) | QuikSocial — AI social media management. Talks to a Python AI service on Railway. |
| **quikvc** | `3007` | [apps/quikvc/package.json](../apps/quikvc/package.json) | QuikVC. |
| **_template** | `3010` | [apps/_template/package.json](../apps/_template/package.json) | Reference scaffold for new apps. Don't run alongside a real app on `3010`. |

### Startup flow

1. Start **auth** (`3000`) — every other app redirects unauthenticated users here.
2. Start **quikit** (`3001`) — the OAuth IdP that mints tokens for sub-apps.
3. Start any sub-app (`3002`–`3007`).
4. The local Postgres (`postgresql://...:5432/quikit_dev`) and Redis (`redis://localhost:6379`) must be running.

### URL constants other apps depend on

| Variable | Value (dev) | Used by |
|---|---|---|
| `NEXT_PUBLIC_AUTH_URL` | `http://localhost:3000` | every app's middleware (redirect target) |
| `QUIKIT_URL` / `NEXT_PUBLIC_QUIKIT_URL` | `http://localhost:3001` | every sub-app (OAuth issuer + launcher) |
| `NEXT_PUBLIC_LAUNCHER_URL` | `http://localhost:3001/apps` | apps/auth (post-login redirect) |
| `NEXT_PUBLIC_ADMIN_URL` / `ADMIN_URL` | `http://localhost:3002` | auth, quikit |
| `QUIKSCALE_URL` / `NEXT_PUBLIC_QUIKSCALE_URL` | `http://localhost:3003` | quikit, admin |
| `NEXT_PUBLIC_SUPER_ADMIN_URL` | `http://localhost:3001` | quikscale, quiktrack, quikconstruction (super-admin lives inside quikit) |

---

## 2. Common Environment Variables (used by every app)

These MUST be identical across every app in the cluster. A mismatched `NEXTAUTH_SECRET` or `INTERNAL_SECRET` silently breaks SSO — the cookie decrypts to garbage and the middleware bounces the user to `/login` on every request.

### 2.1 Database (shared Postgres)

All apps share **one** Postgres database (`quikit_dev` in dev). Schemas are namespaced (`auth.*`, `quikit.*`, `public.*`, `app_quikscale.*`, `app_quiktrack.*`, `app_quikconstruction.*`, …).

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Runtime URL. Prisma Client reads this. In prod this is the Neon **pooler** URL (`-pooler` host + `?pgbouncer=true&connection_limit=1&pool_timeout=10`). |
| `DATABASE_URL_DIRECT` | yes | Migrations URL. **Must bypass the pooler** (advisory locks + DDL need a real session). On Neon, drop `-pooler` from the host. In dev, point at the same URL as `DATABASE_URL`. |
| `MIGRATION_DATABASE_URL` | quiktrack/quiksocial/quikvc/_template only | Same role as `DATABASE_URL_DIRECT` — older template naming. New apps should standardise on `DATABASE_URL_DIRECT`. |

Encode special chars in the password (e.g. `@` → `%40`). Example: `postgresql://postgres:sa%40123@localhost:5432/quikit_dev`.

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
| `QUIKIT_CLIENT_ID` | yes (sub-apps) | OAuth client ID for this app (e.g. `quikscale`, `quiktrack`, `quikconstruction`, `quiksocial`). |
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
| `MAIL_FROM` | quikconstruction only | RFC 5322 display-name override (e.g. `QuikConstruction <support@quikit.ai>`). |
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
| `NEXT_PUBLIC_LAUNCHER_URL` | Post-login redirect target — `http://localhost:3001/apps`. |
| `NEXT_PUBLIC_ADMIN_URL` | Admin portal URL — `http://localhost:3002`. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google SSO OAuth client. Callback registered at `/api/auth/callback/google`. |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Microsoft SSO OAuth client. Callback at `/api/auth/callback/azure-ad`. |
| `MICROSOFT_TENANT_ID` | `common` allows work/school + personal accounts; replace with a tenant GUID to restrict. |
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

### 3.6 [apps/quikconstruction](../apps/quikconstruction/)

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

### 3.8 [apps/quikvc](../apps/quikvc/) and [apps/_template](../apps/_template/)

Use the common variables only (§2). No app-specific extras.

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
NEXT_PUBLIC_AUTH_URL="http://localhost:3000"
QUIKIT_URL="http://localhost:3001"
NEXT_PUBLIC_QUIKIT_URL="http://localhost:3001"
NEXT_PUBLIC_SUPER_ADMIN_URL="http://localhost:3001"
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

*Last updated: 2026-05-11. When you change a port or add an env var, update this file in the same PR.*
