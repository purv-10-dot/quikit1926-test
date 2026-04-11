/**
 * In-memory rate limiter (fixed-window counter).
 *
 * §7 item 3 in code-analysis-full.md flagged "rate limiting completely
 * absent". This module provides a pluggable synchronous limiter that
 * requires zero infrastructure — it lives in process memory and is safe
 * for the current single-node Next.js deployment. When the app moves to
 * multi-region / multi-instance, replace `MemoryRateLimitStore` with a
 * Redis/Upstash adapter that implements the same `RateLimitStore` contract.
 *
 * Strategy: fixed-window counter keyed on `(routeKey, clientKey)`.
 * - `routeKey` identifies the endpoint (e.g. `"login"`, `"kpi:create"`)
 * - `clientKey` identifies the caller (IP for unauth routes, userId for
 *   authed routes)
 * - `limit` = max hits allowed per window
 * - `windowMs` = window length in milliseconds
 *
 * Returns `{ ok, remaining, resetAt, retryAfterSeconds }`. Callers decide
 * whether to return 429 or another response; this keeps the limiter
 * framework-agnostic.
 */

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export interface RateLimitStore {
  /** Increment and return the current count for `(key, windowStart)`. */
  hit(key: string, windowStart: number, ttlMs: number): number;
}

/** Default in-memory store. Not suitable for multi-instance deployments. */
export class MemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, { count: number; expiresAt: number }>();
  private lastSweep = 0;

  hit(key: string, windowStart: number, ttlMs: number): number {
    const now = Date.now();
    this.maybeSweep(now);
    const bucketKey = `${key}:${windowStart}`;
    const existing = this.buckets.get(bucketKey);
    if (existing && existing.expiresAt > now) {
      existing.count += 1;
      return existing.count;
    }
    this.buckets.set(bucketKey, { count: 1, expiresAt: now + ttlMs });
    return 1;
  }

  /** Lazy cleanup every 60 s so the map does not grow unbounded. */
  private maybeSweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [k, v] of this.buckets.entries()) {
      if (v.expiresAt <= now) this.buckets.delete(k);
    }
  }

  /** For tests. */
  reset(): void {
    this.buckets.clear();
    this.lastSweep = 0;
  }
}

const DEFAULT_STORE = new MemoryRateLimitStore();

export interface RateLimitOptions {
  /** Logical endpoint name ("login", "kpi:create", …). */
  routeKey: string;
  /** Per-caller identifier. Use IP for unauth routes, userId for authed. */
  clientKey: string;
  /** Max requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Optional store override — defaults to the process-wide memory store. */
  store?: RateLimitStore;
}

/**
 * Check and record a rate-limited hit.
 *
 * Returns `{ ok: true }` if the call is allowed, `{ ok: false }` if the
 * limit has been exceeded for the current window.
 */
export function rateLimit(opts: RateLimitOptions): RateLimitResult {
  const { routeKey, clientKey, limit, windowMs, store = DEFAULT_STORE } = opts;
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;

  const key = `${routeKey}|${clientKey}`;
  const count = store.hit(key, windowStart, windowMs);

  const remaining = Math.max(0, limit - count);
  const ok = count <= limit;
  const retryAfterSeconds = Math.max(0, Math.ceil((resetAt - now) / 1000));

  return { ok, remaining, resetAt, retryAfterSeconds };
}

/**
 * Extract a best-effort client IP from a Next.js request. Falls back to
 * `"anonymous"` if no forwardable header is available — which is still
 * useful because it rate-limits the whole unknown-IP population together.
 */
export function getClientIp(request: {
  headers: { get(name: string): string | null };
}): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const xreal = request.headers.get("x-real-ip");
  if (xreal) return xreal.trim();
  return "anonymous";
}

/** Preset limits used by the app. Tune centrally. */
export const LIMITS = {
  /** 10 login attempts / 15 min per IP. */
  login: { limit: 10, windowMs: 15 * 60 * 1000 },
  /** 30 KPI writes / minute per user. */
  kpiWrite: { limit: 30, windowMs: 60 * 1000 },
  /** 60 generic mutations / minute per user. */
  mutation: { limit: 60, windowMs: 60 * 1000 },
} as const;

/** Reset the default store (test helper). */
export function _resetDefaultStore(): void {
  (DEFAULT_STORE as MemoryRateLimitStore).reset();
}
