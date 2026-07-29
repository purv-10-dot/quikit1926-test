/**
 * In-memory rate limiter. Single-instance only (swap to Upstash/Redis for
 * multi-instance deployments; same interface).
 *
 * Usage:
 *   const rl = await rateLimit({ key: `pr-submit:${userId}`, limit: 10, windowMs: 60_000 });
 *   if (!rl.ok) return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
 */

interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>();

// Garbage-collect expired buckets every 5 min to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
}, 5 * 60_000).unref?.();

export interface RateLimitArgs {
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult { ok: boolean; remaining: number; resetAt: number }

export async function rateLimit(args: RateLimitArgs): Promise<RateLimitResult> {
  const now = Date.now();
  const existing = buckets.get(args.key);
  if (!existing || existing.resetAt < now) {
    buckets.set(args.key, { count: 1, resetAt: now + args.windowMs });
    return { ok: true, remaining: args.limit - 1, resetAt: now + args.windowMs };
  }
  if (existing.count >= args.limit) {
    return { ok: false, remaining: 0, resetAt: existing.resetAt };
  }
  existing.count += 1;
  return { ok: true, remaining: args.limit - existing.count, resetAt: existing.resetAt };
}

