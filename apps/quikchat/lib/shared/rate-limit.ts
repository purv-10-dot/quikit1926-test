import type { Redis } from "ioredis";

/**
 * Fixed-window rate limiter seam. Redis-backed (shared, atomic INCR+EXPIRE) when
 * `REDIS_URL` is set so it holds across instances; in-memory fixed-window
 * otherwise (single-process — fine for dev/tests). Mirrors the publishFanout
 * seam: lazy singleton, `__resetRateLimitForTest()`.
 */

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Milliseconds until the window resets (for Retry-After). */
  retryAfterMs: number;
}

// --- in-memory fixed window ---
interface Bucket {
  count: number;
  resetAt: number;
}
const memory = new Map<string, Bucket>();

function memoryLimit(key: string, limit: number, windowMs: number, now: number): RateLimitResult {
  let b = memory.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    memory.set(key, b);
  }
  b.count += 1;
  const ok = b.count <= limit;
  return {
    ok,
    remaining: Math.max(0, limit - b.count),
    retryAfterMs: ok ? 0 : b.resetAt - now,
  };
}

// --- redis fixed window ---
let redisPromise: Promise<Redis> | null = null;
async function getRedis(): Promise<Redis | null> {
  if (!process.env.REDIS_URL) return null;
  if (!redisPromise) {
    redisPromise = import("ioredis").then(
      ({ default: RedisCtor }) => new RedisCtor(process.env.REDIS_URL!),
    );
  }
  return redisPromise;
}

async function redisLimit(
  redis: Redis,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const rk = `ratelimit:${key}`;
  const count = await redis.incr(rk);
  if (count === 1) await redis.pexpire(rk, windowMs);
  const ttl = await redis.pttl(rk);
  const ok = count <= limit;
  return {
    ok,
    remaining: Math.max(0, limit - count),
    retryAfterMs: ok ? 0 : Math.max(0, ttl),
  };
}

/**
 * Count one hit against `key`. Returns `{ ok }` false once `limit` is exceeded
 * within `windowMs`. Best-effort: if the Redis path errors, fall back to
 * allowing the request (fail-open) rather than blocking traffic.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const redis = await getRedis().catch(() => null);
  if (redis) {
    try {
      return await redisLimit(redis, key, limit, windowMs);
    } catch {
      // fall through to in-memory on a Redis hiccup
    }
  }
  return memoryLimit(key, limit, windowMs, Date.now());
}

export function __resetRateLimitForTest(): void {
  memory.clear();
}
