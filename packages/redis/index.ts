/**
 * @quikit/redis — shared Redis client for the QuikIT monorepo.
 *
 * Provides:
 *   - `redis` — singleton ioredis client (lazy-connects on first use)
 *   - `getRedis()` — returns the client or null if REDIS_URL is unset
 *   - `isRedisAvailable()` — checks if Redis is configured and responding
 *
 * Every consumer (rate limiter, session store, cache) uses `getRedis()`
 * and falls back to in-memory when it returns null. This means the app
 * works identically in dev (no Redis) and production (with Redis) — the
 * only difference is durability and multi-instance coordination.
 *
 * Environment variable:
 *   REDIS_URL — e.g. "redis://localhost:6379" or "rediss://user:pass@host:6380"
 *   If unset, all Redis operations gracefully degrade.
 */

import Redis from "ioredis";

let _client: Redis | null = null;

/**
 * Get the singleton Redis client. Returns `null` if `REDIS_URL` is not set.
 * The client lazy-connects on the first command — no connection is opened
 * at import time.
 */
export function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  if (!_client) {
    _client = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        // Exponential backoff capped at 3 seconds
        return Math.min(times * 200, 3000);
      },
      lazyConnect: true,
      // Reconnect automatically on disconnect
      reconnectOnError(err) {
        const targetErrors = ["READONLY", "ECONNRESET", "ECONNREFUSED"];
        return targetErrors.some((t) => err.message.includes(t));
      },
    });

    _client.on("error", (err) => {
      // Log but don't crash — fallback paths handle null client
      console.error("[redis] connection error:", err.message);
    });
  }

  return _client;
}

/**
 * Check if Redis is configured AND responding.
 * Returns false if REDIS_URL is unset or if PING fails.
 */
export async function isRedisAvailable(): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;
  try {
    const pong = await client.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}

/**
 * Gracefully close the Redis connection (for shutdown hooks).
 */
export async function closeRedis(): Promise<void> {
  if (_client) {
    await _client.quit();
    _client = null;
  }
}

/**
 * Simple cache helpers — get/set with TTL.
 * Returns null on miss or if Redis is unavailable.
 */
export async function cacheGet(key: string): Promise<string | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    return await client.get(key);
  } catch {
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.set(key, value, "EX", ttlSeconds);
  } catch {
    // Swallow — cache is best-effort
  }
}

export async function cacheDel(key: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.del(key);
  } catch {
    // Swallow
  }
}
