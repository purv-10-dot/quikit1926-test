/**
 * Process-local fixed-window rate limiter.
 *
 * - Key shape: `rl:{scope}:{identifier}:{windowStart}`
 * - Counters live in memory (Redis is reserved for queue/pub-sub/cron). On a
 *   single long-running server this is atomic (JS is single-threaded; the
 *   read-modify-write below has no await). NOTE: limits are PER-PROCESS — if you
 *   ever run multiple instances, each enforces its own counter.
 * - Window: fixed (calendar) — simple, ~2x burst at the boundary, acceptable.
 * - `RATE_LIMIT_DISABLED=true` bypasses entirely (fail-open).
 */

import { NextResponse } from "next/server";
import { ErrorCode } from "@/lib/types/api";

// scope+identifier+window → { count, expiresAt(ms) }. Swept lazily + periodically.
const counters = new Map<string, { count: number; expiresAt: number }>();
const g = globalThis as unknown as { __rlSweep?: ReturnType<typeof setInterval> };
if (!g.__rlSweep) {
  g.__rlSweep = setInterval(() => {
    const now = Date.now();
    for (const [k, e] of counters) if (e.expiresAt <= now) counters.delete(k);
  }, 60_000);
  if (typeof (g.__rlSweep as { unref?: () => void }).unref === "function") {
    (g.__rlSweep as { unref: () => void }).unref();
  }
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  max: number;
  /** Seconds until the current window resets (and the count drops to 0). */
  retryAfter: number;
}

const IS_PROD = process.env.NODE_ENV === "production";
const GLOBAL_DISABLED = process.env.RATE_LIMIT_DISABLED === "true";
// In dev we soften the limits 10× so day-to-day testing isn't painful.
const DEV_MULTIPLIER = IS_PROD ? 1 : 10;

function effectiveMax(max: number): number {
  return Math.max(1, Math.floor(max * DEV_MULTIPLIER));
}

/**
 * Increment the counter for (scope, identifier) within the current window.
 * Returns whether the request is allowed and how long until the window resets.
 */
export async function rateLimit(
  scope: string,
  identifier: string,
  max: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const cap = effectiveMax(max);

  // Globally disabled → never block.
  if (GLOBAL_DISABLED) {
    return { allowed: true, count: 0, max: cap, retryAfter: 0 };
  }

  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const windowStart = Math.floor(nowSec / windowSec) * windowSec;
  const key = `rl:${scope}:${identifier}:${windowStart}`;
  const resetAtMs = (windowStart + windowSec) * 1000;
  const ttl = Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000));

  // Read-modify-write is atomic here: synchronous, no await between get and set.
  let entry = counters.get(key);
  if (!entry || entry.expiresAt <= nowMs) {
    entry = { count: 0, expiresAt: resetAtMs };
    counters.set(key, entry);
  }
  entry.count += 1;
  const count = entry.count;
  return {
    allowed: count <= cap,
    count,
    max: cap,
    retryAfter: count > cap ? ttl : 0,
  };
}

/**
 * Compose multiple limits — fail if ANY of them block. Used to enforce
 * IP-and-user composite limits like "5 logins/min per IP AND per email".
 */
export async function rateLimitAll(
  checks: Array<{ scope: string; identifier: string; max: number; windowSec: number }>,
): Promise<RateLimitResult | null> {
  for (const c of checks) {
    const r = await rateLimit(c.scope, c.identifier, c.max, c.windowSec);
    if (!r.allowed) return r;
  }
  return null;
}

/** Standard 429 response shape with Retry-After + X-RateLimit headers. */
export function rateLimitedResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: ErrorCode.RATE_LIMITED,
        message: "Too many requests. Please slow down and try again shortly.",
        retryAfterSec: result.retryAfter,
      },
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfter),
        "X-RateLimit-Limit": String(result.max),
        "X-RateLimit-Remaining": String(Math.max(0, result.max - result.count)),
      },
    },
  );
}

/**
 * One-shot helper for public routes: returns a 429 NextResponse when blocked,
 * or null when the request should proceed.
 */
export async function rateLimitOrResponse(
  scope: string,
  identifier: string,
  max: number,
  windowSec: number,
): Promise<NextResponse | null> {
  const r = await rateLimit(scope, identifier, max, windowSec);
  return r.allowed ? null : rateLimitedResponse(r);
}

/**
 * Variant that fails on any of several composite checks (IP + email, etc.).
 * Returns 429 if ANY check is over its limit.
 */
export async function rateLimitAllOrResponse(
  checks: Array<{ scope: string; identifier: string; max: number; windowSec: number }>,
): Promise<NextResponse | null> {
  const blocked = await rateLimitAll(checks);
  return blocked ? rateLimitedResponse(blocked) : null;
}

/** Best-effort client IP extraction; falls back to "unknown". */
export function clientIp(req: Request | { headers: Headers }): string {
  const h = "headers" in req ? req.headers : (req as Request).headers;
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return h.get("x-real-ip")?.trim() || "unknown";
}
