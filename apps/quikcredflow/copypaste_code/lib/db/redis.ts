import IORedis, { type Redis } from "ioredis";

declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined;
  // eslint-disable-next-line no-var
  var __redisQueue: Redis | undefined;
}

/**
 * Redis is OPTIONAL. When REDIS_URL is unset (or blank), Redis-dependent
 * features degrade gracefully:
 *   - rate-limiter: no-op (always allows)
 *   - workflow trigger enqueue: skipped (no automation runs)
 *   - import enqueue: returns 503 with a clear message
 *   - BullMQ worker: refuses to start
 * The rest of the CRM (auth, leads, accounts, contacts, etc.) is unaffected.
 */
export function isRedisEnabled(): boolean {
  const url = process.env.REDIS_URL;
  return Boolean(url && url.trim().length > 0);
}

let warnedDown = false;
function attachQuietErrorHandler(client: Redis, label: string) {
  client.on("error", (err) => {
    if (!warnedDown) {
      warnedDown = true;
      console.warn(
        `[redis:${label}] connection error — features that require Redis (rate-limit, BullMQ) will degrade. (${err.message})`,
      );
    }
  });
}

/**
 * General-purpose Redis client. Lazy-connects, fails fast, silent on errors.
 * Throws if Redis is disabled — callers should check isRedisEnabled() first.
 */
export function getRedis(): Redis {
  if (globalThis.__redis) return globalThis.__redis;
  if (!isRedisEnabled()) throw new Error("REDIS_URL is not set");
  const client = new IORedis(process.env.REDIS_URL!, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
  });
  attachQuietErrorHandler(client, "general");
  if (process.env.NODE_ENV !== "production") globalThis.__redis = client;
  return client;
}

/**
 * BullMQ-flavored Redis client. Retries forever (BullMQ requirement).
 * Throws if Redis is disabled — callers should check isRedisEnabled() first.
 */
export function getQueueRedis(): Redis {
  if (globalThis.__redisQueue) return globalThis.__redisQueue;
  if (!isRedisEnabled()) throw new Error("REDIS_URL is not set");
  const client = new IORedis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null, // BullMQ requirement
    enableReadyCheck: false,
  });
  attachQuietErrorHandler(client, "queue");
  if (process.env.NODE_ENV !== "production") globalThis.__redisQueue = client;
  return client;
}
