# QuikIT — Local Setup Guide (for everyone pulling from `main`)

This document is the single source of truth for getting a fresh checkout of the QuikIT monorepo running on your machine. Hand it to Claude (or follow it yourself) — every step is explicit. You should NOT have to ask anyone for help if you follow it top-to-bottom.

> **Important:** This guide assumes you just pulled the latest code from `main`. The codebase, environment variable names, and folder layout are NOT being changed — this document only tells you how to set up your local environment to match what's already in `main`.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Repository layout](#2-repository-layout)
3. [Port map (which app runs on which port)](#3-port-map)
4. [Clone & install dependencies](#4-clone--install-dependencies)
5. [PostgreSQL setup](#5-postgresql-setup)
6. [Redis setup](#6-redis-setup)
7. [Environment variables — common (shared across every app)](#7-environment-variables--common)
8. [Environment variables — per-app](#8-environment-variables--per-app)
9. [Database migrations & seeding](#9-database-migrations--seeding)
10. [Running the apps (dev mode)](#10-running-the-apps-dev-mode)
11. [Build & production setup](#11-build--production-setup)
12. [Tests / typecheck / lint](#12-tests--typecheck--lint)
13. [Troubleshooting (the things that actually go wrong)](#13-troubleshooting)
14. [Quick reference — every command in one place](#14-quick-reference)

---

## 1. Prerequisites

Install these BEFORE doing anything else. Skipping or downgrading any of them will produce confusing errors three steps later.

| Software | Required version | How to check | Where to get it |
|---|---|---|---|
| **Node.js** | `>= 20.x` | `node --version` | <https://nodejs.org/> or `nvm install 20 && nvm use 20` |
| **npm** | `>= 11.x` (ships with Node 20.x) | `npm --version` | bundled with Node |
| **Git** | any recent | `git --version` | <https://git-scm.com/> |
| **PostgreSQL** | `>= 14` | `psql --version` | <https://www.postgresql.org/download/> (Windows installer / Postgres.app / `apt-get install postgresql` / Docker) |
| **Redis** | `>= 6` (optional in dev — rate limiter falls back to in-memory; required for cross-app cache invalidation) | `redis-cli ping` | <https://redis.io/download/> / `docker run -p 6379:6379 redis` |
| **OpenSSL** | for generating secrets | `openssl version` | bundled on macOS/Linux. Windows: ships with Git for Windows. |

Recommended:

- A Postgres GUI (TablePlus, DBeaver, pgAdmin) for inspecting `quikit_dev`.
- Claude Code or VS Code as your editor.

---

## 2. Repository layout

```
QuikIT/
├── apps/                          # one Next.js app per business product
│   ├── auth/                      # :3000 — central credentials login service
│   ├── quikit/                    # :3001 — launcher + OAuth IdP
│   ├── admin/                     # :3002 — admin portal
│   ├── quikscale/                 # :3003 — OKR / KPI tool
│   ├── quiktrack/                 # :3004 — task / project tracker
│   ├── quikconstruction/          # :3005 — construction ERP
│   ├── quiksocial/                # :3006 — AI social media
│   ├── quikvc/                    # :3007 — QuikVC
│   └── _template/                 # :3010 — scaffold (NOT a workspace; excluded)
├── packages/                      # shared workspace packages — DO NOT modify
│   ├── auth/                      # @quikit/auth
│   ├── database/                  # @quikit/database (Prisma schema + client)
│   ├── redis/                     # @quikit/redis
│   ├── shared/                    # @quikit/shared
│   └── ui/                        # @quikit/ui
├── docs/                          # numbered reference docs
├── scripts/                       # operational scripts (onboarding, smoke tests, …)
├── package.json                   # root workspace + scripts
├── turbo.json                     # Turborepo task graph
└── CLAUDE.md                      # repo-wide conventions
```

- npm workspaces: `packages/*` and `apps/*` (excluding `apps/_template`).
- Turborepo orchestrates `dev` / `build` / `lint` / `typecheck` / `test`.
- One Prisma schema at [packages/database/prisma/schema.prisma](packages/database/prisma/schema.prisma) — all apps share it via `@quikit/database`.

---

## 3. Port map

| Port | App | Role |
|---|---|---|
| **3000** | [apps/auth](apps/auth/) | Central credentials login (NextAuth + Google/Microsoft SSO). Other apps redirect unauthenticated users here. |
| **3001** | [apps/quikit](apps/quikit/) | Launcher + OAuth IdP. Hosts `/api/oauth/*` and the `/apps` launcher. Super-admin pages live here. |
| **3002** | [apps/admin](apps/admin/) | Admin portal (tenant / org / user / app management). |
| **3003** | [apps/quikscale](apps/quikscale/) | OKR / KPI / Priority / WWW tooling. |
| **3004** | [apps/quiktrack](apps/quiktrack/) | Task / project tracker. |
| **3005** | [apps/quikconstruction](apps/quikconstruction/) | Construction ERP (BOQ, DPR/RAB, stock, procurement). |
| **3006** | [apps/quiksocial](apps/quiksocial/) | AI social media management. |
| **3007** | [apps/quikvc](apps/quikvc/) | QuikVC. |
| **3010** | [apps/_template](apps/_template/) | Reference scaffold for new apps. Not in workspaces. |

> The `dev` port for each app is hard-coded in its `package.json` `dev` script (e.g. `next dev -p 3003`). Do NOT change it — `NEXTAUTH_URL` and OAuth callback URLs depend on these exact values.

### Startup order

If you want SSO to work end-to-end:

1. Start Postgres (`5432`) and Redis (`6379`).
2. Start [apps/auth](apps/auth/) on `:3000`.
3. Start [apps/quikit](apps/quikit/) on `:3001`.
4. Start any sub-app (`3002`–`3007`).

Apps can run standalone for pure local development, but cross-app sign-in only works when 3000 + 3001 are also up.

---

## 4. Clone & install dependencies

```bash
# 1. Clone
git clone <your-repo-url> QuikIT
cd QuikIT
git checkout main
git pull origin main

# 2. Install everything (npm workspaces — installs root + every app + every package)
npm install
```

The root [package.json](package.json) has a `postinstall` hook that runs `prisma generate --schema=packages/database/prisma/schema.prisma`. If `npm install` fails on `postinstall`, see [§13 Troubleshooting](#13-troubleshooting).

First install takes 2–5 minutes. Subsequent installs are cached.

---

## 5. PostgreSQL setup

Every app talks to **one shared local database**. Schemas (`auth`, `quikit`, `public`, `app_quikscale`, `app_quiktrack`, `app_quikconstruction`, `app_quikvc`, `app_quiksocial`) namespace each app's models inside that single database.

### 5.1 Create the database

```bash
# Option A — psql
psql -U postgres -c "CREATE DATABASE quikit_dev;"

# Option B — createdb (if on PATH)
createdb quikit_dev

# Option C — Docker
docker run -d --name quikit-postgres -e POSTGRES_PASSWORD=sa@123 -p 5432:5432 postgres:14
docker exec -it quikit-postgres psql -U postgres -c "CREATE DATABASE quikit_dev;"
```

The existing developers' machines all use:

- **Host**: `localhost`
- **Port**: `5432`
- **User**: `postgres`
- **Password**: `sa@123` (URL-encoded as `sa%40123` — see §5.2)
- **Database**: `quikit_dev`

If your local Postgres uses a different user/password, that's fine — just substitute it everywhere `DATABASE_URL` appears in §7 / §8.

### 5.2 URL-encoding the password

`@` in a password breaks Postgres URLs. Always URL-encode special characters:

| Char | Encoded |
|---|---|
| `@` | `%40` |
| `:` | `%3A` |
| `/` | `%2F` |
| `#` | `%23` |
| `?` | `%3F` |
| `&` | `%26` |
| `$` | `%24` |

Example: password `sa@123` → URL `postgresql://postgres:sa%40123@localhost:5432/quikit_dev`.

---

## 6. Redis setup

Used by every app for the distributed rate limiter and auth cache.

```bash
# Option A — local install
redis-server

# Option B — Docker
docker run -d --name quikit-redis -p 6379:6379 redis:7

# Verify
redis-cli ping   # should print PONG
```

Default URL: `redis://localhost:6379`.

If Redis is not available in dev, apps will still run — they fall back to per-process in-memory counters. SSO will work but cross-app cache invalidation won't.

---

## 7. Environment variables — common

These keys MUST appear in **every** app's `.env.local` (or be inherited from the same root) and the values MUST be **identical** across all apps. A mismatched `NEXTAUTH_SECRET` silently breaks sign-in (cookie decrypts to garbage and the user bounces to `/login` forever).

The existing dev cluster uses the following baseline values. Copy them verbatim unless you're intentionally overriding.

### 7.1 Database

```bash
DATABASE_URL="postgresql://postgres:sa%40123@localhost:5432/quikit_dev"
DATABASE_URL_DIRECT="postgresql://postgres:sa%40123@localhost:5432/quikit_dev"
```

- `DATABASE_URL` — runtime URL Prisma Client reads.
- `DATABASE_URL_DIRECT` — migrations URL (must bypass any pooler). In dev, point at the same URL as `DATABASE_URL`.
- A few legacy app `.env.example` files use `MIGRATION_DATABASE_URL` instead of `DATABASE_URL_DIRECT` — both names work; if your `schema.prisma`/lib references `DATABASE_URL_DIRECT`, use that.

### 7.2 NextAuth (shared session)

```bash
NEXTAUTH_SECRET="7ynQaE7hcVrogq9q7OdIQTnCaeg+uPLeqXELLAWQ7LE="
NEXTAUTH_URL="http://localhost:<this-app's-port>"
```

- `NEXTAUTH_SECRET` — **the value above is the existing dev secret used across the cluster.** Use exactly this so your cookies validate against the rest of the cluster. (To generate a new one for a different environment: `openssl rand -base64 32`.)
- `NEXTAUTH_URL` — origin of THIS app. Match the dev port. See §3.

### 7.3 Cross-app SSO URLs

```bash
NEXT_PUBLIC_AUTH_URL="http://localhost:3000"
QUIKIT_URL="http://localhost:3001"
NEXT_PUBLIC_QUIKIT_URL="http://localhost:3001"
NEXT_PUBLIC_SUPER_ADMIN_URL="http://localhost:3001"
```

### 7.4 OAuth client (every sub-app — NOT auth/quikit)

```bash
QUIKIT_CLIENT_ID="<app-name>"                              # e.g. "quikscale"
QUIKIT_CLIENT_SECRET="<app-name>-dev-secret-change-in-prod"
```

Sub-apps use these to identify themselves to the OAuth IdP at [apps/quikit](apps/quikit/). In dev the secret is conventionally `<app>-dev-secret-change-in-prod`.

### 7.5 Internal infrastructure

```bash
INTERNAL_SECRET="shared-secret-for-internal-calls"
REDIS_URL="redis://localhost:6379"
```

`INTERNAL_SECRET` is the bearer token sent on internal verify-token calls between apps. Identical across the cluster.

### 7.6 SMTP (outbound email — optional in dev)

```bash
SMTP_HOST="smtp.office365.com"
SMTP_PORT="587"
SMTP_USER="support@quikit.ai"
SMTP_PASS="Q!kS#uPp0rt\$24%G4"       # backslash-escape $ to defeat dotenv-expand
SMTP_FROM="support@quikit.ai"
```

When SMTP env vars are absent, OTPs and email links are printed to the dev server console — fine for solo dev work.

### 7.7 Logging

```bash
LOG_LEVEL="info"
```

---

## 8. Environment variables — per-app

Each app needs its OWN `.env.local` file. The recipe below is "create the file, paste the common block from §7 with the right port, then add the app-specific keys below."

> Tip: every app already ships an `.env.example` (or `.env.local.example`). The fastest path is `cp apps/<app>/.env.example apps/<app>/.env.local` and then edit. The exact filename varies — see the **Source** column.

### 8.1 [apps/auth](apps/auth/) (port 3000)

**Source:** [apps/auth/.env.local.example](apps/auth/.env.local.example)

```bash
# --- common (§7) ---
DATABASE_URL="postgresql://postgres:sa%40123@localhost:5432/quikit_dev"
DATABASE_URL_DIRECT="postgresql://postgres:sa%40123@localhost:5432/quikit_dev"
NEXTAUTH_SECRET="7ynQaE7hcVrogq9q7OdIQTnCaeg+uPLeqXELLAWQ7LE="
NEXTAUTH_URL="http://localhost:3000"
QUIKIT_URL="http://localhost:3001"
NEXT_PUBLIC_AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_LAUNCHER_URL="http://localhost:3001/apps"
NEXT_PUBLIC_ADMIN_URL="http://localhost:3002"
REDIS_URL="redis://localhost:6379"
INTERNAL_SECRET="shared-secret-for-internal-calls"

# --- SMTP (optional) ---
SMTP_HOST="smtp.office365.com"
SMTP_PORT="587"
SMTP_USER="support@quikit.ai"
SMTP_PASS="Q!kS#uPp0rt\$24%G4"
SMTP_FROM="support@quikit.ai"

# --- Google SSO (optional in dev — leave blank to disable that login button) ---
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# --- Microsoft SSO (optional in dev) ---
MICROSOFT_CLIENT_ID=""
MICROSOFT_CLIENT_SECRET=""
MICROSOFT_TENANT_ID="common"
```

If your team has real Google/Microsoft OAuth credentials, ask the integration owner — they're rotated separately from this guide.

### 8.2 [apps/quikit](apps/quikit/) (port 3001)

**Source:** [apps/quikit/.env.local.example](apps/quikit/.env.local.example)

```bash
DATABASE_URL="postgresql://postgres:sa%40123@localhost:5432/quikit_dev"
DATABASE_URL_DIRECT="postgresql://postgres:sa%40123@localhost:5432/quikit_dev"
NEXTAUTH_SECRET="7ynQaE7hcVrogq9q7OdIQTnCaeg+uPLeqXELLAWQ7LE="
NEXTAUTH_URL="http://localhost:3001"
NEXT_PUBLIC_AUTH_URL="http://localhost:3000"
QUIKIT_URL="http://localhost:3001"
ADMIN_URL="http://localhost:3002"
QUIKSCALE_URL="http://localhost:3003"
REDIS_URL="redis://localhost:6379"
INTERNAL_SECRET="shared-secret-for-internal-calls"

SMTP_HOST="smtp.office365.com"
SMTP_PORT="587"
SMTP_USER="support@quikit.ai"
SMTP_PASS="Q!kS#uPp0rt\$24%G4"
SMTP_FROM="support@quikit.ai"

# --- OAuth IdP RSA keypair ---
# Required in PROD; optional in dev (an ephemeral key is generated per restart).
# To pin a stable keypair locally:
#   openssl genpkey -algorithm RSA -out private.pem -pkeyopt rsa_keygen_bits:2048
#   openssl rsa -in private.pem -pubout -out public.pem
# JWT_SIGNING_KEY=""
# JWT_SIGNING_KEY_PUBLIC=""
```

### 8.3 [apps/admin](apps/admin/) (port 3002)

There is no committed `.env.example` for admin. Create `apps/admin/.env.local` with:

```bash
DATABASE_URL="postgresql://postgres:sa%40123@localhost:5432/quikit_dev"
DATABASE_URL_DIRECT="postgresql://postgres:sa%40123@localhost:5432/quikit_dev"
NEXTAUTH_SECRET="7ynQaE7hcVrogq9q7OdIQTnCaeg+uPLeqXELLAWQ7LE="
NEXTAUTH_URL="http://localhost:3002"

# Cross-app navigation
QUIKSCALE_URL="http://localhost:3003"
NEXT_PUBLIC_QUIKSCALE_URL="http://localhost:3003"

# QuikIT SSO
QUIKIT_URL="http://localhost:3001"
NEXT_PUBLIC_QUIKIT_URL="http://localhost:3001"
QUIKIT_CLIENT_ID="admin"
QUIKIT_CLIENT_SECRET="admin-dev-secret-change-in-prod"

NEXT_PUBLIC_AUTH_URL="http://localhost:3000"
REDIS_URL="redis://localhost:6379"
INTERNAL_SECRET="shared-secret-for-internal-calls"
```

### 8.4 [apps/quikscale](apps/quikscale/) (port 3003)

**Source:** [apps/quikscale/.env.example](apps/quikscale/.env.example)

```bash
DATABASE_URL="postgresql://postgres:sa%40123@localhost:5432/quikit_dev"
DATABASE_URL_DIRECT="postgresql://postgres:sa%40123@localhost:5432/quikit_dev"
NEXTAUTH_SECRET="7ynQaE7hcVrogq9q7OdIQTnCaeg+uPLeqXELLAWQ7LE="
NEXTAUTH_URL="http://localhost:3003"

NEXT_PUBLIC_SUPER_ADMIN_URL="http://localhost:3001"

QUIKIT_URL="http://localhost:3001"
NEXT_PUBLIC_QUIKIT_URL="http://localhost:3001"
QUIKIT_CLIENT_ID="quikscale"
QUIKIT_CLIENT_SECRET="quikscale-dev-secret-change-in-prod"

NEXT_PUBLIC_AUTH_URL="http://localhost:3000"
INTERNAL_SECRET="shared-secret-for-internal-calls"
REDIS_URL="redis://localhost:6379"

# AI features (optional)
ANTHROPIC_API_KEY=""

# Feature flags
FEATURE_AI_INSIGHTS="false"
FEATURE_POWER_OF_ONE="true"
FEATURE_SLACK_INTEGRATION="false"

LOG_LEVEL="info"
```

### 8.5 [apps/quiktrack](apps/quiktrack/) (port 3004)

**Source:** [apps/quiktrack/.env.example](apps/quiktrack/.env.example)

```bash
DATABASE_URL="postgresql://postgres:sa%40123@localhost:5432/quikit_dev"
DATABASE_URL_DIRECT="postgresql://postgres:sa%40123@localhost:5432/quikit_dev"
NEXTAUTH_SECRET="7ynQaE7hcVrogq9q7OdIQTnCaeg+uPLeqXELLAWQ7LE="
NEXTAUTH_URL="http://localhost:3004"

NEXT_PUBLIC_SUPER_ADMIN_URL="http://localhost:3001"
NEXT_PUBLIC_QUIKIT_URL="http://localhost:3001"

QUIKIT_URL="http://localhost:3001"
QUIKIT_CLIENT_ID="quiktrack"
QUIKIT_CLIENT_SECRET="quiktrack-dev-secret-change-in-prod"

NEXT_PUBLIC_AUTH_URL="http://localhost:3000"
INTERNAL_SECRET="shared-secret-for-internal-calls"
REDIS_URL="redis://localhost:6379"
LOG_LEVEL="info"

# AWS S3 — document/asset uploads (optional in dev; uploads will fail without these)
AWS_REGION="ap-south-1"
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
AWS_S3_BUCKET="quikit-bucket"

# SMTP
SMTP_HOST="smtp.office365.com"
SMTP_PORT="587"
SMTP_USER="support@quikit.ai"
SMTP_PASS="Q!kS#uPp0rt\$24%G4"
SMTP_FROM="support@quikit.ai"
```

### 8.6 [apps/quikconstruction](apps/quikconstruction/) (port 3005)

Use the same shape as the other sub-apps. No `.env.example` is committed; build `apps/quikconstruction/.env.local` like this:

```bash
DATABASE_URL="postgresql://postgres:sa%40123@localhost:5432/quikit_dev"
DATABASE_URL_DIRECT="postgresql://postgres:sa%40123@localhost:5432/quikit_dev"
NEXTAUTH_SECRET="7ynQaE7hcVrogq9q7OdIQTnCaeg+uPLeqXELLAWQ7LE="
NEXTAUTH_URL="http://localhost:3005"

NEXT_PUBLIC_SUPER_ADMIN_URL="http://localhost:3001"
NEXT_PUBLIC_QUIKIT_URL="http://localhost:3001"

QUIKIT_URL="http://localhost:3001"
QUIKIT_CLIENT_ID="quikconstruction"
QUIKIT_CLIENT_SECRET="quikconstruction-dev-secret-change-in-prod"

NEXT_PUBLIC_AUTH_URL="http://localhost:3000"
INTERNAL_SECRET="shared-secret-for-internal-calls"
REDIS_URL="redis://localhost:6379"

# SMTP
SMTP_HOST="smtp.office365.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="support@quikit.ai"
SMTP_PASS="Q!kS#uPp0rt\$24%G4"
SMTP_FROM="support@quikit.ai"
MAIL_FROM="QuikConstruction <support@quikit.ai>"

LOG_LEVEL="info"
FEATURE_AI_INSIGHTS="false"
FEATURE_POWER_OF_ONE="true"
FEATURE_SLACK_INTEGRATION="false"
```

### 8.7 [apps/quiksocial](apps/quiksocial/) (port 3006)

**Source:** [apps/quiksocial/.env.example](apps/quiksocial/.env.example)

```bash
DATABASE_URL="postgresql://postgres:sa%40123@localhost:5432/quikit_dev"
DATABASE_URL_DIRECT="postgresql://postgres:sa%40123@localhost:5432/quikit_dev"
NEXTAUTH_SECRET="7ynQaE7hcVrogq9q7OdIQTnCaeg+uPLeqXELLAWQ7LE="
NEXTAUTH_URL="http://localhost:3006"

NEXT_PUBLIC_AUTH_URL="http://localhost:3000"
QUIKIT_URL="http://localhost:3001"
NEXT_PUBLIC_QUIKIT_URL="http://localhost:3001"
QUIKIT_CLIENT_ID="quiksocial"
QUIKIT_CLIENT_SECRET="quiksocial-dev-secret-change-in-prod"
INTERNAL_SECRET="shared-secret-for-internal-calls"

# Python AI service (Railway)
AI_SERVICE_URL="https://quiksocial-v2-production.up.railway.app"
AI_SERVICE_WS_URL="wss://quiksocial-v2-production.up.railway.app"
QS_INTERNAL_TOKEN="quiksocial_internal_uat_2025_xK9mP3nQ"
NODE_TLS_REJECT_UNAUTHORIZED="0"        # dev only — never in prod

# Cron + default org
CRON_SECRET="quiksocial-cron-secret-dev"
DEFAULT_ORG_ID=""                       # ask the integration owner for the dev org id
ENVIRONMENT="staging"

# Meta / Facebook / Instagram OAuth (optional)
META_APP_ID=""
META_APP_SECRET=""

# LinkedIn OAuth (optional)
LINKEDIN_APP_ID=""
LINKEDIN_APP_SECRET=""

# YouTube / Google OAuth (optional)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# Cloudinary (optional)
CLOUDINARY_CLOUD_NAME=""
CLOUDINARY_API_KEY=""
CLOUDINARY_API_SECRET=""

LOG_LEVEL="info"
```

### 8.8 [apps/quikvc](apps/quikvc/) (port 3007)

**Source:** [apps/quikvc/.env.example](apps/quikvc/.env.example)

```bash
DATABASE_URL="postgresql://postgres:sa%40123@localhost:5432/quikit_dev"
DATABASE_URL_DIRECT="postgresql://postgres:sa%40123@localhost:5432/quikit_dev"
# (some legacy quikvc code reads MIGRATION_DATABASE_URL — keep both in sync)
MIGRATION_DATABASE_URL="postgresql://postgres:sa%40123@localhost:5432/quikit_dev"

NEXTAUTH_SECRET="7ynQaE7hcVrogq9q7OdIQTnCaeg+uPLeqXELLAWQ7LE="
NEXTAUTH_URL="http://localhost:3007"

QUIKIT_CLIENT_ID="quikvc"
QUIKIT_CLIENT_SECRET="quikvc-dev-secret-change-in-prod"
QUIKIT_ISSUER_URL="http://localhost:3001"
QUIKIT_URL="http://localhost:3001"
NEXT_PUBLIC_QUIKIT_URL="http://localhost:3001"
NEXT_PUBLIC_AUTH_URL="http://localhost:3000"

INTERNAL_SECRET="shared-secret-for-internal-calls"
REDIS_URL="redis://localhost:6379"
```

### 8.9 [apps/_template](apps/_template/) (port 3010, optional)

Only needed if you're scaffolding a new app. Same shape as quikvc with `quikvc` → your `<app-name>`.

---

## 9. Database migrations & seeding

All Prisma commands live in [packages/database](packages/database/). The root `package.json` exposes shortcuts that `cd` into that package first — always run them from the repo root.

### 9.1 First-time setup (apply schema)

After creating `quikit_dev` and writing your `.env.local` files, push the schema:

```bash
# From repo root
npm run db:push
```

This calls `prisma db push` with the schema at [packages/database/prisma/schema.prisma](packages/database/prisma/schema.prisma). It creates every schema (`auth`, `quikit`, `public`, `app_quikscale`, `app_quiktrack`, `app_quikconstruction`, `app_quikvc`, `app_quiksocial`) and every table.

> `db:push` is the fastest path for local dev. Use `db:migrate` only if you're authoring a new migration.

### 9.2 Migration commands (existing migrations from `main`)

```bash
# Apply all committed migrations (preferred for fresh checkouts that need history)
npm run db:migrate:deploy

# Authoring a new migration during dev
npm run db:migrate -- --name <descriptive_snake_case_name>

# Check status
npm run db:migrate:status

# Hard reset — drops the DB, re-applies every migration, re-runs seeds.
# DANGEROUS in shared environments; fine locally.
cd packages/database && npx prisma migrate reset
```

### 9.3 Generate Prisma Client

The root `postinstall` does this automatically, but if you ever see `Cannot find module '@prisma/client'`:

```bash
npm run db:generate
```

### 9.4 Prisma Studio (DB browser)

```bash
npm run db:studio
```

Opens `http://localhost:5555` with a UI over your local database.

### 9.5 Seeds (optional but recommended)

The `prisma/` folder has several seed scripts. The ones exposed at the root are:

```bash
# E2E test fixtures (used by Playwright)
npm run db:seed:e2e

# QuikVC sample data
npm run db:seed:quikvc
```

Other seeds live inside [packages/database/prisma/](packages/database/prisma/) and can be run with `tsx`:

```bash
cd packages/database
npx tsx prisma/seed.ts                    # base seed
npx tsx prisma/seed-superadmin.ts         # creates a super-admin user
npx tsx prisma/seed-oauth.ts              # registers the OAuth clients (admin, quikscale, quiktrack, quikconstruction, quiksocial, quikvc)
npx tsx prisma/seed-moreyeahs.ts          # demo org "MoreYeahs"
npx tsx prisma/seed-quikvc-demo.ts        # quikvc demo data
```

**Recommended first-run seed order:**

```bash
npm run db:push
cd packages/database
npx tsx prisma/seed.ts
npx tsx prisma/seed-superadmin.ts
npx tsx prisma/seed-oauth.ts
cd ../..
```

This produces a database with the core records every app needs (apps registry, OAuth clients, a super-admin login).

### 9.6 App-level dummy seeds

A few apps ship their own dummy-data scripts:

```bash
cd apps/quikscale && npm run db:seed:dummy
cd apps/quiktrack && npm run db:seed:dummy
cd apps/quiksocial && npm run db:seed:dummy
cd apps/quikconstruction && npm run db:seed:dummy
```

---

## 10. Running the apps (dev mode)

### 10.1 Run a single app

```bash
# Filtered (recommended — starts only that app + its workspace deps)
npm run dev:auth          # apps/auth on :3000
npm run dev:quikit        # apps/quikit on :3001
npm run dev:admin         # apps/admin on :3002
npm run dev:quikscale     # apps/quikscale on :3003

# Any other app (uses the workspace name)
npx turbo dev --filter=quiktrack
npx turbo dev --filter=quikconstruction
npx turbo dev --filter=quiksocial
npx turbo dev --filter=quikvc

# Or run from the app folder directly
cd apps/quiktrack && npm run dev
```

### 10.2 Run every app at once

```bash
npm run dev
```

> Heavy on CPU/memory because every app spins up its own Next.js dev server and watches for changes. In practice, most devs only run the 2–3 apps they need plus auth + quikit for SSO.

### 10.3 Smoke check

After starting an app, hit:

- `http://localhost:<port>` — landing page
- `http://localhost:<port>/api/health` — health endpoint (every app exposes one)

---

## 11. Build & production setup

### 11.1 Build everything

```bash
npm run build
```

Turbo runs each app's `prebuild` (`prisma generate`) then `next build` in topological order across workspaces.

### 11.2 Build a single app

```bash
npx turbo build --filter=quikscale
```

### 11.3 Production start

The `start` script for each app is in its `package.json`. Run after a successful `build`:

```bash
cd apps/quikscale && npm run start
```

Note: a few apps' `start` script intentionally listens on a different port than `dev` (e.g. quikit `dev=3001` vs `start=3000`, admin `dev=3002` vs `start=3005`, quikscale `dev=3003` vs `start=3002`). For local prod parity testing, override with `next start -p <dev-port>`.

### 11.4 Vercel deploy

Each app has its own Vercel project. Per the [root CLAUDE.md](CLAUDE.md), **only `main` triggers Vercel builds** — `dev` and `uat` are local/QA integration branches. The `apps/*/vercel.json` files enforce this via `deploymentEnabled` and `ignoreCommand`.

You do not need to run anything for Vercel — pushing to `main` (after the merge train completes) auto-deploys. To check what would deploy, use [scripts/affected-apps.mjs](scripts/affected-apps.mjs):

```bash
node scripts/affected-apps.mjs main HEAD
```

---

## 12. Tests / typecheck / lint

Run before every commit. CI runs the same commands — fail locally first to save time.

```bash
# All workspaces, turbo-cached
npm run typecheck
npm run lint
npm run test

# Single app
cd apps/quikscale
npm run test                    # vitest run (one-shot)
npm run test:watch              # vitest watcher
npm run test:ui                 # vitest web UI

# E2E (Playwright) — quikscale is the canonical suite
npm run e2e:install             # one-time — installs Chromium + deps
npm run db:seed:e2e             # reset the E2E tenant
npm run e2e                     # apps/quikscale Playwright
npm run e2e:quikit              # apps/quikit Playwright
npm run e2e:all                 # both
```

See [docs/07-testing.md](docs/07-testing.md) for conventions (mock rules, Vitest environments, coverage ratchet).

---

## 13. Troubleshooting

### `npm install` fails

```bash
rm -rf node_modules package-lock.json
node --version   # must print v20.x or higher
npm install
```

If `postinstall` (prisma generate) fails: check `DATABASE_URL` is set in your shell or in a root `.env` — Prisma needs it to parse the schema even for `generate`. Set it temporarily:

```bash
DATABASE_URL="postgresql://postgres:sa%40123@localhost:5432/quikit_dev" \
DATABASE_URL_DIRECT="postgresql://postgres:sa%40123@localhost:5432/quikit_dev" \
npm install
```

### `Cannot find module '@prisma/client'`

```bash
npm run db:generate
```

### `Cannot resolve '@quikit/ui'` (or any `@quikit/*`)

Workspace symlinks broke — usually after a branch switch.

```bash
rm -rf node_modules
npm install
npm run db:generate
```

### Sign-in redirects in an infinite loop

Almost always one of:

1. `NEXTAUTH_URL` in this app's `.env.local` doesn't match the port the app actually runs on. Check §3.
2. `NEXTAUTH_SECRET` differs from the other apps in the cluster — the cookie decrypts to garbage.
3. Stale cookies. Clear cookies for `localhost` in your browser and try again.

### `connection refused` to Postgres on port 5432

Postgres isn't running. Start it:

- Windows: open `pgAdmin` / Postgres service in Services.msc
- macOS (Postgres.app): click Start
- Linux: `sudo systemctl start postgresql`
- Docker: `docker start quikit-postgres`

### `database "quikit_dev" does not exist`

```bash
psql -U postgres -c "CREATE DATABASE quikit_dev;"
npm run db:push
```

### Prisma "P1012" — environment variable not found: `DATABASE_URL_DIRECT`

You set `DATABASE_URL` but not `DATABASE_URL_DIRECT`. Prisma 5.22 does NOT fall back. Add `DATABASE_URL_DIRECT` to your `.env.local` (same value as `DATABASE_URL` for local dev).

### Schema push fails with `permission denied for schema public`

Your Postgres user lacks `CREATE` on the database. Grant it:

```sql
GRANT ALL PRIVILEGES ON DATABASE quikit_dev TO postgres;
ALTER DATABASE quikit_dev OWNER TO postgres;
```

### `next dev` succeeds but page is blank

Open browser DevTools → Console. Usually a CSP violation (compare your app's `next.config.js` headers against [apps/admin/next.config.js](apps/admin/next.config.js)) or a runtime error in a Server Component.

### Port already in use (`EADDRINUSE`)

Another process holds the port. Find and kill it:

```bash
# Windows (PowerShell)
Get-NetTCPConnection -LocalPort 3003 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }

# macOS / Linux
lsof -i :3003
kill -9 <pid>
```

### Cross-app sign-in fails ("invalid client")

Make sure `seed-oauth.ts` has been run — it registers each sub-app's `QUIKIT_CLIENT_ID` / `QUIKIT_CLIENT_SECRET` in the OAuth IdP. If you ran the schema push but skipped the seed, the OAuth client rows don't exist.

```bash
cd packages/database
npx tsx prisma/seed-oauth.ts
```

### TypeScript hangs forever

```bash
rm -rf apps/<app>/tsconfig.tsbuildinfo apps/<app>/.next
npm run typecheck
```

### Push rejected: `protected branch hook declined`

You tried to push to `main`, `uat`, or `dev`. Not allowed.

```bash
git checkout -b feature/<short-description>
git push -u origin feature/<short-description>
```

See the [Git Workflow rules in CLAUDE.md](CLAUDE.md) — this is non-negotiable.

### "too many clients already" from Postgres

Connection pool exhausted (common after many test runs). Restart Postgres, or cap Prisma:

```bash
DATABASE_URL="postgresql://postgres:sa%40123@localhost:5432/quikit_dev?connection_limit=5"
```

---

## 14. Quick reference

### One-shot first-run on a fresh machine

```bash
# 1. Prereqs
node --version    # v20.x
npm --version     # 11.x
psql --version    # 14+
redis-cli ping    # PONG

# 2. Clone
git clone <repo-url> QuikIT
cd QuikIT
git checkout main && git pull

# 3. Database
psql -U postgres -c "CREATE DATABASE quikit_dev;"

# 4. Install (root postinstall runs prisma generate)
npm install

# 5. Write .env.local for every app you intend to run — see §8.

# 6. Schema + seeds
npm run db:push
cd packages/database
npx tsx prisma/seed.ts
npx tsx prisma/seed-superadmin.ts
npx tsx prisma/seed-oauth.ts
cd ../..

# 7. Run the apps (separate terminals)
npm run dev:auth        # :3000
npm run dev:quikit      # :3001
npm run dev:admin       # :3002
npm run dev:quikscale   # :3003
# ...and any other app you need
```

### Every command in the root `package.json`

| Command | What it does |
|---|---|
| `npm run dev` | All apps via Turbo |
| `npm run dev:auth` | Just `apps/auth` (:3000) |
| `npm run dev:quikit` | Just `apps/quikit` (:3001) |
| `npm run dev:admin` | Just `apps/admin` (:3002) |
| `npm run dev:quikscale` | Just `apps/quikscale` (:3003) |
| `npm run build` | Turbo build all |
| `npm run lint` | Turbo lint all |
| `npm run typecheck` | Turbo typecheck all (parallel `tsc --noEmit`) |
| `npm run test` | Turbo test all (Vitest) |
| `npm run db:push` | `prisma db push` (sync schema, no migration files) |
| `npm run db:migrate` | `prisma migrate dev` (author + apply a new migration) |
| `npm run db:migrate:deploy` | `prisma migrate deploy` (apply existing migrations only) |
| `npm run db:migrate:status` | Show pending vs applied migrations |
| `npm run db:studio` | Open Prisma Studio at `:5555` |
| `npm run db:generate` | Regenerate Prisma Client |
| `npm run db:seed:e2e` | Seed E2E test tenant |
| `npm run db:seed:quikvc` | Seed QuikVC demo data |
| `npm run e2e` | Playwright (quikscale) |
| `npm run e2e:quikit` | Playwright (quikit) |
| `npm run e2e:all` | Both Playwright suites |
| `npm run e2e:install` | Install Playwright Chromium |

### Helper scripts

| Script | Purpose |
|---|---|
| [scripts/onboard-dev.sh](scripts/onboard-dev.sh) | Bootstrap a new per-dev repo from `apps/_template` |
| [scripts/affected-apps.mjs](scripts/affected-apps.mjs) | Show which apps would redeploy for a given diff range |
| [scripts/check-prod-urls.mjs](scripts/check-prod-urls.mjs) | Smoke-check production URLs |
| [scripts/smoke-test.mjs](scripts/smoke-test.mjs) | End-to-end smoke test |

---

## When in doubt

- App-specific rules: read `apps/<app>/CLAUDE.md`.
- Repo-wide rules: read [CLAUDE.md](CLAUDE.md).
- Deep architecture: read [docs/01-architecture.md](docs/01-architecture.md).
- Original onboarding doc: [docs/00-getting-started.md](docs/00-getting-started.md).
- Troubleshooting: [docs/09-troubleshooting.md](docs/09-troubleshooting.md).
- Port + env reference (this guide's sibling): [docs/13-app-ports-and-env.md](docs/13-app-ports-and-env.md).

If you've followed every step here and still can't run an app — capture the exact error, what step you were on, and post it in the team channel. Don't sit stuck for more than 30 minutes.
