import IORedis, { type Redis } from "ioredis";
import { getRedis as getSharedRedis } from "@quikit/redis";

declare global {
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
 * General-purpose Redis client — now a thin adapter over the shared
 * `@quikit/redis` singleton, which is what every other QuikIT app uses.
 *
 * This used to construct its OWN ioredis client, so the app ran two connection
 * pools (this one plus the shared one that @quikit/auth/cache and
 * lib/handoff-replay.ts already open) with different retry and reconnect
 * policies. Delegating gives us the platform's singleton, its exponential
 * backoff with READONLY/ECONNRESET reconnect handling, and its one-time
 * loud banner when REDIS_URL is missing in production.
 *
 * The THROWING signature is kept deliberately. The shared getRedis() returns
 * `Redis | null`; all 11 call sites in this app are written as
 * `if (!isRedisEnabled()) …` followed by an unconditional `getRedis()`, and
 * rewriting each into a null-check would risk a null-deref in the SSE/pub-sub
 * paths for no architectural gain. The adapter converts null → throw so those
 * call sites keep their contract.
 *
 * The cast is nominal only: both sides resolve the same hoisted `ioredis`
 * package, but the shared package re-exports its own `Redis` type identity.
 */
export function getRedis(): Redis {
  const shared = getSharedRedis();
  if (!shared) throw new Error("REDIS_URL is not set");
  return shared as unknown as Redis;
}

/**
 * BullMQ-flavored Redis client. Retries forever (BullMQ requirement).
 *
 * Uses a DEDICATED, queue-safe Redis (QUEUE_REDIS_URL) so the job queue does
 * not share the cache-tuned shared Redis (REDIS_URL) that other Quikit apps
 * use — a cache-tuned (allkeys-lru) Redis would silently evict queued jobs.
 * Falls back to REDIS_URL when QUEUE_REDIS_URL is unset, so single-Redis
 * local/dev setups keep working unchanged.
 *
 * NOTE: for a TLS endpoint (e.g. managed Redis / Upstash), the URL scheme must
 * be rediss:// (not redis://) — ioredis reads TLS from the scheme.
 */
export function getQueueRedis(): Redis {
  if (globalThis.__redisQueue) return globalThis.__redisQueue;
  const queueUrl = process.env.QUEUE_REDIS_URL || process.env.REDIS_URL;
  if (!queueUrl || queueUrl.trim().length === 0) {
    throw new Error("QUEUE_REDIS_URL / REDIS_URL is not set");
  }
  const client = new IORedis(queueUrl, {
    maxRetriesPerRequest: null, // BullMQ requirement
    enableReadyCheck: false,
  });
  attachQuietErrorHandler(client, "queue");
  if (process.env.NODE_ENV !== "production") globalThis.__redisQueue = client;
  return client;
}
