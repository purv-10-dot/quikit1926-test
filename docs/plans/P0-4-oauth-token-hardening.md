---
id: P0-4
title: Rate-limit /api/oauth/token + cache client lookup
wave: 1
priority: P0
status: Draft
owner: unassigned
created: 2026-04-17
updated: 2026-04-17
targets: [quikit]
depends_on: [P0-3]
unblocks: []
---

# P0-4 — Rate-limit `/api/oauth/token` + cache client lookup

> **TL;DR** — `POST /api/oauth/token` does a `bcrypt.compare` at cost 12 (~250 ms CPU) against the stored `client_secret`, with **no rate limit**. A handful of attacker connections can pin a lambda's CPU indefinitely and deny service. We apply the shared limiter (keyed by `client_id + IP`) at the top of the handler, add a 60-second LRU cache around the `oAuthClient.findUnique` lookup to reduce DB + bcrypt surface, and add a regression test that proves a flood of bad secrets gets 429'd fast.

---

## 1. Context

### 1.1 Evidence

**File:** `apps/quikit/app/api/oauth/token/route.ts`

- Lines 22-67: handler reads `client_id` + `client_secret` (Basic or body), calls `db.oAuthClient.findUnique`, then `bcrypt.compare(clientSecret, client.clientSecret)`.
- `bcrypt.compare` at cost 12 is **intentionally slow** (~200-300 ms per call on a Vercel lambda CPU). That's fine when you call it once per legitimate login. It's a gift to attackers when unthrottled.

**The attack shape:**
- Attacker harvests a valid `client_id` from a public OIDC-client manifest or by guessing (`quikscale`, `admin` — our client_ids are human-readable).
- Attacker sends a steady ~4 requests/sec per lambda with random wrong secrets.
- Each request pins one lambda's CPU for ~250 ms.
- 4 rps × 250 ms = 1.0 "lambda-seconds per wall-second" = effectively one lambda fully saturated per attacker process.
- At 10 concurrent attacker processes: 10 lambdas pinned. Concurrent tokens from real users queue behind or timeout.

### 1.2 The bcrypt cost choice

`bcrypt.hash(secret, 12)` was chosen for client_secret at seed time (`packages/database/prisma/seed-oauth.ts`). Cost 12 is appropriate for *password* storage where the threat is "attacker dumped the hashes, crack them offline." It's overkill for an OAuth client_secret that is:
- Long (UUID-like) and has high entropy
- Only compared at runtime, never dumped
- Only created once per OAuth client (not on every login)

**Option considered in §3:** lower cost to 10 for a 2-4× CPU reduction. Not strictly required if rate-limiting alone is enough — but worth evaluating.

### 1.3 Why it's P0

- `/api/oauth/token` is in the critical path of every SSO login across the platform.
- The attack is cheap (a few TCP connections) and effective (denies service to real users).
- P0-3 ships the limiter; this plan is where it gets applied to the actual vulnerable endpoint.

---

## 2. Goal / Non-goals

**Goal.**
1. An attacker sending >30 `/api/oauth/token` requests per minute per `(client_id, /24 IP block)` gets `HTTP 429` starting at request 31, with `bcrypt.compare` never executed for blocked requests.
2. Legitimate SSO login latency p95 does not regress (no added latency on the happy path).
3. Under a 1 000 req/s flood of bad secrets in load test, no real-user request times out.

**Non-goals.**
- Not changing the OAuth protocol semantics (authorization_code / refresh_token grant types behave identically).
- Not forcing client_secret rotation.
- Not deleting `bcrypt.compare` (it's still the verification primitive — we just throttle how often it runs).
- Not implementing circuit-breaker / progressive back-off beyond what the limiter already gives (fixed window).

---

## 3. Options considered

### Option A — Rate limit + LRU cache on client lookup (RECOMMENDED)
Apply `rateLimitAsync` at the top of the handler. Add a short-TTL in-memory LRU cache around `db.oAuthClient.findUnique` keyed by `clientId`.

- ✅ Stops the attack at the front door.
- ✅ LRU cache eliminates the DB round-trip on repeat valid-client requests.
- ⚠ LRU cache is per-lambda — tolerable because `oAuthClient` is nearly static.

### Option B — Rate limit only
Just add the limiter.

- ✅ Minimum change.
- ❌ Leaves the DB round-trip on every legitimate token request.
- **Acceptable fallback** if LRU turns out to be tricky (e.g., client_secret rotation invalidation), but §4 argues the LRU is cheap.

### Option C — Lower bcrypt cost from 12 → 10
Migrate stored hashes lazily: on next successful compare at cost-12, re-hash at cost-10 and update.

- ✅ 2-4× CPU savings on every real login.
- ❌ Requires re-hash migration path.
- ❌ Weakens secret storage, however marginally.
- **Deferred.** Revisit if CPU is still the bottleneck after A ships. For now, rate-limiting does the job without touching stored secrets.

### Option D — Constant-time pre-check against a non-bcrypt keyed hash
Store a fast HMAC-SHA256 of the client_secret alongside the bcrypt hash. Fast-path comparison first; bcrypt is the fallback for misses (which should be attackers).

- ✅ Eliminates bcrypt CPU on the happy path.
- ❌ Two places to keep in sync; schema change; complex.
- **Deferred.** Overkill for our scale.

### Option E — Pre-authenticate via mutual TLS or private_key_jwt
Modern OAuth deployments move to PKI-based client auth.

- ✅ No bcrypt at all.
- ❌ Large protocol change, affects every client app.
- **Deferred to a long-term roadmap item.**

**Chosen: Option A.** Low risk, uses P0-3 infrastructure, decisive.

---

## 4. Design

### 4.1 Rate limiter at the top of the handler

**Keys:**
- `routeKey`: `oauth:token`
- `clientKey`: `${clientId}:${ip /24 block}`
  - `clientId` keeps attackers on one client from blocking others.
  - `/24 IP block` (first three octets) bundles NATted users together while making the limiter useful against a single attacker.

**Limits:**
- 30 requests / 60 s window per `(clientId, /24)`.
- Fail-closed in production (`failClosed: process.env.NODE_ENV === "production"`).

**Key extraction:**
```ts
function ipSlash24(raw: string): string {
  // "203.0.113.42" → "203.0.113"; IPv6 → first /48 chunk; "anonymous" → "anon"
  if (!raw || raw === "anonymous") return "anon";
  const v4 = raw.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  if (v4) return v4[1]!;
  const v6 = raw.split(":").slice(0, 3).join(":");
  return v6 || raw;
}
```

**Placement:** rate limit runs **before** `db.oAuthClient.findUnique`. We don't want to spend a DB round-trip on something we'll block anyway.

### 4.2 LRU cache around client lookup

**Why:** at 10 req/s happy-path traffic, the `findUnique({ where: { clientId } })` plus the `bcrypt.compare` are the two hot hits. The DB lookup returns a row that changes only on client-secret rotation (rare). A short TTL in-memory cache lets most requests skip the DB entirely.

**Implementation choices:**
- Use `lru-cache` (small, well-tested, dep-free of peer deps).
- Cache size: 100 entries (we have ~3-5 clients; plenty of headroom for future growth).
- TTL: **60 seconds.** Bounded staleness on rotation: in the worst case, a rotated secret keeps working on one lambda's cached entry for up to 60 s. Acceptable — especially because we can emit a pub/sub invalidation if we ever need to.
- Cache **only the hashed secret + scopes**, not the whole row. Minimizes memory.

```ts
import { LRUCache } from "lru-cache";

const CLIENT_CACHE = new LRUCache<string, { clientSecret: string; scopes: string[] }>({
  max: 100,
  ttl: 60_000, // 60 s
});

async function getOAuthClient(clientId: string) {
  const cached = CLIENT_CACHE.get(clientId);
  if (cached) return cached;
  const row = await db.oAuthClient.findUnique({
    where: { clientId },
    select: { clientSecret: true, scopes: true },
  });
  if (row) CLIENT_CACHE.set(clientId, row);
  return row;
}
```

**Negative caching:** if `findUnique` returns `null` (unknown `clientId`), **do not cache the `null`**. Otherwise an attacker spraying guessed client_ids pollutes the cache. The limiter will block them anyway.

**Rotation path:** when client_secret is rotated (this is already an admin action, infrequent), we can add an optional Redis pub/sub notification later. For now, 60 s eventual consistency is acceptable for all three apps.

### 4.3 Full revised handler shape

```ts
import { rateLimitAsync, getClientIp } from "@quikit/shared/rateLimit";
import { LRUCache } from "lru-cache";

const CLIENT_CACHE = /* as above */;
function ipSlash24(raw: string): string { /* as above */ }
async function getOAuthClient(clientId: string) { /* as above */ }
const FAIL_CLOSED = process.env.NODE_ENV === "production";

export async function POST(request: NextRequest) {
  // 1. Parse params (body OR Basic header) — unchanged.
  const body = await request.formData().catch(() => null);
  const params = body
    ? Object.fromEntries(body.entries())
    : await request.json().catch(() => ({}));

  let clientId = String(params.client_id ?? "");
  let clientSecret = String(params.client_secret ?? "");
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
      const sep = decoded.indexOf(":");
      if (sep > 0) {
        clientId = clientId || decodeURIComponent(decoded.slice(0, sep));
        clientSecret = clientSecret || decodeURIComponent(decoded.slice(sep + 1));
      }
    } catch { /* malformed — let auth fail below */ }
  }

  // 2. NEW — rate limit BEFORE bcrypt + DB.
  const ipBlock = ipSlash24(getClientIp(request));
  const { ok } = await rateLimitAsync({
    routeKey: "oauth:token",
    clientKey: `${clientId || "unknown"}:${ipBlock}`,
    limit: 30,
    windowMs: 60_000,
    failClosed: FAIL_CLOSED,
  });
  if (!ok) {
    return NextResponse.json(
      { error: "too_many_requests", error_description: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  // 3. Client lookup — now through LRU (no cache for null).
  const client = await getOAuthClient(clientId);
  if (!client) {
    return NextResponse.json(
      { error: "invalid_client", error_description: "Unknown client" },
      { status: 401 },
    );
  }

  // 4. bcrypt.compare — unchanged.
  const secretValid = await bcrypt.compare(clientSecret, client.clientSecret);
  if (!secretValid) {
    return NextResponse.json(
      { error: "invalid_client", error_description: "Bad client_secret" },
      { status: 401 },
    );
  }

  // 5. Grant dispatch — unchanged.
  const grantType = String(params.grant_type ?? "");
  if (grantType === "authorization_code") return handleAuthCodeExchange(params, clientId);
  if (grantType === "refresh_token") return handleRefreshToken(params, clientId);

  return NextResponse.json(
    { error: "unsupported_grant_type" },
    { status: 400 },
  );
}
```

### 4.4 Super-admin endpoints — stretch

While we're here, wrap the most sensitive super-admin endpoints with the same limiter at lower limits (e.g., 60 req/min per user). Not blocking for this plan — track as a P2 follow-up. Mentioned here because P0-4 is the moment the limiter becomes real and we want to avoid forgetting.

---

## 5. Code changes

### 5.1 Files touched
- `apps/quikit/app/api/oauth/token/route.ts` — main changes per §4.3.
- `apps/quikit/package.json` — add `lru-cache` dependency.

### 5.2 `package.json`

```diff
 "dependencies": {
+  "lru-cache": "^10.0.0",
   ...
 }
```

### 5.3 No schema / migration changes.

---

## 6. Test plan

### 6.1 Unit / integration tests

**File:** `apps/quikit/__tests__/api/oauth-token-ratelimit.test.ts` (new).

Cases:
1. **Below limit, valid client → 200 with tokens.** Assert bcrypt was called once.
2. **Below limit, invalid client → 401, bcrypt not called, DB called once.**
3. **Below limit, valid client, wrong secret → 401, bcrypt called once.**
4. **At limit (30 requests same `(clientId, ip)` in 60 s) → 30th returns 200; 31st returns 429 with `Retry-After: 60` and **bcrypt is never called** on the 31st.**
5. **Different `clientId`s → buckets don't collide.** 30 requests as `quikscale`, then a `admin` request → the latter is not rate-limited.
6. **Different `/24` IP blocks → buckets don't collide.**
7. **LRU cache hit** — second call for the same client doesn't execute `db.oAuthClient.findUnique`. (Advance fake time by 59 s → still cached. Advance by 61 s → miss.)
8. **Null client is not cached.** Two calls with an unknown `clientId` both execute `findUnique`.
9. **Happy-path latency regression** — assert that on warm cache, no DB call is made to `oAuthClient` (via mock counter).

### 6.2 Load test

Extend `tests/load/oauth-login.js`:

```js
import http from 'k6/http';
import { check } from 'k6';
export const options = {
  scenarios: {
    bad_secret_flood: {
      executor: 'constant-arrival-rate',
      rate: 1000, timeUnit: '1s', duration: '1m',
      preAllocatedVUs: 200, maxVUs: 500,
    },
    legit_logins: {
      executor: 'constant-arrival-rate',
      rate: 5, timeUnit: '1s', duration: '1m',
      preAllocatedVUs: 10, maxVUs: 20,
    },
  },
};

export default function () {
  const r = http.post(
    'https://auth.yourco.com/api/oauth/token',
    'grant_type=authorization_code&client_id=quikscale&client_secret=WRONG&code=x&redirect_uri=https://x',
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );
  check(r, {
    'status is 429 or 401': (res) => res.status === 429 || res.status === 401,
    'not 5xx': (res) => res.status < 500,
  });
}
```

**Pass criteria:**
- Attack scenario returns 429 for > 95% of requests after warm-up.
- Legitimate login scenario (separate script / separate client_id) continues to succeed with p95 < 500 ms.

### 6.3 Manual verification (staging)

```bash
for i in $(seq 1 35); do
  curl -sS -o /dev/null -w "%{http_code}\n" \
    -u "quikscale:WRONG" \
    -X POST https://auth-uat.yourco.com/api/oauth/token \
    -d "grant_type=authorization_code&code=x&redirect_uri=https://x"
done
# Expect: twenty 401s, then 429s.
```

---

## 7. Rollback

**Trigger:** legitimate SSO logins failing with 429, OR any increase in 5xx after deploy.

**Procedure:**
- `git revert` the `token/route.ts` change; push to `main`.
- Vercel redeploys in < 3 min.
- LRU cache and rate limiter both go away; behavior returns to the pre-plan state (still vulnerable, but restores service immediately).

**Looser rollback (env-flag only):**
Add a `OAUTH_TOKEN_RATE_LIMIT_ENABLED` env flag. If set to `"false"`, the rate limit is skipped. This provides an instant kill switch without a redeploy.

```ts
if (process.env.OAUTH_TOKEN_RATE_LIMIT_ENABLED !== "false") {
  // rate limit
}
```

**Recommendation:** ship the flag. It's two lines of code and gives us an incident-time tool.

---

## 8. Risks & mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Legitimate token traffic from one client exceeds 30/min (e.g., a misconfigured service polling) | Low | Medium | Per-client limit is configurable. Alert on sustained 429s for known-good `clientId`. Raise the limit for that client via config (future work: per-client overrides). |
| R2 | NAT'd corp network has >30 distinct users hitting /api/oauth/token in a minute → all blocked | Low | Medium | Bucket is `(clientId, /24)`. One office hitting it hard is one cohort. 30/min is enough for ~60 users with normal login cadence. If a customer reports blocks, adjust. |
| R3 | LRU cache holds an old secret after rotation → rotated-out secret works for up to 60 s | Medium | Low-Medium | 60 s window is acceptable for our rotation SLA. If it isn't later, add Redis pub/sub invalidation. |
| R4 | Client-side retries amplify under 429 storms | Medium | Low | Retries should back off on 429 per RFC 6585. We emit `Retry-After: 60`. Call out in integration docs. |
| R5 | `lru-cache` memory grows unexpectedly (it won't — `max: 100`) | Very low | Low | Bounded by `max`. Monitored by container memory alerts. |
| R6 | IP extraction wrong on IaaS (Caddy behind LB) | Medium | High | Make sure Caddy / Nginx sets `X-Forwarded-For` correctly. Document during IaaS cutover. For Vercel, `request.headers.get("x-forwarded-for")` is reliable. |
| R7 | Rate limit bucket stomps on P0-3 login limit keys | Very low | Low | Different `routeKey`s (`oauth:token` vs `auth:login:*`) — no collision. |

---

## 9. Effort

| Task | Estimate |
|---|---|
| Add `lru-cache` dep + helper | 15 min |
| Rewrite `token/route.ts` per §4.3 | 45 min |
| Add env kill switch | 10 min |
| Unit + integration tests | 1.5 hr |
| Load-test additions | 45 min |
| Manual verification on uat | 20 min |
| Review + merge | 45 min |

**Total:** ~4 hours engineer time. **Calendar time:** 1 day.

**Dependency:** P0-3 must land first (this plan imports from `@quikit/shared/rateLimit`).

---

## 10. Open questions

- [ ] Per-client limit overrides (e.g., some clients legitimately need higher throughput)? _(Out of scope for P0-4; tracked as P1 follow-up.)_
- [ ] Should we consider lowering the bcrypt cost from 12 to 10? _(Evaluate after this lands; decide based on observed CPU usage.)_
- [ ] Should `/api/oauth/authorize` get the same treatment? _(Yes — tracked as a small P1 follow-up. It has less CPU cost so it's lower priority.)_

---

## 11. Sign-off

- [ ] P0-3 landed (dependency satisfied)
- [ ] Code review approved
- [ ] Unit + integration tests green
- [ ] Manual `curl` flood test: 31st request gets 429
- [ ] Load test: attack scenario ≥95% 429, legit scenario p95 < 500 ms
- [ ] Deployed to prod
- [ ] 48 h monitoring: no spike in customer SSO failures
- [ ] Env kill switch documented in runbook
- [ ] Status flipped to `✔ Done` in index

## Appendix — references
- OAuth 2.0 Section 4.1.3 (Token Endpoint): https://datatracker.ietf.org/doc/html/rfc6749#section-4.1.3
- RFC 6585 (HTTP 429): https://datatracker.ietf.org/doc/html/rfc6585
- `lru-cache` docs: https://github.com/isaacs/node-lru-cache
