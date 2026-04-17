# QuikIT Platform — 10 000 CCU Remediation & Self-Hosted IaaS Rollout

**Owner:** _(assign)_
**Status:** Draft v1 — 2026-04-17
**Target:** 10 000 concurrent users, apps running on self-hosted IaaS VMs, GitHub-driven CI/CD
**Source audit:** `docs/architecture/scalability-audit-2026-04-16.md` _(to be created from the in-chat audit report)_

---

## 0. Executive Summary

This plan takes the three production apps (**quik-it** IdP, **quikscale**, **admin**) from their current Vercel deployment — audited today as **safe for ~100 concurrent users** — to a self-hosted **IaaS cluster sized for 10 000 concurrent users**, with **GitHub Actions CI/CD** deploying `dev`, `uat`, and `main` branches to their respective environments.

There are three parallel workstreams:

1. **Workstream A — Application remediation** (fixes from the audit). Critical because even a perfectly provisioned cluster collapses if `/api/apps/enable` still makes 1 000 sequential DB calls.
2. **Workstream B — Target architecture**. Design + provision the IaaS cluster (app nodes, pooler, Redis, managed Postgres, reverse proxy, observability).
3. **Workstream C — CI/CD pipeline**. GitHub → build containers → push to registry → deploy to the right environment per branch.

These must ship **in order**. Spinning up expensive infrastructure before fixing the N+1s will just move the bottleneck from one place to another.

### Decision checkpoints you must confirm before we start

| # | Decision | Default assumption | Why it matters |
|---|---|---|---|
| 1 | Is Postgres self-hosted or managed? | **Managed** (Neon / RDS / DigitalOcean Managed PG) | Self-hosting Postgres at 10K CCU needs a DBA. Don't do it. |
| 2 | How many app VMs? | **3 × 4 vCPU / 8 GB per app tier** behind a load balancer | Gives you rolling deploys and absorbs one VM failing |
| 3 | OS + runtime | **Ubuntu 22.04 LTS + Docker** | Simplest path; K3s/Nomad add ops load without benefit at this scale |
| 4 | Reverse proxy / TLS | **Caddy** (auto-TLS via Let's Encrypt) or **Nginx + certbot** | Caddy is simpler; Nginx is what most teams already know |
| 5 | Observability stack | **Grafana + Loki + Prometheus + Alertmanager** (self-hosted on a 4th VM) | Free; gives you metrics, logs, alerts in one place |
| 6 | Secrets store | **Doppler** or **HashiCorp Vault** (or GitHub Environments if small) | Don't commit `.env.production`. |
| 7 | Image registry | **GitHub Container Registry (ghcr.io)** | Free for private repos, integrated with Actions |
| 8 | Deployment model | **Pull-based on VM** via `docker compose pull && docker compose up -d` triggered over SSH | Simpler than push-based; no inbound registry traffic |
| 9 | Multi-region? | **Single region until 5 000 CCU, then add a read-replica region** | Premature multi-region is a common mistake |
| 10 | Domain strategy | `auth.yourco.com` (quik-it), `app.yourco.com` (quikscale), `admin.yourco.com` | Sub-domains share cookies cleanly for SSO |

Answer these up-front. Everything else flows from them.

---

## 1. Remediation Roadmap (P0 → P2)

The audit found 13 distinct issues. They are sequenced so **each fix retires a specific failure mode** and does not depend on the later ones.

### 1.1 P0 — Must ship before any scale-up work (Week 1)

These four items block everything else. Without them, provisioning bigger VMs just makes the bugs run faster.

#### P0-1. Database connection pool hard-cap and pooler

- **Audit finding:** `DATABASE_URL` has no `connection_limit`. Default is ~5 connections per lambda × N lambdas = hundreds of Postgres connections.
- **Implementation:**
  1. Provision a managed Postgres with a **PgBouncer / connection pooler** front-end (Neon's pooler URL, Supabase's `6543` port, or a standalone PgBouncer VM).
  2. In `packages/database/prisma/schema.prisma`:
     ```prisma
     datasource db {
       provider  = "postgresql"
       url       = env("DATABASE_URL")       // pooled, ?pgbouncer=true&connection_limit=1
       directUrl = env("DATABASE_URL_DIRECT") // unpooled, only for migrations
     }
     ```
  3. Set env vars on each app:
     ```
     DATABASE_URL=postgresql://user:pw@pooler:6543/db?pgbouncer=true&connection_limit=1
     DATABASE_URL_DIRECT=postgresql://user:pw@primary:5432/db
     ```
  4. Run `npx prisma generate` in the monorepo and redeploy.
- **Failure modes to watch:**
  - Transactions break when `pgbouncer=true` + `transaction` pooling mode. Our codebase only uses short `$transaction([…])` arrays (delete+createMany) which are safe. Verify by grepping `\$transaction\(` and reviewing each call.
  - Prepared statements on PgBouncer transaction mode — Prisma 5.x handles this, but if you see `prepared statement "s0" already exists`, flip to session pooling.
- **Verification:**
  - Load test with `k6` at 200 simultaneous logins; Postgres `SELECT count(*) FROM pg_stat_activity` should stay under 50.

#### P0-2. Kill the N+1 in `/api/apps/enable`

- **Audit finding:** `apps/quikit/app/api/apps/enable/route.ts:47-69` does `findMany(members)` then `forEach → findUnique → create`. 500 members = ~1 000 DB calls.
- **Implementation:**
  ```ts
  const members = await db.membership.findMany({
    where: { tenantId, status: "active" },
    select: { userId: true },
  });
  await db.userAppAccess.createMany({
    data: members.map(m => ({ userId: m.userId, tenantId, appId, role: "member" })),
    skipDuplicates: true,
  });
  ```
- **Failure modes:**
  - `skipDuplicates` silently ignores existing rows — make sure that's the intent (audit agent confirms it is).
- **Verification:** regression test in `apps/quikit/__tests__/api/apps-enable.test.ts` that enables an app for a tenant with 500 mock members and asserts only 2 Prisma calls.

#### P0-3. Redis-backed rate limiter (replace the in-memory `Map`)

- **Audit finding:** `packages/auth/index.ts:20-39` uses an in-memory `Map` → completely bypassable across lambdas/VMs.
- **Implementation:**
  1. Stand up Redis (managed Upstash / Redis Cloud, or a small VM running `redis:7-alpine`).
  2. `REDIS_URL` is already wired in `apps/quikscale/lib/api/rateLimit.ts` — promote that file into `packages/shared/rateLimit.ts` so all apps share it.
  3. Replace the `Map`-based `checkLoginRateLimit` in `packages/auth/index.ts` with the shared Redis limiter; fall back to in-memory only in test environments.
  4. Apply the shared limiter to:
     - `/api/auth/[...nextauth]` login → 5 req per email per 15 min
     - `/api/oauth/token` → 30 req per client_id+IP per minute
     - `/api/super/*` → 60 req per user per minute
- **Failure modes:**
  - Redis outage → decide: fail-open (let traffic through) or fail-closed (reject). For auth endpoints, fail-closed is safer.
  - Key cardinality explosion — bucket on lowercased email, hashed client_secret, and `/24` IP block, not raw full IP.

#### P0-4. Rate-limit the OAuth token endpoint + consider bcrypt cost

- **Audit finding:** `/api/oauth/token` uses `bcrypt.compare` at cost 12 (~250 ms of CPU per compare) with **no rate limit** → cheap DoS vector.
- **Implementation:**
  1. Apply the P0-3 limiter at the top of the POST handler.
  2. Add an in-memory LRU cache (`lru-cache` npm) around `db.oAuthClient.findUnique({ where: { clientId } })` with 60 s TTL — the record is nearly static.
  3. Consider lowering bcrypt cost on client_secret from 12 → 10 (still strong; halves CPU time). Requires re-hashing stored secrets — handle in a migration that re-hashes on next successful compare (lazy upgrade).
- **Failure modes:** LRU cache sees a stale clientSecret after a rotation. Invalidate on rotation by emitting a Redis pub/sub message the lambdas subscribe to, OR accept up to 60 s of stale secret and publish rotations to both old+new for 2 minutes.

### 1.2 P1 — Before 1 000 CCU (Weeks 2-3)

#### P1-1. Pagination sweep on unbounded `findMany`
Files to fix (all use the same treatment: add `paginationToSkipTake` from `@quikit/shared/pagination`):
- `apps/admin/app/api/teams/route.ts:37`
- `apps/admin/app/api/members/route.ts:38`
- `apps/admin/app/api/apps/access/route.ts:11`
- `apps/quikit/app/api/super/orgs/route.ts:49`
- `apps/quikscale/app/api/org/teams/route.ts:39`
- `apps/quikscale/app/api/performance/scorecard/route.ts` — also replace `include` → `select`
- `apps/quikscale/app/api/performance/teams/route.ts` — same

**Failure mode:** frontend currently assumes full-list returns. Update `useQuery` hooks to either use pagination or `useInfiniteQuery`.

#### P1-2. CDN / edge cache on hot read paths
Add `Cache-Control: private, max-age=30, stale-while-revalidate=60` to:
- `/api/apps/launcher`
- `/api/apps/switcher`
- `/api/org/memberships`

On the IaaS stack, Caddy/Nginx will honor these headers. On Vercel, `s-maxage` does the same at their edge.

**Failure mode:** a user who loses access mid-cache still sees the app tile for up to 90 s. Acceptable for our case — confirm with security.

#### P1-3. Missing composite indexes
Add to `packages/database/prisma/schema.prisma`:
```prisma
@@index([tenantId, userId, read])        // Notification
@@index([tenantId, year, quarter])       // PerformanceReview
@@index([tenantId, year, quarter])       // TalentAssessment
@@index([tenantId, quarter, year])       // HabitAssessment
```
`npx prisma migrate dev --name add_hot_path_indexes` → review generated SQL (use `CREATE INDEX CONCURRENTLY` in prod — Prisma doesn't emit this by default, so wrap the migration manually).

**Failure mode:** large tables block writes during index build. Always `CREATE INDEX CONCURRENTLY` in prod.

#### P1-4. Heavy export deps → dynamic import
In quikscale, move `jspdf`, `html2canvas`, `docx` behind `next/dynamic`:
```ts
const exportToPdf = async () => {
  const { default: jsPDF } = await import("jspdf");
  const html2canvas = (await import("html2canvas")).default;
  // ...
};
```
Cuts the dashboard bundle by ~300 KB gzipped.

### 1.3 P2 — Before 10 000 CCU (Weeks 4-6)

| Item | Effort | Why |
|---|---|---|
| Horizontally scale app tier (3 → 6 nodes, behind LB) | 2 days | Main capacity lever |
| Postgres read replica + route read-heavy queries through `db.$replica()` or a second `PrismaClient` | 3-4 days | Offload dashboards from primary |
| `/metrics` endpoint (already have `prom-client` in deps) + Prometheus scrape | 1 day | Without p95/p99 you're flying blind |
| Sentry Performance on all three apps | 0.5 day | Trace spans for the slow endpoints |
| Super-admin separate rate-limit bucket (stricter) | 0.5 day | Blast-radius limit on a compromised admin cookie |
| Background job runner (BullMQ or pg-boss) for email / audit trail writes | 2 days | Move slow writes off the request path |
| Per-route `maxDuration` / memory in Caddy or systemd | 0.5 day | Cap runaway requests |
| CDN in front of static assets (Cloudflare free tier) | 0.5 day | Free perf + DDoS shield |
| E2E load test with k6/Grafana-k6 at 10K CCU | 1 day | Find the next bottleneck |

---

## 2. Target Architecture on IaaS

### 2.1 Topology

```
                             ┌──────────────────┐
                             │  Cloudflare (DNS │
                             │  + free WAF/CDN) │
                             └────────┬─────────┘
                                      │
                       ┌──────────────┴──────────────┐
                       │   Load Balancer / Caddy      │
                       │   TLS termination            │
                       │   (2 VMs, keepalived)        │
                       └──┬──────────┬──────────┬─────┘
                          │          │          │
             ┌────────────┘          │          └────────────┐
             ▼                       ▼                       ▼
      ┌────────────┐          ┌────────────┐          ┌────────────┐
      │ App node 1 │          │ App node 2 │          │ App node 3 │
      │ docker ×3  │          │ docker ×3  │          │ docker ×3  │
      │ quikit,    │          │ quikit,    │          │ quikit,    │
      │ quikscale, │          │ quikscale, │          │ quikscale, │
      │ admin      │          │ admin      │          │ admin      │
      └─────┬──────┘          └─────┬──────┘          └─────┬──────┘
            │                       │                       │
            └──────────┬────────────┴───────────┬───────────┘
                       ▼                        ▼
              ┌─────────────────┐      ┌─────────────────┐
              │  Managed        │      │  Redis (1 VM    │
              │  Postgres       │      │  or Upstash)    │
              │  + PgBouncer    │      └─────────────────┘
              │  + read-replica │
              └─────────────────┘

              ┌────────────────────────────────────────────┐
              │  Observability VM                          │
              │  Prometheus + Grafana + Loki + Alertmanager│
              └────────────────────────────────────────────┘
```

### 2.2 VM sizing (initial, per environment)

| Role | VMs | Size (vCPU / RAM / Disk) | Notes |
|---|---|---|---|
| Load balancer / Caddy | 2 | 2 / 4 GB / 20 GB | keepalived for VIP failover |
| App tier (runs all 3 apps as containers) | 3 | 4 / 8 GB / 40 GB | Scale to 6 before 10K |
| Observability | 1 | 4 / 8 GB / 200 GB | Loki wants disk |
| Redis | 1 | 2 / 4 GB / 20 GB | Or use Upstash and skip |
| Managed Postgres | — | Managed | Start at 4 vCPU / 16 GB / 200 GB |

**Total initial:** 7 VMs + managed Postgres. Budget roughly **$400-600/month on DigitalOcean / Hetzner / Linode** for the non-prod tier; prod tier will roughly double.

### 2.3 Container layout per app node

Each app node runs `docker compose` with three services:

```yaml
# /opt/quikit/docker-compose.yml
services:
  quikit:
    image: ghcr.io/yourorg/quikit:${QUIKIT_TAG}
    env_file: /opt/quikit/envs/quikit.env
    ports: ["3000:3000"]
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 15s
      timeout: 5s
      retries: 3
  quikscale:
    image: ghcr.io/yourorg/quikscale:${QUIKSCALE_TAG}
    env_file: /opt/quikit/envs/quikscale.env
    ports: ["3004:3000"]
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 15s
  admin:
    image: ghcr.io/yourorg/admin:${ADMIN_TAG}
    env_file: /opt/quikit/envs/admin.env
    ports: ["3005:3000"]
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 15s
```

### 2.4 Next.js configuration for container builds

Add to each app's `next.config.js`:
```js
module.exports = {
  output: "standalone",           // cuts image size ~80%
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs"],
  },
  // ...existing config
};
```

### 2.5 Dockerfile per app (template — same for all three)

`apps/quikscale/Dockerfile` (repeat for quikit, admin):
```dockerfile
# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
ENV PNPM_HOME="/pnpm"
WORKDIR /repo

# --- deps stage ---
FROM base AS deps
COPY package.json package-lock.json turbo.json ./
COPY apps/quikscale/package.json apps/quikscale/
COPY packages/ packages/
RUN npm ci --ignore-scripts

# --- build stage ---
FROM base AS build
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN npx turbo run build --filter=quikscale...
RUN npx turbo run db:generate --filter=@quikit/database

# --- runtime stage ---
FROM node:20-alpine AS runtime
RUN apk add --no-cache libc6-compat openssl tini
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/quikscale/.next/standalone ./
COPY --from=build /repo/apps/quikscale/.next/static ./apps/quikscale/.next/static
COPY --from=build /repo/apps/quikscale/public ./apps/quikscale/public
COPY --from=build /repo/node_modules/.prisma ./node_modules/.prisma
USER node
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/quikscale/server.js"]
```

### 2.6 Caddy reverse proxy config

`/etc/caddy/Caddyfile` on each LB node:
```
auth.yourco.com {
  reverse_proxy app-node-1:3000 app-node-2:3000 app-node-3:3000 {
    lb_policy least_conn
    health_uri /api/health
    health_interval 15s
    fail_duration 30s
    max_fails 3
  }
  encode zstd gzip
  header {
    Strict-Transport-Security "max-age=63072000"
    X-Frame-Options DENY
    X-Content-Type-Options nosniff
  }
}

app.yourco.com {
  reverse_proxy app-node-1:3004 app-node-2:3004 app-node-3:3004 {
    lb_policy least_conn
    health_uri /api/health
  }
}

admin.yourco.com {
  reverse_proxy app-node-1:3005 app-node-2:3005 app-node-3:3005 {
    lb_policy least_conn
    health_uri /api/health
  }
}
```

Caddy auto-provisions Let's Encrypt certs on first boot.

---

## 3. CI/CD Pipeline

### 3.1 Branch-to-environment mapping

Matches your existing git workflow (feature/* → dev → uat → main):

| Branch | Environment | Host | Auto-deploy? |
|---|---|---|---|
| `feature/*` | none | — | Build + test only, no deploy |
| `dev` | dev | `dev-app-1..n.yourco.com` | Yes, on green CI |
| `uat` | staging | `uat-app-1..n.yourco.com` | Yes, on green CI |
| `main` | prod | `app-1..n.yourco.com` | **Manual approval** in GitHub Environment |

### 3.2 GitHub Actions workflow

`.github/workflows/ci-cd.yml`:
```yaml
name: CI/CD

on:
  push:
    branches: [main, uat, dev, "feature/**"]
  pull_request:
    branches: [main, uat, dev]

env:
  REGISTRY: ghcr.io
  IMAGE_BASE: ghcr.io/${{ github.repository_owner }}

jobs:
  # -----------------------------------------------------------------
  # 1. Lint + typecheck + test — runs on every push and PR
  # -----------------------------------------------------------------
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"
      - run: npm ci
      - run: npx turbo run lint typecheck test --cache-dir=.turbo

  # -----------------------------------------------------------------
  # 2. Build + push Docker images — only on dev/uat/main
  # -----------------------------------------------------------------
  build:
    needs: verify
    if: github.event_name == 'push' && contains(fromJSON('["refs/heads/main","refs/heads/uat","refs/heads/dev"]'), github.ref)
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    strategy:
      matrix:
        app: [quikit, quikscale, admin]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Compute image tag
        id: tag
        run: |
          echo "env=${GITHUB_REF_NAME}" >> "$GITHUB_OUTPUT"
          echo "sha=${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"
      - uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/${{ matrix.app }}/Dockerfile
          push: true
          tags: |
            ${{ env.IMAGE_BASE }}/${{ matrix.app }}:${{ steps.tag.outputs.env }}
            ${{ env.IMAGE_BASE }}/${{ matrix.app }}:${{ steps.tag.outputs.env }}-${{ steps.tag.outputs.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # -----------------------------------------------------------------
  # 3a. Deploy to dev — auto, no approval
  # -----------------------------------------------------------------
  deploy-dev:
    needs: build
    if: github.ref == 'refs/heads/dev'
    runs-on: ubuntu-latest
    environment: dev
    steps:
      - uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.DEV_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            cd /opt/quikit
            ./deploy.sh dev ${{ github.sha }}

  # -----------------------------------------------------------------
  # 3b. Deploy to staging (uat) — auto
  # -----------------------------------------------------------------
  deploy-uat:
    needs: build
    if: github.ref == 'refs/heads/uat'
    runs-on: ubuntu-latest
    environment: uat
    steps:
      - uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.UAT_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: cd /opt/quikit && ./deploy.sh uat ${{ github.sha }}

  # -----------------------------------------------------------------
  # 3c. Deploy to prod — requires manual approval in GitHub UI
  # -----------------------------------------------------------------
  deploy-prod:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production   # protection rule: required reviewers
    strategy:
      matrix:
        host:
          - ${{ secrets.PROD_HOST_1 }}
          - ${{ secrets.PROD_HOST_2 }}
          - ${{ secrets.PROD_HOST_3 }}
      max-parallel: 1         # rolling deploy — one VM at a time
    steps:
      - uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ matrix.host }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            cd /opt/quikit
            ./deploy.sh prod ${{ github.sha }}
      - name: Post-deploy smoke test
        run: |
          curl -fsSL https://app.yourco.com/api/health || exit 1
          curl -fsSL https://auth.yourco.com/.well-known/openid-configuration | jq -e '.issuer' || exit 1
```

### 3.3 On-VM deploy script

`/opt/quikit/deploy.sh` (same on every VM):
```bash
#!/usr/bin/env bash
set -euo pipefail

ENV="$1"                  # dev | uat | prod
SHA="$2"                  # git sha (7+ char)

case "$ENV" in
  dev)   TAG="dev-${SHA:0:7}"  ;;
  uat)   TAG="uat-${SHA:0:7}"  ;;
  prod)  TAG="main-${SHA:0:7}" ;;
  *) echo "unknown env $ENV"; exit 1 ;;
esac

cd /opt/quikit

# 1. Pull new images by tag
export QUIKIT_TAG="$TAG" QUIKSCALE_TAG="$TAG" ADMIN_TAG="$TAG"
docker compose pull

# 2. Run prisma migrations (idempotent) — only from one node
if [[ -f /opt/quikit/.is-migration-node ]]; then
  docker compose run --rm --entrypoint "" quikit npx prisma migrate deploy
fi

# 3. Rolling restart
docker compose up -d --no-deps --remove-orphans

# 4. Wait for health
for svc in quikit quikscale admin; do
  for i in {1..20}; do
    if docker compose exec -T "$svc" wget -qO- http://localhost:3000/api/health >/dev/null 2>&1; then
      echo "$svc healthy"; break
    fi
    sleep 3
    [[ $i -eq 20 ]] && { echo "$svc failed to become healthy"; exit 1; }
  done
done

# 5. Prune old images (keep last 5)
docker image prune -af --filter "until=168h"
```

### 3.4 Secrets — how they reach the VM

Three layers:

1. **GitHub Secrets** (`Settings → Secrets → Actions`): SSH keys, registry token, deploy host IPs.
2. **Per-VM `.env` files** in `/opt/quikit/envs/*.env` — owned by root, mode `600`. Rotated by Ansible/Doppler sync, *not* by CI.
3. **Runtime env in containers** comes from `env_file:` in `docker-compose.yml`.

> Do **not** push `.env.production` through CI. Rotate on the VM directly; the running container picks it up on next `docker compose up -d`.

### 3.5 Failure modes of the pipeline itself

| Failure | Mitigation |
|---|---|
| CI builds but push fails (registry outage) | Retry with exponential backoff; keep last-known-good tag running |
| `prisma migrate deploy` fails mid-deploy | Migrations must be backward-compatible; if they break, the old container keeps serving until we fix-forward |
| One VM fails to pull image | Load balancer removes it via health check; remaining VMs absorb traffic |
| All three VMs fail health check post-deploy | `deploy-prod` job fails before smoke-test step; manual rollback via `./deploy.sh prod <last-good-sha>` |
| SSH key compromise | Keys stored in GitHub Environments (prod-only); rotate on suspicion; `authorized_keys` per-VM limits blast radius |
| Concurrent deploys (two PRs merged simultaneously) | GitHub `concurrency: group: deploy-${{ github.ref }}, cancel-in-progress: false` at the job level — only one deploy per branch at a time |

---

## 4. Rollout Plan (6 weeks, gated)

```
Week 1 ── P0 fixes                                      ← can stay on Vercel
         • Postgres pooler + connection_limit
         • /api/apps/enable createMany
         • Redis + shared rate limiter
         • OAuth token rate limit

Week 2 ── IaaS provisioning (dev + uat only)
         • Provision 2 LB + 2 app + 1 obs VM per env
         • Install Docker, Caddy, Prometheus node-exporter
         • Bootstrap managed Postgres + Redis
         • Ansible playbooks for everything

Week 3 ── CI/CD + Dockerize
         • Dockerfiles for all 3 apps
         • next.config.js → output: "standalone"
         • GitHub Actions workflow
         • First dev deploy, validate SSO end-to-end

Week 4 ── P1 fixes + uat cutover
         • Pagination sweep
         • Cache-Control headers
         • Composite indexes (CONCURRENTLY)
         • Dynamic import heavy deps
         • Cut uat traffic from Vercel → IaaS-uat
         • Load test uat at 1 000 CCU (k6)

Week 5 ── P2 prep + prod provisioning
         • Provision prod (3 app + 2 LB + 1 obs) in primary region
         • Prometheus/Grafana dashboards
         • Sentry + prom-client /metrics
         • Load test prod cluster empty at 10 000 CCU

Week 6 ── Prod cutover + post-launch
         • Flip DNS from Vercel to IaaS prod (low-TTL switch)
         • Warm cache; watch dashboards
         • Week of burn-in; Vercel kept hot as fallback
         • Decommission Vercel on day 14 post-cutover
```

### 4.1 Go / no-go gates

- **End of Week 1:** Vercel prod error rate after P0 fixes <0.1 %, no connection-pool errors in logs for 48 h.
- **End of Week 3:** dev deploy of same `main` commit is behaviorally identical to Vercel prod (screenshot-diff or manual smoke test).
- **End of Week 4:** uat sustains 1 000 CCU for 30 min with p95 < 500 ms on every hot endpoint.
- **End of Week 5:** prod cluster empty-load test sustains 10 000 CCU for 10 min with no 5xx.
- **Cutover day:** rollback plan documented: flip DNS back to Vercel (low TTL = fast); Vercel is kept running for 14 days post-cutover.

---

## 5. Where This Plan Can Fail (Pre-Mortem)

Ordered by likelihood:

1. **Migration failure mid-deploy** — a Prisma migration that works on dev but fails on prod due to data that only exists in prod. _Mitigation:_ every migration must be tested against a sanitized prod snapshot in uat before merging to `main`.
2. **Hidden assumption of Vercel-only env vars** — e.g., `process.env.VERCEL_URL` or `X-Forwarded-For` parsing. _Mitigation:_ grep `VERCEL_` across the repo before cutover; normalize `X-Forwarded-For` behind Caddy.
3. **NEXTAUTH_URL misconfiguration on VMs** — the app sees `http://localhost:3000` and issues id_tokens with the wrong issuer. _Mitigation:_ per-env `.env` sets `NEXTAUTH_URL` to the public domain; diag endpoint (re-added temporarily during cutover) verifies issuer.
4. **Cold cache on cutover day** — Postgres has no hot working set yet, p95 spikes for 15 min. _Mitigation:_ warm queries with a k6 script just before DNS flip.
5. **Cross-app cookie drift after moving to subdomains** — SSO cookie scope issues. _Mitigation:_ set cookie `Domain=.yourco.com` on NextAuth session cookies; test in uat.
6. **Redis single point of failure** — everything rate-limit-dependent breaks. _Mitigation:_ Redis with AOF + daily snapshot, OR use managed Upstash with replication. Limiter fails-closed on auth endpoints.
7. **GitHub Actions runner outage** → can't deploy hotfixes. _Mitigation:_ keep a documented manual path — SSH in and run `./deploy.sh prod <sha>` by hand.
8. **Self-hosted observability goes down** → you're blind. _Mitigation:_ critical alerts also route to PagerDuty/Opsgenie directly from app (Sentry) so you aren't dependent on your own Grafana.

---

## 6. Action Items

Assign owners, timebox each:

- [ ] Confirm the 10 decision-checkpoints in §0.
- [ ] Choose IaaS provider (Hetzner / DigitalOcean / Linode / AWS EC2 / self-owned rack).
- [ ] Choose managed Postgres provider.
- [ ] Buy/configure domains + Cloudflare.
- [ ] Ship P0-1 through P0-4 (still on Vercel).
- [ ] Write Ansible playbooks for VM provisioning (`roles/{caddy,docker,app,observability}`).
- [ ] Write Dockerfiles for all three apps.
- [ ] Add `output: "standalone"` to each `next.config.js`.
- [ ] Create GitHub Environments (`dev`, `uat`, `production`) with required reviewers on `production`.
- [ ] Stand up dev IaaS env; first-pass CI/CD.
- [ ] Load test at 1K and 10K CCU.
- [ ] Cutover runbook + rollback drill.

---

## Appendix A. Commands Cheat Sheet

```bash
# Bootstrap one app VM (run once per host)
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
apt-get install -y caddy
systemctl enable --now caddy docker

# First-time deploy from local (bootstrap)
scp docker-compose.yml deploy.sh deploy@app-node-1:/opt/quikit/
ssh deploy@app-node-1 'sudo mkdir -p /opt/quikit/envs && sudo chmod 700 /opt/quikit/envs'
# ...place .env files via Doppler / ansible-vault...

# Manual rollback (last-known-good tag)
ssh deploy@app-node-1
cd /opt/quikit
QUIKIT_TAG=main-abc1234 QUIKSCALE_TAG=main-abc1234 ADMIN_TAG=main-abc1234 \
  docker compose up -d

# Live-tail logs
docker compose logs -f --since 10m quikscale | grep -E '(ERROR|WARN)'

# Prometheus query for p95 latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{app="quikscale"}[5m]))

# Rotate secrets without redeploy
sudo vim /opt/quikit/envs/quikscale.env
docker compose up -d --force-recreate --no-deps quikscale
```

## Appendix B. Useful Links (to bookmark)

- Prisma + PgBouncer: https://www.prisma.io/docs/guides/performance-and-optimization/connection-management/configure-pg-bouncer
- Next.js standalone output: https://nextjs.org/docs/app/api-reference/next-config-js/output
- Caddy reverse proxy: https://caddyserver.com/docs/caddyfile/directives/reverse_proxy
- GitHub Actions environments & approvals: https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment
- k6 load testing recipes: https://grafana.com/docs/k6/latest/examples/

---

_End of document._
