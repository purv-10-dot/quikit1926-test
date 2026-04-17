---
id: P0-3
title: Promote Redis rate limiter to shared package; wire into IdP login
wave: 1
priority: P0
status: Draft
owner: unassigned
created: 2026-04-17
updated: 2026-04-17
targets: [quikit, quikscale, admin, packages/auth, packages/shared]
depends_on: []
unblocks: [P0-4]
---

# P0-3 — Promote Redis rate limiter to a shared package; wire into IdP login

> **TL;DR** — A working Redis-backed rate limiter already exists at `apps/quikscale/lib/api/rateLimit.ts` (with `@quikit/redis` as its store). The IdP login flow (`packages/auth/index.ts:20-39`) still uses a standalone in-memory `Map` that is bypassable across lambdas. We move the limiter into `@quikit/shared/rateLimit`, replace the in-memory `Map` with a call to the shared async limiter, and gate all auth + super-admin routes on it. The building blocks exist; the work is packaging and wiring.

---

## 1. Context

### 1.1 Evidence

**The problem:** `packages/auth/index.ts:20-39`

```ts
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_RATE_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function checkLoginRateLimit(email: string): boolean {
  const now = Date.now();
  const key = email.toLowerCase();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= LOGIN_RATE_LIMIT;
}
```

On Vercel, each lambda has its own `Map`. An attacker spraying across warm lambdas gets `5 × N` attempts where `N` = number of lambdas answering login requests (realistically 5-50). Effectively no rate limit above single-digit concurrency.

**The good news:** A working solution already lives at `apps/quikscale/lib/api/rateLimit.ts`. It exports:
- `rateLimit()` — sync, in-memory (dev)
- `rateLimitAsync()` — uses Redis when `REDIS_URL` is set, falls back to in-memory otherwise
- `getClientIp(request)` — X-Forwarded-For / X-Real-IP extractor
- `LIMITS` presets for `login`, `kpiWrite`, `mutation`

And `@quikit/redis` (`packages/redis/index.ts`) exposes `getRedis()` — a lazy singleton ioredis client.

**Why it's not doing the job yet:**
- It lives inside `apps/quikscale/lib/api/` — not importable from `packages/auth`.
- The IdP login (used by quikit for direct login + OAuth's indirect login) doesn't call it.
- OAuth token endpoint (see P0-4) also doesn't call it.
- Super-admin routes don't call it.

### 1.2 What triggers the failure mode

- **Credential stuffing.** Attacker tries thousands of `(email, password)` combos.
  Without distributed rate limiting, each lambda happily serves 5 attempts before blocking → in practice, thousands of attempts fly through.
- **Targeted password guessing** on a known email. Same as above.
- **Brute-force of OAuth `client_secret`** on `/api/oauth/token` (P0-4).

### 1.3 Why it's P0

This ships together with P0-4 (token hardening). P0-4 wires *the same* limiter into `/api/oauth/token`. P0-3 is the enabling work; P0-4 is the application.

---

## 2. Goal / Non-goals

**Goal.** A single `rateLimitAsync` implementation, callable from every app and from `packages/auth`. With `REDIS_URL` set, all counters are durable across lambdas/VMs. With it unset (local dev), it falls back to in-memory so tests work without infra. The IdP `CredentialsProvider.authorize()` uses it, with a sane per-email and per-IP cap.

**Non-goals.**
- Not rewriting the limiter algorithm (fixed-window stays).
- Not adding sliding-window or leaky-bucket variants.
- Not changing limits on existing quikscale routes that already use `rateLimitAsync`.
- Not deciding the Redis host (captured as a cross-cutting decision in the plans index).
- Not wiring into `/api/oauth/token` — that is **P0-4**; this plan makes it possible.

---

## 3. Options considered

### Option A — Move the file verbatim into `@quikit/shared/rateLimit` (RECOMMENDED)
Lift-and-shift. Drop `apps/quikscale/lib/api/rateLimit.ts` → `packages/shared/rateLimit.ts`. Update quikscale imports. Use from `packages/auth`.

- ✅ Minimum new code.
- ✅ Existing quikscale tests continue to cover the algorithm.
- ✅ `@quikit/redis` already exists — no new package.
- ⚠ `packages/shared` dependencies must now include `@quikit/redis` (they currently don't — need to audit).

### Option B — Leave the file in quikscale; reach across with a weird import path
- ❌ Breaks the monorepo package contract.
- ❌ Can't have `packages/auth` depend on `apps/quikscale`.
- **Rejected.**

### Option C — Rewrite as a Middleware that wraps handlers
A higher-order `withRateLimit(routeKey, limits)(handler)` wrapper.

- ✅ Cleaner call sites.
- ❌ Doesn't help inside NextAuth `CredentialsProvider.authorize()` — that's not a route handler, so you can't wrap it.
- ❌ Larger refactor than needed right now.
- **Deferred.** Could layer on later.

### Option D — Use a managed service (Upstash Ratelimit SDK)
- ✅ Zero code for us; well-tested.
- ❌ Vendor lock-in.
- ❌ We already have the algorithm working.
- **Deferred.** Revisit if we pick Upstash as the Redis host.

**Chosen: Option A.**

---

## 4. Design

### 4.1 New module location

```
packages/shared/
├── package.json              (add dependency on @quikit/redis)
├── index.ts                  (export * from "./rateLimit")
├── pagination.ts             (existing)
└── rateLimit.ts              (moved from apps/quikscale/lib/api/rateLimit.ts)
```

### 4.2 Consumer wiring

**`packages/auth/index.ts` replaces the in-memory `Map`:**

Before (lines 20-39):
```ts
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_RATE_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function checkLoginRateLimit(email: string): boolean { … }
function resetLoginRateLimit(email: string): void { … }
```

After:
```ts
import { rateLimitAsync } from "@quikit/shared/rateLimit";
// no local state; no resetLoginRateLimit (rate buckets expire naturally)
```

**Inside `authorize(credentials)`:**

Before (lines 55-58):
```ts
if (!checkLoginRateLimit(credentials.email)) {
  throw new Error("Too many login attempts. Please try again in 15 minutes.");
}
```

After:
```ts
const emailKey = String(credentials.email).toLowerCase();
const { ok } = await rateLimitAsync({
  routeKey: "auth:login:email",
  clientKey: emailKey,
  limit: 5,
  windowMs: 15 * 60 * 1000,
});
if (!ok) {
  throw new Error("Too many login attempts. Please try again in 15 minutes.");
}
```

**Remove the `resetLoginRateLimit` call on success.** Unlike the old `Map`, rate buckets can't be force-reset from outside Redis. A successful login doesn't need to reset anyway — subsequent attempts are already within the same window count, which is fine.

### 4.3 IP-based secondary limiter

Add a second check using the caller IP, because email-keyed limits don't stop credential stuffing across many emails from one IP.

**Inside `authorize(credentials, req)`:**
```ts
// NextAuth passes `req` as the second arg to authorize()
const ip = getClientIp(req);
const ipResult = await rateLimitAsync({
  routeKey: "auth:login:ip",
  clientKey: ip,
  limit: 20,                    // 20 attempts / 15 min across all emails from one IP
  windowMs: 15 * 60 * 1000,
});
if (!ipResult.ok) {
  throw new Error("Too many login attempts from this IP. Try again later.");
}
```

**IP extraction nuance for NextAuth:** The `req` passed to `authorize()` has a `headers` object but it's `IncomingHttpHeaders`, not a `Headers`-instance. We adapt our `getClientIp()` to accept `{ headers: Record<string, string | string[] | undefined> }`. One-line helper in `packages/auth/index.ts`:
```ts
function nextAuthIp(req: { headers?: Record<string, string | string[] | undefined> } | undefined): string {
  const h = req?.headers ?? {};
  const xff = h["x-forwarded-for"];
  const ipStr = Array.isArray(xff) ? xff[0] : xff;
  if (ipStr) return String(ipStr).split(",")[0]!.trim();
  const real = h["x-real-ip"];
  if (real) return Array.isArray(real) ? real[0]! : String(real);
  return "anonymous";
}
```

(We keep `getClientIp` in `@quikit/shared/rateLimit` for `Headers`-instance callers — route handlers, super-admin endpoints.)

### 4.4 Fail-open vs fail-closed policy

**Decision (recommended):** **fail-closed on auth, fail-open on everything else.**

Current `rateLimitAsync` fails open unconditionally — on Redis error, it falls through to in-memory. That's correct for UX on non-auth routes. For auth-specific limits, we want the opposite: if Redis is down AND in-memory returns `ok` for a fresh lambda, we should block rather than serve unlimited attempts.

Implementation:
```ts
// in packages/auth/index.ts authorize()
const { ok, redisAvailable } = await rateLimitAsync({ /* … */, failClosed: true });
```

This requires a small extension to `rateLimitAsync`:
```ts
// in rateLimit.ts
export async function rateLimitAsync(
  opts: Omit<RateLimitOptions, "store"> & { failClosed?: boolean },
): Promise<RateLimitResult & { redisAvailable: boolean }> {
  const redis = getRedis();
  if (!redis) {
    if (opts.failClosed) {
      // No Redis AND caller wants fail-closed semantics → block.
      return { ok: false, remaining: 0, resetAt: 0, retryAfterSeconds: 60, redisAvailable: false };
    }
    return { ...rateLimit(opts), redisAvailable: false };
  }
  // … existing Redis path, plus redisAvailable: true …
}
```

**Caveat:** in local dev (no Redis), `failClosed: true` would block every login attempt. Guard behind env:
```ts
failClosed: process.env.NODE_ENV === "production"
```

So: **prod = fail-closed, dev = fail-open.** Dev loss of rate-limiting is acceptable.

### 4.5 Migration of existing quikscale callers

Currently:
```ts
import { rateLimitAsync } from "@/lib/api/rateLimit";
```

Becomes:
```ts
import { rateLimitAsync } from "@quikit/shared/rateLimit";
```

Files to update (from audit notes):
- `apps/quikscale/app/api/session/validate/route.ts`
- `apps/quikscale/app/api/kpi/route.ts`
- `apps/quikscale/app/api/priority/route.ts`
- `apps/quikscale/app/api/performance/goals/route.ts`
- Any other that imports from `@/lib/api/rateLimit` (re-grep at implementation time).

Keep `apps/quikscale/lib/api/rateLimit.ts` as a thin re-export shim for one release (~1 week), then delete:
```ts
// apps/quikscale/lib/api/rateLimit.ts
export * from "@quikit/shared/rateLimit";
```

---

## 5. Code changes (diff sketch)

### 5.1 `packages/shared/package.json`

```diff
 {
   "name": "@quikit/shared",
   "version": "0.0.0",
   "main": "./index.ts",
   "types": "./index.ts",
   "dependencies": {
+    "@quikit/redis": "*"
   }
 }
```

### 5.2 `packages/shared/index.ts`

```diff
 export * from "./pagination";
+export * from "./rateLimit";
```

### 5.3 `packages/shared/rateLimit.ts` — new file
Lift-and-shift of `apps/quikscale/lib/api/rateLimit.ts` verbatim, with:
- `failClosed` option added to `rateLimitAsync` (per §4.4).
- `redisAvailable` added to `RateLimitResult` (optional; existing callers ignore it).

### 5.4 `apps/quikscale/lib/api/rateLimit.ts`

```ts
// Deprecated — use @quikit/shared/rateLimit directly.
// Kept for one release cycle to avoid a big-bang import rewrite.
export * from "@quikit/shared/rateLimit";
```

### 5.5 `packages/auth/index.ts`

```diff
-// Simple in-memory rate limiter for login attempts (per email)
-const loginAttempts = new Map<string, { count: number; resetAt: number }>();
-const LOGIN_RATE_LIMIT = 5;
-const LOGIN_WINDOW_MS = 15 * 60 * 1000;
-
-function checkLoginRateLimit(email: string): boolean { /* …in-memory… */ }
-function resetLoginRateLimit(email: string): void { /* … */ }
+import { rateLimitAsync } from "@quikit/shared/rateLimit";
+
+function nextAuthIp(req: { headers?: Record<string, string | string[] | undefined> } | undefined): string {
+  /* as in §4.3 */
+}
+
+const FAIL_CLOSED = process.env.NODE_ENV === "production";
```

Inside `authorize(credentials, req)`:

```diff
-if (!checkLoginRateLimit(credentials.email)) {
-  throw new Error("Too many login attempts. Please try again in 15 minutes.");
-}
+const emailKey = String(credentials.email).toLowerCase();
+const emailRL = await rateLimitAsync({
+  routeKey: "auth:login:email",
+  clientKey: emailKey,
+  limit: 5,
+  windowMs: 15 * 60 * 1000,
+  failClosed: FAIL_CLOSED,
+});
+if (!emailRL.ok) {
+  throw new Error("Too many login attempts. Please try again in 15 minutes.");
+}
+
+const ipRL = await rateLimitAsync({
+  routeKey: "auth:login:ip",
+  clientKey: nextAuthIp(req),
+  limit: 20,
+  windowMs: 15 * 60 * 1000,
+  failClosed: FAIL_CLOSED,
+});
+if (!ipRL.ok) {
+  throw new Error("Too many login attempts from this IP. Try again later.");
+}
```

Remove the two `resetLoginRateLimit(credentials.email)` call sites (around line 78) — the in-memory reset helper is deleted.

### 5.6 Turbo pipeline

`@quikit/shared` now depends on `@quikit/redis`. Update `turbo.json` build/test deps if not inferred automatically (turbo usually handles this via `package.json`).

---

## 6. Test plan

### 6.1 Unit tests

**File:** `packages/shared/__tests__/rateLimit.test.ts` (lift from `apps/quikscale/__tests__` if present; else new).

Cases (Redis mocked via in-memory fallback):
1. Below limit → `{ ok: true }`, count increments.
2. At limit → `{ ok: true, remaining: 0 }`.
3. Above limit → `{ ok: false }`.
4. Window rolls over → counter resets.
5. `failClosed: true` with no Redis configured → `{ ok: false, redisAvailable: false }`.
6. `failClosed: false` with no Redis → fallback to in-memory behavior.
7. Different `routeKey`s keyed by same `clientKey` do not collide.

### 6.2 Integration test — `packages/auth`

**File:** `packages/auth/__tests__/login-rate-limit.test.ts` (new).

Env: node + mocked Prisma + `setSession` helper. `REDIS_URL` unset so in-memory fallback; set `NODE_ENV=test` so `failClosed` is false for dev-style behavior.

Cases:
1. 5 authorize() attempts with wrong password → all return "Invalid credentials" with 5th incrementing the counter.
2. 6th attempt → throws "Too many login attempts."
3. IP-based limit: 20 attempts across 20 different emails from same IP → 21st blocked.
4. With `NODE_ENV=production` and no Redis → first attempt throws "Too many login attempts" (fail-closed).

### 6.3 Manual verification (staging)

- From one IP, attempt 6 wrong passwords on the same email → 6th blocked.
- From one IP, attempt 21 wrong passwords spread across 21 emails → 21st blocked.
- With `REDIS_URL` set, verify keys exist in Redis: `KEYS rl:auth:login:*`.

### 6.4 Load test

Extend `tests/load/oauth-login.js` (from P0-1) with a rate-limit scenario: 1 000 requests / second with the same email. Expect 99%+ of them to return HTTP 401 with "Too many login attempts." No 5xx.

---

## 7. Rollback

**Trigger:** legitimate users blocked from logging in at a rate that exceeds baseline.

**Procedure:**
1. Flip `REDIS_URL` env var off (remove it) in Vercel for the affected app. App falls back to in-memory, which is bypassable but never blocks a real user.
2. Redeploy.
3. Longer-term: revert the `packages/auth/index.ts` change if needed — branch + PR.

**Rollback time:** < 5 minutes for the env-var flip; < 15 minutes for a full revert.

---

## 8. Risks & mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Redis outage in prod + `failClosed: true` → every login fails | Low | High | Fail-closed is opinionated; we accept the trade (better than letting attackers through). Monitor Redis availability; page on outage. |
| R2 | Legitimate user triggers IP limit (office NAT with 50 people behind one IP) | Medium | Medium | IP limit at 20/15min. For heavy shared-IP customers, either raise limit or add allow-list. Add an alert on `ip-limit-blocked` rate; tune if noisy. |
| R3 | Attacker uses `X-Forwarded-For` spoofing | Medium | Low | Trust only the first IP in the XFF chain + rely on Caddy/Vercel to strip client-provided XFF and set its own. Document this in the reverse-proxy config when we move to IaaS. |
| R4 | NextAuth `req` signature changes between versions, breaking `nextAuthIp()` | Low | Medium | Type-guard inside `nextAuthIp`; test covers it. Pin next-auth version. |
| R5 | `packages/shared` circular dep with `packages/auth` | Low | Medium | Only `packages/auth` imports from `packages/shared`, not vice versa — no cycle. Validate at compile time (`npx turbo typecheck`). |
| R6 | The stale `apps/quikscale/lib/api/rateLimit.ts` shim gets forgotten | High | Low | Create a tracking issue: "Remove quikscale rateLimit shim after P0-3 ships"; set a calendar reminder 7 days post-merge. |
| R7 | `REDIS_URL` typo somewhere → one app silently falls back to in-memory | Medium | High | `/api/health/ready` already checks Redis. Add an integration test assertion: on boot, log a WARN if `REDIS_URL` unset and `NODE_ENV === "production"`. |

---

## 9. Effort

| Task | Estimate |
|---|---|
| Create `packages/shared/rateLimit.ts` (move + `failClosed` extension) | 45 min |
| Update quikscale imports | 15 min |
| Rewrite `packages/auth/index.ts` rate-limit block | 45 min |
| Unit tests (new + moved) | 1 hr |
| Integration test for `packages/auth` | 1 hr |
| Provision Redis (if not already) + set `REDIS_URL` on all 3 apps × 3 envs | 30 min |
| Manual verification on uat | 30 min |
| Review + merge | 45 min |

**Total:** ~5 hours engineer time. **Calendar time:** 1-2 days (depends on Redis provisioning).

---

## 10. Open questions

- [ ] Which Redis host? _(Cross-cutting decision in index §5.)_
- [ ] Do we want a visible `Retry-After` header on 429s from non-auth routes? _(Recommendation: yes, but it's a separate P1.)_
- [ ] Allow-list IPs (e.g., corp NAT, known crawlers)? _(Recommendation: out of scope; add as a separate plan if we start blocking real users.)_
- [ ] Metric export — should the limiter emit a counter to `/metrics` per block? _(Recommendation: yes, layered in P2-3.)_

---

## 11. Sign-off

- [ ] Redis host chosen & `REDIS_URL` configured in all 9 env slots
- [ ] Code review approved
- [ ] Unit + integration tests green
- [ ] Manual 5-wrong-password → 6th-blocked verified on uat
- [ ] Deployed to prod
- [ ] 48 h monitoring: no spike in legitimate-user login failures
- [ ] Quikscale shim deleted after 7 days
- [ ] Status flipped to `✔ Done` in index

## Appendix — references
- Existing limiter: `apps/quikscale/lib/api/rateLimit.ts`
- Redis client: `packages/redis/index.ts` (`getRedis()`)
- NextAuth `authorize()` `req` param: https://next-auth.js.org/configuration/providers/credentials#the-authorize-function
