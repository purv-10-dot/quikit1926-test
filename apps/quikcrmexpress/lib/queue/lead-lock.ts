/**
 * Per-lead advisory lock (Redis) so same-lead sync work runs sequentially while
 * different leads stay parallel. Prevents the stale-overwrite race where two
 * concurrent pushes for one lead reorder at the network layer.
 *
 * No-ops when Redis is disabled (the worker requires Redis to run at all, so in
 * practice the lock is always active there; unit tests run without Redis and
 * therefore call through directly).
 */
import { getRedis, isRedisEnabled } from "@/lib/db/redis";

export class LeadLockContentionError extends Error {
  constructor(key: string) {
    super(`Could not acquire LeadSquared lead lock for ${key} within wait window`);
    this.name = "LeadLockContentionError";
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Atomic compare-and-delete so we never release a lock that already expired and
// was re-acquired by another worker.
const RELEASE_LUA =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

export interface LeadLockOptions {
  /** Lock lifetime; must exceed the max push duration (default 60s > 30s timeout). */
  ttlMs?: number;
  /** How long to spin-wait for the lock before giving up (default 10s). */
  waitMs?: number;
  /** Poll interval while waiting (default 100ms). */
  pollMs?: number;
}

let lockCounter = 0;

export async function withLeadLock<T>(
  key: string,
  fn: () => Promise<T>,
  opts: LeadLockOptions = {},
): Promise<T> {
  if (!isRedisEnabled()) return fn();

  const redis = getRedis();
  const lockKey = `lock:leadsquared:${key}`;
  // Unique owner token — pid + monotonic counter (avoids Math.random / Date.now).
  const token = `${process.pid}:${(lockCounter += 1)}`;
  const ttlMs = opts.ttlMs ?? 60_000;
  const waitMs = opts.waitMs ?? 10_000;
  const pollMs = opts.pollMs ?? 100;

  const start = Date.now();
  let acquired = false;
  for (;;) {
    const res = await redis.set(lockKey, token, "PX", ttlMs, "NX");
    if (res === "OK") {
      acquired = true;
      break;
    }
    if (Date.now() - start >= waitMs) break;
    await sleep(pollMs);
  }
  if (!acquired) throw new LeadLockContentionError(key); // retryable — BullMQ will re-run

  try {
    return await fn();
  } finally {
    try {
      await redis.eval(RELEASE_LUA, 1, lockKey, token);
    } catch {
      // Best-effort release; the TTL guarantees the lock frees regardless.
    }
  }
}
