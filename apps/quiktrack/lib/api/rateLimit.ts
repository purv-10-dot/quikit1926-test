import { getRedis } from "@quikit/redis";

/**
 * Fixed-window rate limiter, Redis-backed with an in-memory fallback.
 *
 * Used to protect the credentials-based token endpoint from brute-force /
 * credential-stuffing (the shared credentials provider dropped its own
 * limiter — see packages/auth/index.ts). Fail-OPEN: if Redis is unreachable
 * and the in-memory map is unavailable, a login is never blocked by an
 * infrastructure fault.
 *
 * INCR + EXPIRE gives an atomic-enough fixed window for this purpose: the
 * first hit in a window sets the TTL, subsequent hits only increment. When
 * Redis is absent we degrade to a per-instance Map (good enough for dev and a
 * meaningful-though-not-cluster-wide guard in single-instance prod).
 */

interface RateLimitResult {
  /** True when the caller is within the allowed count for the window. */
  allowed: boolean;
  /** Requests remaining in the current window (never negative). */
  remaining: number;
  /** Seconds until the window resets (best-effort; 0 when unknown). */
  retryAfter: number;
}

// Per-instance fallback bucket store: key -> { count, resetAt(ms) }.
const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

function checkMemory(
  key: string,
  limit: number,
  windowSeconds: number,
): RateLimitResult {
  const now = Date.now();
  const existing = memoryBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }
  existing.count += 1;
  const remaining = Math.max(0, limit - existing.count);
  return {
    allowed: existing.count <= limit,
    remaining,
    retryAfter: Math.ceil((existing.resetAt - now) / 1000),
  };
}

/**
 * Record one hit against `key` and report whether it is within `limit` per
 * `windowSeconds`. Never throws.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) return checkMemory(key, limit, windowSeconds);

  const redisKey = `ratelimit:${key}`;
  try {
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, windowSeconds);
    }
    const ttl = await redis.ttl(redisKey);
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfter: ttl > 0 ? ttl : windowSeconds,
    };
  } catch {
    // Redis blip — fail open rather than lock users out.
    return { allowed: true, remaining: limit, retryAfter: 0 };
  }
}

/**
 * Best-effort client IP from standard proxy headers. Falls back to "unknown"
 * so a missing header collapses many callers into one shared bucket rather
 * than disabling the limit.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}
