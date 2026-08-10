/**
 * Minimal fixed-window rate limiter for the LeadSquared webhook.
 *
 * Best-effort by design:
 *   - No-op (allow) when Redis is disabled — the webhook must keep working
 *     without Redis (the inline processing path).
 *   - Fail-OPEN on any Redis error — a limiter blip must never take the webhook
 *     down (LeadSquared auto-disables a hook after 10 consecutive non-200s).
 *
 * There is no shared limiter in this repo yet, so this is intentionally tiny
 * and local. If a general limiter is added later, swap the body for it.
 */
import { getRedis, isRedisEnabled } from "@/lib/db/redis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export async function checkRateLimit(
  key: string,
  opts: { limit: number; windowSec: number },
): Promise<RateLimitResult> {
  if (!isRedisEnabled()) return { allowed: true, remaining: opts.limit };
  try {
    const redis = getRedis();
    const redisKey = `ratelimit:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.expire(redisKey, opts.windowSec);
    return { allowed: count <= opts.limit, remaining: Math.max(0, opts.limit - count) };
  } catch {
    // Fail open — never block the webhook because the limiter is unhealthy.
    return { allowed: true, remaining: opts.limit };
  }
}
