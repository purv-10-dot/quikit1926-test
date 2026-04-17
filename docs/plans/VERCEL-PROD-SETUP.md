---
id: VERCEL-PROD-SETUP
title: Vercel + Neon + Upstash — Production env checklist for Wave 1 (P0)
wave: 1
priority: P0 companion
status: Draft
created: 2026-04-17
---

# Vercel + Neon + Upstash — Production Environment Checklist (Wave 1)

**Purpose.** Everything that has to exist on your infrastructure for the Wave 1 P0 changes (docs/plans/P0-{1..4}-*.md) to actually engage in production. If any row is missing, that P0 item silently degrades — the code is still safe but the protection it adds is disabled.

**Scope.** Narrow. This doc covers only the env vars needed to activate the Wave 1 P0 work plus the known-latent localhost fallbacks those changes touch. It does NOT cover the full IaaS migration (that's `docs/architecture/10k-users-iaas-rollout.md`).

---

## 0. Prerequisites — accounts & resources

| # | Resource | How to create |
|---|---|---|
| 0.1 | **Neon Postgres project** | neon.tech → new project in the region closest to your Vercel deploy (probably us-east-1). Enable the **pooler** in the project settings. |
| 0.2 | **Upstash Redis database** | upstash.com → Redis → new database. **Enable TLS.** Region matching Vercel. |
| 0.3 | **Vercel projects** (already exist) | `quik-it`, `quikscale`, `quik-it-admin` |
| 0.4 | **A new RSA 2048 keypair** for the IdP | `openssl genpkey -algorithm RSA -out /tmp/p.pem -pkeyopt rsa_keygen_bits:2048 && openssl rsa -in /tmp/p.pem -pubout -out /tmp/pub.pem`. **Do not reuse the dev keypair.** |

---

## 1. Neon connection strings — both URLs

Open the Neon dashboard → your project → **Connection Details**. You'll see two hostnames:

- **Pooler hostname** — has `-pooler` in it, e.g. `ep-cool-cake-12345-pooler.us-east-1.aws.neon.tech`.
- **Direct hostname** — the same name without `-pooler`, e.g. `ep-cool-cake-12345.us-east-1.aws.neon.tech`.

Construct the two URLs your apps need:

**`DATABASE_URL`** (runtime — pooler, transaction mode):
```
postgres://<user>:<password>@<POOLER_HOSTNAME>/<db>?sslmode=require&pgbouncer=true&connection_limit=1&pool_timeout=10
```

**`DATABASE_URL_DIRECT`** (migrations only — direct):
```
postgres://<user>:<password>@<DIRECT_HOSTNAME>/<db>?sslmode=require
```

**Why both?** PgBouncer in transaction mode breaks Prisma migrations (advisory locks). Prisma automatically reads `DATABASE_URL_DIRECT` from `schema.prisma`'s `directUrl` for `prisma migrate` / `db push`; runtime uses the pooled `DATABASE_URL`. See `docs/plans/P0-1-db-connection-pooling.md`.

**Why `connection_limit=1`?** Each Vercel lambda holds only 1 connection to the pooler; the pooler multiplexes across its own small backend pool. Without this, each lambda opens 5 connections to Neon, multiplying by the warm lambda count.

**Smoke test** (from your laptop):
```bash
psql "postgres://<user>:<password>@<DIRECT_HOSTNAME>/<db>?sslmode=require" -c "SELECT 1"
psql "postgres://<user>:<password>@<POOLER_HOSTNAME>/<db>?sslmode=require" -c "SELECT 1"
```
If either fails, fix that before touching Vercel.

---

## 2. Upstash Redis connection string

Upstash dashboard → your database → **Connect** tab → copy the **TLS (rediss://)** URL:

```
rediss://default:<password>@<host>.upstash.io:<port>
```

**Smoke test:**
```bash
redis-cli -u "rediss://default:<password>@<host>.upstash.io:<port>" PING
# Expect: PONG
```

---

## 3. Env var matrix — per Vercel project

Set these in **Settings → Environment Variables** on each Vercel project. All three environments (Production, Preview, Development) need them unless noted.

### 3.1 `quik-it` (IdP) project

| Var | Value | Scope | Why | P0 item |
|---|---|---|---|---|
| `DATABASE_URL` | Neon pooler URL (§1) | Prod + Preview | Connection pool fix | P0-1 |
| `DATABASE_URL_DIRECT` | Neon direct URL (§1) | Prod + Preview | Migrations | P0-1 |
| `REDIS_URL` | Upstash TLS URL (§2) | Prod + Preview | Distributed rate limiter; without this, P0-3 falls open per lambda | P0-3 |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` — **UNIQUE, do not reuse dev** | All | NextAuth signs its session cookie with this | existing |
| `NEXTAUTH_URL` | `https://quik-it-auth.vercel.app` | Prod | **REQUIRED in prod.** Becomes the OIDC `iss` claim on every id_token; missing = build-time or first-request error (by design — silent localhost fallback removed in P0 prod pass) | existing + prod pass |
| `JWT_SIGNING_KEY` | Private PEM from §0.4 | Prod + Preview | Persistent RSA key so id_tokens signed on Lambda A verify against the JWKS served by Lambda B | existing |
| `JWT_SIGNING_KEY_PUBLIC` | Public PEM from §0.4 (must be from same pair) | Prod + Preview | Served at `/api/oauth/jwks` | existing |
| `OAUTH_TOKEN_RATE_LIMIT_ENABLED` | _(leave unset — defaults to enabled)_ | — | Kill switch; set to `"false"` only during incident response | P0-4 |
| `QUIKSCALE_URL` | `https://quikscale.vercel.app` | All | Used by `/apps` launcher to link out | existing |
| `ADMIN_URL` | `https://quik-it-admin.vercel.app` | All | Same | existing |

**PEM formatting note:** Vercel's env-var UI often strips or escapes newlines. `apps/quikit/lib/oauth.ts::normalizePem` accepts four shapes: full PEM with real newlines, full PEM with literal `\n` escapes, base64-encoded full PEM, or the bare base64 body (no markers). **Easiest path:** paste the bare base64 body (the stuff between `-----BEGIN ...-----` and `-----END ...-----`, with all newlines removed). `normalizePem` wraps it.

### 3.2 `quikscale` project

| Var | Value | Scope | Why | P0 item |
|---|---|---|---|---|
| `DATABASE_URL` | **Same Neon pooler URL** as quik-it (shared DB) | Prod + Preview | Connection pool fix | P0-1 |
| `DATABASE_URL_DIRECT` | Same Neon direct URL | Prod + Preview | Migrations | P0-1 |
| `REDIS_URL` | **Same** Upstash URL as quik-it (shared rate-limit namespace) | Prod + Preview | Distributed login limiter (P0-3) also runs here in SSO mode | P0-3 |
| `NEXTAUTH_SECRET` | Unique value (different from quik-it's) | All | Signs this app's session cookie | existing |
| `NEXTAUTH_URL` | `https://quikscale.vercel.app` | Prod | Required for NextAuth in prod | existing |
| `QUIKIT_URL` | `https://quik-it-auth.vercel.app` | Prod + Preview | Server-side OIDC discovery | existing |
| `NEXT_PUBLIC_QUIKIT_URL` | `https://quik-it-auth.vercel.app` | Prod + Preview | Client-side fallback for signIn + AppSwitcher | existing |
| `QUIKIT_CLIENT_ID` | `quikscale` | Prod + Preview | OAuth client id | existing |
| `QUIKIT_CLIENT_SECRET` | The plain-text secret seeded into `OAuthClient.clientSecret` (bcrypt-hashed server side) | Prod + Preview | | existing |

### 3.3 `quik-it-admin` project

Same as quikscale §3.2 but:
- `NEXTAUTH_URL="https://quik-it-admin.vercel.app"`
- `QUIKIT_CLIENT_ID="admin"`
- `QUIKIT_CLIENT_SECRET` is the admin-specific plaintext

---

## 4. Apply Wave 1 migrations against Neon

Wave 1 itself does not introduce schema changes (the `directUrl` in `schema.prisma` is a runtime-wiring change, not a migration). But before merging `feature/p0-remediation`, verify from your laptop:

```bash
# Use the DIRECT URL for migration tooling.
DATABASE_URL="<direct_url>" npx prisma migrate status
```

Expect: "Database schema is up to date". If it reports drift, resolve before deploying.

---

## 5. Deployment order

Once env vars are set and CI is green:

```
feature/p0-remediation  →  dev    (auto-deploys Preview on Vercel — test there first)
                        →  uat    (Vercel Preview with uat-specific env)
                        →  main   (Production)
```

**Per environment, verify:**

1. `GET https://<host>/api/health` returns 200.
2. `GET https://quik-it-auth.vercel.app/.well-known/openid-configuration` returns 200 with `"issuer":"https://quik-it-auth.vercel.app"` (NOT `http://localhost:3000` — if you see localhost here, `NEXTAUTH_URL` is unset on quik-it).
3. `GET https://quik-it-auth.vercel.app/api/oauth/jwks` returns a JWK with `kid: "quikit-1"`.
4. Sign in from quikscale end-to-end. Successful landing on `/dashboard` confirms P0-1 (pool), P0-3 (limiter), and P0-4 (token hardening) all engaged without blocking real traffic.
5. Redis check:
   ```bash
   redis-cli -u "$REDIS_URL" KEYS "rl:*"
   # After a couple of logins you should see keys like:
   #   rl:auth:login:email|someone@example.com:<windowStart>
   #   rl:oauth:token|quikscale:<ip /24>:<windowStart>
   ```
   If you see zero keys, the limiter is running in in-memory fallback mode — re-check `REDIS_URL` is set on the right project + environment.

---

## 6. Rollback surfaces (in order of cost)

| Scenario | Mitigation |
|---|---|
| Real users getting 429'd on login | `OAUTH_TOKEN_RATE_LIMIT_ENABLED=false` on quik-it, redeploy (no rebuild needed) |
| Connection-pool timeouts | Flip `DATABASE_URL` back to the direct URL on the affected project. Reverts P0-1 but app still works; re-expose to pool exhaustion. |
| Redis outage + fail-closed blocking legit logins | Either fix Redis, or as a last resort deploy a commit that flips `FAIL_CLOSED` to `false` in `packages/auth/index.ts`. Prefer fixing Redis. |
| OIDC callback broken | Check `/.well-known/openid-configuration` issuer. If wrong, fix `NEXTAUTH_URL` on quik-it. Then rotate signing keys only if keys are the root cause (usually not). |

---

## 7. Known latent localhost fallbacks (not covered in this pass)

`docs/plans/VERCEL-PROD-SETUP.md` fixes the one inside `apps/quikit/lib/oauth.ts`. Others remain — they were out of Wave 1 scope and should be addressed in Wave 2 or as a small companion PR:

| File | Risk | Suggested fix |
|---|---|---|
| `apps/quikit/lib/email.ts:26` | Emails sent from prod could carry localhost links if `NEXTAUTH_URL` unset | Same `requireEnv` pattern as P0 prod pass |
| `apps/admin/lib/email.ts:12` | Same | Same |
| `packages/shared/lib/email.ts:12` | Same | Same |
| `apps/admin/app/(auth)/login/page.tsx:40` | Client-side "Go to QuikIT Login" fallback to localhost on error | Drop fallback; link to `/login` (same-origin bounce) |
| `apps/quikscale/app/(auth)/login/page.tsx:41` | Same | Same |
| `packages/database/prisma/seed-oauth.ts:23,30,39,46` | Seeded `baseUrl` / `redirectUris` default to localhost — if re-seeded in prod, AppSwitcher tiles point at localhost | Require env vars when `NODE_ENV === "production"` |

Track as `P1-5 — Remove remaining localhost fallbacks in runtime paths`.

---

## 8. Final checklist (print + tick)

Before calling Wave 1 "live in prod":

- [ ] Neon project exists, pooler enabled, both hostnames noted
- [ ] Upstash Redis exists, TLS enabled, URL noted
- [ ] RSA keypair generated for IdP (new — not reused from dev)
- [ ] quik-it Vercel env: all 9 vars in §3.1 set for Production
- [ ] quikscale Vercel env: all 9 vars in §3.2 set for Production
- [ ] quik-it-admin Vercel env: equivalents from §3.3 set for Production
- [ ] `prisma migrate status` against Neon direct URL reports "up to date"
- [ ] Deployed quik-it; `/.well-known/openid-configuration` issuer is the prod URL (NOT localhost)
- [ ] Deployed quikscale; end-to-end SSO login works
- [ ] Redis shows `rl:*` keys after a couple of logins
- [ ] 48-hour burn-in clean; update plan statuses to `✔ Done` in `docs/plans/README.md`
