/**
 * Redis helpers backed by the shared @quikit/redis client.
 *
 * In the monorepo there is a single Redis surface (`getRedis()` returns null
 * when REDIS_URL is unset). All helpers degrade to no-ops when Redis is
 * unavailable so the helpdesk runs identically with or without Redis — the
 * email/notification queues simply don't fire until a worker + REDIS_URL exist.
 */
import { getRedis } from "@quikit/redis";

export const EMAIL_QUEUE = "queue:emails";
export const NOTIFICATION_QUEUE = "queue:notifications";

/** Best-effort enqueue. No-op when Redis is unavailable. */
export async function enqueueJob(queue: string, payload: Record<string, unknown>) {
  const redis = getRedis();
  if (!redis) return;
  await redis.rpush(queue, JSON.stringify(payload));
}

export async function dequeueJob(queue: string): Promise<Record<string, unknown> | null> {
  const redis = getRedis();
  if (!redis) return null;
  const raw = await redis.lpop(queue);
  return raw ? JSON.parse(raw) : null;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  const raw = await redis.get(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 300) {
  const redis = getRedis();
  if (!redis) return;
  await redis.setex(key, ttlSeconds, JSON.stringify(value));
}

export async function cacheDel(key: string) {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(key);
}
