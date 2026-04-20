# GCP + Linux Deployment Guide

**Audience:** the DevOps person deploying QuikIT (quikit + quikscale + admin) onto Google Cloud Platform or a Compute-Engine Linux VM.
**Prerequisites:** basic GCP familiarity (projects, IAM, gcloud CLI). No deep Next.js / monorepo knowledge assumed.

---

## 0. TL;DR — which deployment shape should we pick?

| Shape | When to use | Effort | Monthly cost (baseline) |
|---|---|---|---|
| **Cloud Run (RECOMMENDED)** | Default for ≤ 30 tenants, ≤ few hundred concurrent users. Managed, auto-scales, zero patches. | ~2 days to first deploy | ₹ 5,000–15,000 |
| **Compute Engine + Docker Compose** | Want full control over OS, tenant data residency audit trail, custom networking. Tier 2 of the platform evolution path. | ~1 week to first deploy | ₹ 4,000–10,000 |
| **GKE (Kubernetes)** | Don't use for 3 apps. Revisit at ≥10 apps / ≥ 100 tenants. | 3–4 weeks | ₹ 25,000+ |

**Recommendation for current scale (15 trial tenants, India-only):** **Cloud Run in `asia-south1` (Mumbai).** Falls inside Indian data residency, pay-per-request, scales to zero overnight saving cost, Cloud Build integrates natively with the repo for CI/CD.

If a specific customer contract requires "no managed container runtime / dedicated VM," fall back to Compute Engine + Docker Compose (also documented below).

---

## 1. Architecture at a glance

```
                             🌐 Cloudflare (DNS + CDN + WAF)
                                        │
            ┌───────────────────────┼────────────────────────┐
            ▼                          ▼                          ▼
  quikit.quikit.in          quikscale.quikit.in         admin.quikit.in
            │                          │                          │
            ▼                          ▼                          ▼
   ┌────────────────────────── GCP (asia-south1 = Mumbai) ──────────────────────────┐
   │                                                                                 │
   │  Cloud Run  │  Cloud Run   │  Cloud Run                                       │
   │    quikit   │   quikscale  │     admin                                         │
   │    :3000    │    :3004     │    :3005                                          │
   │                                                                                 │
   │  Cloud SQL Postgres 16 (private IP, regional HA optional)                       │
   │  Memorystore Redis 7 (private IP)                                               │
   │  Secret Manager — all secrets (NEXTAUTH_SECRET, DATABASE_URL, OAuth creds …)    │
   │  Artifact Registry — Docker image store                                         │
   │  Cloud Build — CI/CD (triggered by GitHub push to main)                         │
   │  Cloud Logging + Cloud Monitoring — observability                               │
   │                                                                                 │
   └───────────────────────────────────────────────────────────────────────────────────────┘

   External services (kept):
     • Resend — transactional email
     • Sentry — error tracking
     • GitHub — source of truth + Cloud Build trigger
```

### What lives where

| Component | Where | Why |
|---|---|---|
| 3 apps (quikit / quikscale / admin) | Cloud Run, 3 services | Auto-scale, scale-to-zero, no patches, Indian region |
| Postgres | Cloud SQL for PostgreSQL, `asia-south1`, private IP | Managed backups, point-in-time recovery, Indian residency |
| Redis | Memorystore for Redis, `asia-south1`, private IP | Rate limit + feature-flag cache + `@quikit/shared/redisCache` |
| Container images | Artifact Registry `asia-south1-docker.pkg.dev/<project>/quikit` | Region-colocated, private, IAM-controlled |
| Secrets | Secret Manager | Never in env vars directly, never in images |
| CI/CD | Cloud Build trigger on GitHub push to `main` | Build → push → Cloud Run deploy, all inside GCP |
| DNS + CDN + WAF | Cloudflare (external) | Free tier covers DDoS + caching; sits in front of Cloud Run custom domains |
| Email | Resend | Keep existing |
| Observability | Cloud Logging + Cloud Monitoring (infra) + Sentry (app errors) | Two different layers of signal |

### Why Indian region matters

Enterprise customers have asked for **data residency**. `asia-south1` (Mumbai) + Cloud SQL + Memorystore + Artifact Registry all pinned to `asia-south1` means every byte of customer data lives in a Mumbai data centre. Cloud Run jobs themselves run in the same region. We can point to this architecture in RFP responses.

---

## 2. What's in this repo for the DevOps team

The code changes committed alongside this doc:

| File | Purpose |
|---|---|
| `apps/quikit/Dockerfile` | Multi-stage Docker build for QuikIT (port 3000) |
| `apps/quikscale/Dockerfile` | Multi-stage Docker build for QuikScale (port 3004) |
| `apps/admin/Dockerfile` | Multi-stage Docker build for Admin (port 3005) |
| `.dockerignore` | Keeps node_modules / .next / secrets out of build context |
| `docker-compose.yml` | Local full-stack validation — run all 3 + Postgres + Redis on your laptop |
| `apps/*/next.config.js` | Updated with `output: "standalone"` + `outputFileTracingRoot` (required for small Docker images) |

You get all three apps containerised and runnable on any Linux host. The same images deploy to Cloud Run, Compute Engine, or (eventually) K8s without change.

---

## 3. Local sanity check — start here before touching GCP

Before the DevOps team touches cloud infra, validate that the images build + run on a laptop:

```bash
# From monorepo root
cp apps/quikit/.env.local.example .env   # fill in NEXTAUTH_SECRET (random 32+ char), OAuth creds, etc.

# Build + start all 3 apps + postgres + redis
docker compose up -d --build

# Verify
curl http://localhost:3000/api/auth/session   # quikit
curl http://localhost:3004/api/health         # quikscale
curl http://localhost:3005/api/auth/session   # admin

# Tear down
docker compose down -v   # -v also drops the postgres volume
```

**If this works locally, the GCP deploy will work.** Most deploy failures show up here first.

### First-build time expectations

- Cold build of all 3 images: **12–20 minutes** (first time only; depends on laptop)
- Cached rebuild (small source change): **2–4 minutes**
- Final image size per app: **~280–350 MB** (thanks to `output: "standalone"`)

If your final image is 1 GB+, something's wrong — likely `.dockerignore` is being bypassed or `output: "standalone"` didn't take effect. See Troubleshooting.

---

## 4. GCP setup — one-time

### 4.1 Project + region

```bash
gcloud projects create quikit-prod --name="QuikIT Production"
gcloud config set project quikit-prod
gcloud config set run/region asia-south1
gcloud config set compute/region asia-south1

# Enable the APIs we need
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  vpcaccess.googleapis.com \
  compute.googleapis.com
```

### 4.2 Artifact Registry (Docker image store)

```bash
gcloud artifacts repositories create quikit \
  --repository-format=docker \
  --location=asia-south1 \
  --description="QuikIT container images"

gcloud auth configure-docker asia-south1-docker.pkg.dev
```

### 4.3 Cloud SQL (Postgres 16)

```bash
gcloud sql instances create quikit-db \
  --database-version=POSTGRES_16 \
  --tier=db-custom-2-4096 \
  --region=asia-south1 \
  --storage-auto-increase \
  --storage-size=20GB \
  --network=projects/quikit-prod/global/networks/default \
  --no-assign-ip \
  --availability-type=ZONAL         # upgrade to REGIONAL for HA when you scale

# Create the database
gcloud sql databases create quikit --instance=quikit-db

# Create a dedicated app user
gcloud sql users create quikit-app --instance=quikit-db --password="$(openssl rand -hex 32)"
# ↔ save this password to Secret Manager immediately (next section)
```

**Data residency note:** set `--region=asia-south1` and `--no-assign-ip` so the DB is only reachable via VPC private networking. No public Internet exposure.

### 4.4 Memorystore Redis

```bash
gcloud redis instances create quikit-redis \
  --size=1 \
  --region=asia-south1 \
  --redis-version=redis_7_2 \
  --network=projects/quikit-prod/global/networks/default

# Capture the private IP for DATABASE_URL-style wiring
gcloud redis instances describe quikit-redis --region=asia-south1 --format="value(host)"
```

### 4.5 Serverless VPC Access (so Cloud Run can reach Cloud SQL + Redis on private IP)

```bash
gcloud compute networks vpc-access connectors create quikit-vpc \
  --region=asia-south1 \
  --network=default \
  --range=10.8.0.0/28
```

### 4.6 Secret Manager — where all secrets live

Create one secret per variable. Example:

```bash
# Generate + store NEXTAUTH_SECRET (shared across all 3 apps)
openssl rand -base64 32 | gcloud secrets create NEXTAUTH_SECRET --data-file=-

# Database URL (use the `quikit-app` user password from 4.3)
echo -n "postgresql://quikit-app:<password>@<private-ip>:5432/quikit?schema=public&sslmode=require" \
  | gcloud secrets create DATABASE_URL --data-file=-

# Same for the direct (unpooled) URL used by migrations
echo -n "postgresql://quikit-app:<password>@<private-ip>:5432/quikit?schema=public&sslmode=require" \
  | gcloud secrets create DATABASE_URL_DIRECT --data-file=-

# Redis
echo -n "redis://<memorystore-private-ip>:6379" | gcloud secrets create REDIS_URL --data-file=-

# Resend
gcloud secrets create RESEND_API_KEY --data-file=- <<< "re_..."

# Sentry (both public and private per app)
gcloud secrets create SENTRY_DSN                 --data-file=- <<< "https://...@sentry.io/..."
gcloud secrets create NEXT_PUBLIC_SENTRY_DSN     --data-file=- <<< "https://...@sentry.io/..."

# Cron
openssl rand -hex 24 | gcloud secrets create CRON_SECRET --data-file=-

# OAuth client IDs + secrets for quikscale and admin
# (These are generated by super-admin UI after first quikit deploy — see section 5.3)
# gcloud secrets create QUIKSCALE_OAUTH_CLIENT_ID     --data-file=- <<< "<from super-admin>"
# gcloud secrets create QUIKSCALE_OAUTH_CLIENT_SECRET --data-file=- <<< "<from super-admin>"
# gcloud secrets create ADMIN_OAUTH_CLIENT_ID         --data-file=- <<< "<from super-admin>"
# gcloud secrets create ADMIN_OAUTH_CLIENT_SECRET     --data-file=- <<< "<from super-admin>"
```

**Rule:** secrets NEVER live as Cloud Run env vars directly. They're mounted at runtime by giving the Cloud Run service's service account `roles/secretmanager.secretAccessor` on each secret.

### 4.7 Service accounts

One service account per Cloud Run service:

```bash
for app in quikit quikscale admin; do
  gcloud iam service-accounts create "$app-run" \
    --display-name="$app Cloud Run runtime SA"
done
```

Grant each SA Secret-Manager access to the secrets it actually needs:

```bash
# Shared across all 3
for secret in NEXTAUTH_SECRET DATABASE_URL DATABASE_URL_DIRECT REDIS_URL SENTRY_DSN NEXT_PUBLIC_SENTRY_DSN; do
  for sa in quikit-run quikscale-run admin-run; do
    gcloud secrets add-iam-policy-binding $secret \
      --member="serviceAccount:$sa@quikit-prod.iam.gserviceaccount.com" \
      --role="roles/secretmanager.secretAccessor"
  done
done

# Only quikit needs CRON_SECRET
gcloud secrets add-iam-policy-binding CRON_SECRET \
  --member="serviceAccount:quikit-run@quikit-prod.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# quikscale + admin need their OAuth client creds
# (add after super-admin generates them — see 5.3)
```

**Also grant Cloud SQL client role** so the apps can connect to Postgres:

```bash
for sa in quikit-run quikscale-run admin-run; do
  gcloud projects add-iam-policy-binding quikit-prod \
    --member="serviceAccount:$sa@quikit-prod.iam.gserviceaccount.com" \
    --role="roles/cloudsql.client"
done
```

---

## 5. First deploy — getting apps live

### 5.1 Build + push images

```bash
# From monorepo root on your laptop
GCP_REGION=asia-south1
PROJECT_ID=quikit-prod
TAG="v$(date +%Y%m%d-%H%M)"

for app in quikit quikscale admin; do
  docker buildx build \
    --platform linux/amd64 \
    -f "apps/$app/Dockerfile" \
    -t "$GCP_REGION-docker.pkg.dev/$PROJECT_ID/quikit/$app:$TAG" \
    -t "$GCP_REGION-docker.pkg.dev/$PROJECT_ID/quikit/$app:latest" \
    --push \
    .
done
```

`--platform linux/amd64` is critical if you're building on an M-series Mac — Cloud Run runs x86_64 so ARM images fail at startup.

### 5.2 Run DB migration (one-time + whenever schema changes)

Cloud SQL sits on a private IP only accessible via the VPC. Easiest path: use the Cloud SQL Proxy from your laptop:

```bash
# In one terminal
cloud-sql-proxy quikit-prod:asia-south1:quikit-db &

# In another terminal — run Prisma migrations against the proxied connection
DATABASE_URL="postgresql://quikit-app:<password>@127.0.0.1:5432/quikit?schema=public&sslmode=disable" \
DATABASE_URL_DIRECT="postgresql://quikit-app:<password>@127.0.0.1:5432/quikit?schema=public&sslmode=disable" \
  npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
```

Alternative: Cloud Build job. See `scripts/migrate-cloud-sql.sh` (add to repo when DevOps automates this).

### 5.3 Deploy quikit FIRST (it's the OAuth provider)

```bash
gcloud run deploy quikit \
  --image="$GCP_REGION-docker.pkg.dev/$PROJECT_ID/quikit/quikit:$TAG" \
  --region=$GCP_REGION \
  --platform=managed \
  --service-account="quikit-run@quikit-prod.iam.gserviceaccount.com" \
  --vpc-connector=quikit-vpc \
  --vpc-egress=private-ranges-only \
  --add-cloudsql-instances=quikit-prod:asia-south1:quikit-db \
  --allow-unauthenticated \
  --port=3000 \
  --min-instances=1 \
  --max-instances=10 \
  --cpu=1 \
  --memory=1Gi \
  --timeout=60s \
  --set-env-vars="NODE_ENV=production,NEXTAUTH_URL=https://quikit-xxx.run.app,QUIKIT_URL=https://quikit-xxx.run.app,APP_URL=https://quikit-xxx.run.app" \
  --set-secrets="NEXTAUTH_SECRET=NEXTAUTH_SECRET:latest,DATABASE_URL=DATABASE_URL:latest,DATABASE_URL_DIRECT=DATABASE_URL_DIRECT:latest,REDIS_URL=REDIS_URL:latest,CRON_SECRET=CRON_SECRET:latest,RESEND_API_KEY=RESEND_API_KEY:latest,SENTRY_DSN=SENTRY_DSN:latest,NEXT_PUBLIC_SENTRY_DSN=NEXT_PUBLIC_SENTRY_DSN:latest"
```

Capture the deployed URL (it'll be `https://quikit-xxxxxxxxxx-el.a.run.app`). Then in the super-admin UI, generate OAuth clients for `quikscale` and `admin` and save their IDs + secrets to Secret Manager as in 4.6.

### 5.4 Deploy quikscale + admin

Same `gcloud run deploy` pattern. Key differences in env vars:

```bash
# quikscale
--set-env-vars="NODE_ENV=production,NEXTAUTH_URL=https://quikscale-xxx.run.app,QUIKIT_URL=https://quikit-xxx.run.app,NEXT_PUBLIC_QUIKIT_URL=https://quikit-xxx.run.app,APP_URL=https://quikscale-xxx.run.app" \
--set-secrets="NEXTAUTH_SECRET=NEXTAUTH_SECRET:latest,DATABASE_URL=...,REDIS_URL=...,QUIKIT_CLIENT_ID=QUIKSCALE_OAUTH_CLIENT_ID:latest,QUIKIT_CLIENT_SECRET=QUIKSCALE_OAUTH_CLIENT_SECRET:latest,SENTRY_DSN=SENTRY_DSN:latest,NEXT_PUBLIC_SENTRY_DSN=NEXT_PUBLIC_SENTRY_DSN:latest"
```

Admin is analogous with `ADMIN_OAUTH_*` secrets + `APP_URL=https://admin-xxx.run.app`.

### 5.5 Wire custom domains (Cloudflare)

```bash
# Map custom domains in Cloud Run
gcloud run domain-mappings create --service=quikit    --domain=quikit.quikit.in    --region=$GCP_REGION
gcloud run domain-mappings create --service=quikscale --domain=quikscale.quikit.in --region=$GCP_REGION
gcloud run domain-mappings create --service=admin     --domain=admin.quikit.in     --region=$GCP_REGION
```

Cloud Run returns DNS records to add at Cloudflare (A/AAAA or CNAME). Add them with **proxy orange-cloud ON** to get Cloudflare CDN + DDoS in front. Cloud Run terminates TLS; Cloudflare re-terminates.

After DNS propagates (~5–15 min): update every `*_URL` env var to the real domain names + redeploy once.

---

## 6. CI/CD — Cloud Build from GitHub

### 6.1 Create the trigger

Google Cloud Console → Cloud Build → Triggers → Create:

- **Event:** push to branch
- **Branch regex:** `^main$`
- **Source:** GitHub → `ashwinsingone-pm/QuikIT`
- **Config:** inline `cloudbuild.yaml` (below) or committed at repo root

### 6.2 Minimal `cloudbuild.yaml` to commit at repo root

```yaml
steps:
  # Build + push 3 images in parallel
  - id: build-quikit
    name: gcr.io/cloud-builders/docker
    args: ["build", "-f", "apps/quikit/Dockerfile",
           "-t", "asia-south1-docker.pkg.dev/$PROJECT_ID/quikit/quikit:$SHORT_SHA",
           "-t", "asia-south1-docker.pkg.dev/$PROJECT_ID/quikit/quikit:latest",
           "."]
    waitFor: ["-"]
  - id: build-quikscale
    name: gcr.io/cloud-builders/docker
    args: ["build", "-f", "apps/quikscale/Dockerfile",
           "-t", "asia-south1-docker.pkg.dev/$PROJECT_ID/quikit/quikscale:$SHORT_SHA",
           "-t", "asia-south1-docker.pkg.dev/$PROJECT_ID/quikit/quikscale:latest",
           "."]
    waitFor: ["-"]
  - id: build-admin
    name: gcr.io/cloud-builders/docker
    args: ["build", "-f", "apps/admin/Dockerfile",
           "-t", "asia-south1-docker.pkg.dev/$PROJECT_ID/quikit/admin:$SHORT_SHA",
           "-t", "asia-south1-docker.pkg.dev/$PROJECT_ID/quikit/admin:latest",
           "."]
    waitFor: ["-"]

  # Push all
  - id: push
    name: gcr.io/cloud-builders/docker
    args: ["push", "--all-tags", "asia-south1-docker.pkg.dev/$PROJECT_ID/quikit/quikit"]
  - name: gcr.io/cloud-builders/docker
    args: ["push", "--all-tags", "asia-south1-docker.pkg.dev/$PROJECT_ID/quikit/quikscale"]
  - name: gcr.io/cloud-builders/docker
    args: ["push", "--all-tags", "asia-south1-docker.pkg.dev/$PROJECT_ID/quikit/admin"]

  # Run DB migrations (using Prisma container)
  - id: migrate
    name: asia-south1-docker.pkg.dev/$PROJECT_ID/quikit/quikit:$SHORT_SHA
    entrypoint: sh
    args: ["-c", "cd /app && npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma"]
    secretEnv: ["DATABASE_URL", "DATABASE_URL_DIRECT"]

  # Deploy 3 Cloud Run services in parallel
  - id: deploy-quikit
    name: gcr.io/cloud-builders/gcloud
    args: ["run", "deploy", "quikit",
           "--image=asia-south1-docker.pkg.dev/$PROJECT_ID/quikit/quikit:$SHORT_SHA",
           "--region=asia-south1"]
  - id: deploy-quikscale
    name: gcr.io/cloud-builders/gcloud
    args: ["run", "deploy", "quikscale",
           "--image=asia-south1-docker.pkg.dev/$PROJECT_ID/quikit/quikscale:$SHORT_SHA",
           "--region=asia-south1"]
  - id: deploy-admin
    name: gcr.io/cloud-builders/gcloud
    args: ["run", "deploy", "admin",
           "--image=asia-south1-docker.pkg.dev/$PROJECT_ID/quikit/admin:$SHORT_SHA",
           "--region=asia-south1"]

availableSecrets:
  secretManager:
    - versionName: projects/$PROJECT_ID/secrets/DATABASE_URL/versions/latest
      env: DATABASE_URL
    - versionName: projects/$PROJECT_ID/secrets/DATABASE_URL_DIRECT/versions/latest
      env: DATABASE_URL_DIRECT

timeout: 1800s   # 30 min max per build

options:
  machineType: E2_HIGHCPU_8    # faster builds for turbo
  logging: CLOUD_LOGGING_ONLY
```

Rollback on any step failure is automatic — Cloud Run keeps the previous revision serving traffic until the new one reports healthy.

### 6.3 Grant Cloud Build service account permissions

```bash
PROJECT_NUMBER=$(gcloud projects describe quikit-prod --format='value(projectNumber)')
CB_SA="$PROJECT_NUMBER@cloudbuild.gserviceaccount.com"

# Deploy to Cloud Run
gcloud projects add-iam-policy-binding quikit-prod \
  --member="serviceAccount:$CB_SA" --role="roles/run.admin"

# Assume the runtime SAs during deploy
gcloud projects add-iam-policy-binding quikit-prod \
  --member="serviceAccount:$CB_SA" --role="roles/iam.serviceAccountUser"

# Read secrets during migrate step
gcloud projects add-iam-policy-binding quikit-prod \
  --member="serviceAccount:$CB_SA" --role="roles/secretmanager.secretAccessor"
```

---

## 7. Compute Engine + Docker Compose alternative

Only if a specific customer contract requires bare-VM deployment (fully auditable OS + patch cadence). Not the default.

```bash
# 1. Create the VM (e2-standard-4 = 4 vCPU / 16 GB RAM, enough for all 3 + postgres + redis)
gcloud compute instances create quikit-vm \
  --zone=asia-south1-a \
  --machine-type=e2-standard-4 \
  --image-family=ubuntu-2404-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=100GB \
  --boot-disk-type=pd-balanced \
  --tags=http-server,https-server

# 2. SSH in
gcloud compute ssh quikit-vm --zone=asia-south1-a

# 3. Install Docker + Compose
sudo apt update && sudo apt install -y docker.io docker-compose-plugin caddy
sudo usermod -aG docker $USER
# log out and back in

# 4. Clone repo
git clone https://github.com/ashwinsingone-pm/QuikIT.git /opt/quikit
cd /opt/quikit

# 5. Create /opt/quikit/.env with prod secrets
# (copy from apps/quikscale/.env.example + fill)

# 6. Caddy reverse proxy config at /etc/caddy/Caddyfile
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
quikit.quikit.in {
  reverse_proxy localhost:3000
}
quikscale.quikit.in {
  reverse_proxy localhost:3004
}
admin.quikit.in {
  reverse_proxy localhost:3005
}
EOF
sudo systemctl reload caddy

# 7. Start
docker compose up -d --build

# 8. Run migrations once
docker compose exec -T quikit npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
```

Update flow: `git pull && docker compose up -d --build` on the VM. Keep 1-2 generations of old images tagged for rollback.

---

## 8. Environment variables — full reference

Required per app (values stored in Secret Manager unless noted):

| Variable | quikit | quikscale | admin | Notes |
|---|:-:|:-:|:-:|---|
| `NODE_ENV` | prod | prod | prod | Plain env var |
| `NEXTAUTH_SECRET` | ✅ | ✅ | ✅ | **Shared** — same value across all 3 |
| `NEXTAUTH_URL` | ✅ | ✅ | ✅ | Per-app deployed URL |
| `DATABASE_URL` | ✅ | ✅ | ✅ | Same (pooled) connection string |
| `DATABASE_URL_DIRECT` | ✅ | ✅ | ✅ | Same (unpooled) — used for migrations |
| `REDIS_URL` | ✅ | ✅ | ✅ | Same Redis |
| `QUIKIT_URL` | ✅ | ✅ | ✅ | Always points at quikit app URL |
| `NEXT_PUBLIC_QUIKIT_URL` | — | ✅ | ✅ | Client-side fallback |
| `QUIKIT_CLIENT_ID` | — | ✅ | ✅ | OAuth client id per app (different per app) |
| `QUIKIT_CLIENT_SECRET` | — | ✅ | ✅ | OAuth client secret per app |
| `APP_URL` | ✅ | ✅ | ✅ | **Each app's own URL** — used for invite + email links |
| `CRON_SECRET` | ✅ | — | — | Only quikit runs crons |
| `RESEND_API_KEY` | ✅ | ✅ | ✅ | If emails sent |
| `SENTRY_DSN` | ✅ | ✅ | ✅ | Per-app DSN |
| `NEXT_PUBLIC_SENTRY_DSN` | ✅ | ✅ | ✅ | Same as SENTRY_DSN; public var so browser-side errors report |

---

## 9. Post-deploy verification checklist

After first deploy, the DevOps team should walk through this in order. If anything fails, stop and escalate.

### 9.1 Health

```bash
curl -fsS https://quikit.quikit.in/api/auth/session          # expect {user: null, ...} + 200
curl -fsS https://quikscale.quikit.in/api/health              # 200
curl -fsS https://quikscale.quikit.in/api/health/ready        # 200 (hits DB + Redis)
curl -fsS https://admin.quikit.in/api/auth/session            # 200
```

### 9.2 OIDC discovery

```bash
curl -fsS https://quikit.quikit.in/.well-known/openid-configuration | jq .issuer
# Expect: "https://quikit.quikit.in"
```

### 9.3 Auth flow

Log into quikscale in browser → should redirect to quikit.quikit.in/login → log in → back to quikscale with session. If this works, OAuth wiring is correct.

### 9.4 Run the smoke-test harness

```bash
BASE_URL=https://quikit.quikit.in     APP=quikit     PUBLIC_ONLY=1 REQS=30 node scripts/smoke-test.mjs
BASE_URL=https://quikscale.quikit.in  APP=quikscale  PUBLIC_ONLY=1 REQS=30 node scripts/smoke-test.mjs
BASE_URL=https://admin.quikit.in      APP=admin      PUBLIC_ONLY=1 REQS=30 node scripts/smoke-test.mjs
```

All three should return 0 errors across 90 requests. See `docs/audit/PROD_SMOKE_RESULTS_*.md` for the baseline latency profile.

### 9.5 Observability

- Cloud Logging → filter `resource.type="cloud_run_revision"` → see app logs streaming live
- Sentry dashboard → trigger a test error via `/api/error-test` (don't have one? add one temporarily) — confirm it lands in Sentry within 30s
- Cloud Monitoring → Cloud Run service p95 latency should be < 1s for warm requests

---

## 10. Rollback

### Cloud Run
Every deploy creates a new revision. Traffic is 100% on the new revision by default, but old revisions stay around.

```bash
# List revisions
gcloud run revisions list --service=quikscale --region=asia-south1

# Shift 100% traffic back to the previous one
gcloud run services update-traffic quikscale \
  --to-revisions=<previous-revision-id>=100 \
  --region=asia-south1
```

Rollback takes ~30 seconds. Zero request loss (Cloud Run drains the new revision gracefully).

### DB migration rollback

Prisma migrations are **not automatically reversible**. To roll back a migration:
1. Take a Cloud SQL snapshot *before* applying the migration (automated via backup schedule).
2. If the migration breaks prod, restore the snapshot + redeploy the previous image.
3. Only do this during a maintenance window.

For additive-only migrations (new columns, new tables, new indexes), rollback is usually unnecessary — just ship a fix-forward migration.

---

## 11. Cost model (expected)

Conservative estimates for 15 trial tenants, low traffic, baseline:

| Component | Monthly ₹ |
|---|---|
| Cloud Run (3 services, `min-instances=1`, ~2M req/mo) | 4,000–8,000 |
| Cloud SQL (db-custom-2-4096, 20GB storage, zonal) | 3,500–4,500 |
| Memorystore Redis (1GB) | 1,800 |
| Artifact Registry (images < 5GB) | negligible |
| Cloud Build (30 builds/mo × ~5 min) | negligible (free tier) |
| Secret Manager | negligible (free tier) |
| Cloud Logging | ~500 (first 50GB free) |
| Egress (user traffic) | 500–1,500 |
| **Total** | **₹ 10,000– 16,000 / month** |

Once you have 50+ paying tenants: scale up Cloud SQL, consider regional HA (doubles DB cost), revisit Redis size.

---

## 12. Troubleshooting

### "Module not found: @quikit/ui" at runtime
Cause: `outputFileTracingRoot` not set in `next.config.js`, so monorepo packages weren't traced into the standalone bundle.
Fix: confirm `outputFileTracingRoot: path.join(__dirname, "../../")` is present. Rebuild image.

### "Cannot find module '.prisma/client/default'" at runtime
Cause: Prisma client wasn't regenerated for the runner stage, or the `.prisma` folder wasn't copied.
Fix: verify Dockerfile has `COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma` and `/app/node_modules/@prisma/client ./node_modules/@prisma/client`.

### Docker image > 1 GB
Cause: `output: "standalone"` missing in `next.config.js`, OR `.dockerignore` isn't being honoured (usually because you `docker build` from a subdir).
Fix: confirm `output: "standalone"` is set. Always build from monorepo root: `docker build -f apps/quikit/Dockerfile .`.

### Cloud Run startup probe fails with timeout
Cause: default startup probe hits `/` which may 302/307 redirect. Next.js takes ~3–5s to boot; the default 4s timeout can time out.
Fix: set `--timeout=60s` on deploy (done in the example). Custom startup probe: `--startup-cpu-boost --startup-probe-http-get=/api/health`.

### "Unauthorized" from all API calls
Cause: `NEXTAUTH_SECRET` is different across the 3 services. JWT signed by one can't verify on another.
Fix: confirm the same secret value is wired into all 3 Cloud Run services. Secret Manager solves this automatically.

### Migration failed mid-way
Cause: partial migration; DB in inconsistent state.
Fix: `npx prisma migrate resolve --applied <migration_name>` OR `--rolled-back <migration_name>` depending on which side of the failure. Then `migrate deploy` again.

---

## 13. What the DevOps team needs from the dev team

On day one, handoff package:

- [ ] GCP project ID + region confirmed (`quikit-prod`, `asia-south1`)
- [ ] Cloudflare zone access (DNS + orange-cloud setup)
- [ ] GitHub repo admin access (to enable Cloud Build GitHub trigger)
- [ ] NEXTAUTH_SECRET value generated (32+ random chars, base64)
- [ ] Sentry project DSN values for all 3 apps
- [ ] Resend API key
- [ ] Expected custom domain names confirmed (`quikit.quikit.in`, etc.)
- [ ] List of enterprise customers planned (for tenant-onboarding sequence)

On first successful deploy, dev side does:

- [ ] Seed super-admin user in DB
- [ ] Super-admin UI: register quikscale + admin OAuth clients
- [ ] Supply the resulting OAuth client IDs + secrets back to DevOps for Secret Manager
- [ ] Walk through smoke-test against prod URLs

---

## 14. Open questions / future work

1. **Preview deploys per PR** are lost when leaving Vercel. Cloud Run supports "tagged revisions" that can serve at a separate URL (`--tag=pr-123 → pr-123---quikscale-xxx.run.app`) — doable but adds complexity. Defer until 5+ paying customers ask.
2. **Multi-region** for future EU / US customers. Today we're single-region (`asia-south1`). Requires tenant → region pinning — see `docs/SESSION_HANDOFF_2026-04-19.md` §6 for the architecture.
3. **GKE migration** when app count ≥ 10. Don't do this preemptively.
4. **Cloud Armor** (GCP WAF) for additional DDoS / bot protection if Cloudflare proves insufficient. Current plan: Cloudflare free tier only.
5. **Automated backup verification** — Cloud SQL runs backups daily, but we should script a restore-to-staging job weekly to prove backups actually work.

---

*Last updated: 2026-04-20 · post API-call-reduction merge · aligns with docker-compose + Dockerfiles in this commit.*
