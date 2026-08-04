import type { Redis } from "ioredis";

/**
 * Read-only access to the ephemeral presence state the realtime gateway OWNS.
 *
 * The gateway is the only writer; this app only ever reads. We talk to Redis
 * directly instead of adding an internal HTTP endpoint on the gateway: it is the
 * same Redis instance the app already publishes fan-out to (`REDIS_URL` — see
 * `.env.example`, which requires both to point at one instance), so an HTTP hop
 * would buy nothing but a new authenticated surface to protect.
 *
 * Lazy-singleton shape mirrors `lib/shared/publish.ts` and
 * `lib/shared/rate-limit.ts`: the client is constructed on first use ONLY when
 * `REDIS_URL` is set, so tests and single-process dev never load ioredis.
 */

let clientPromise: Promise<Redis> | null = null;

async function getClient(): Promise<Redis | null> {
  if (!process.env.REDIS_URL) return null;
  if (!clientPromise) {
    clientPromise = import("ioredis").then(
      ({ default: RedisCtor }) => new RedisCtor(process.env.REDIS_URL!),
    );
  }
  return clientPromise;
}

/**
 * KEY FORMAT SOURCE OF TRUTH: `lastSeenKey()` in
 * `services/realtime/src/presence.ts`. The gateway WRITES this key on a user's
 * last-socket disconnect; we only read it. The two packages share no code, so a
 * rename there must be grepped for here (`presence:lastseen`).
 */
const lastSeenKey = (orgId: string, userId: string) => `presence:lastseen:${orgId}:${userId}`;

/**
 * The durable instant a user's last socket disconnected, or null when never
 * recorded (currently online / never connected) or Redis is unavailable.
 *
 * Best-effort by design: a Redis hiccup degrades the header to its
 * "Direct message" fallback, it never fails the request.
 */
export async function readLastSeen(orgId: string, userId: string): Promise<string | null> {
  const redis = await getClient().catch(() => null);
  if (!redis) return null;
  try {
    return await redis.get(lastSeenKey(orgId, userId));
  } catch {
    return null;
  }
}

/** Test hook: drop the memoized client so a test can swap `REDIS_URL`. */
export function __resetPresenceRedisForTest(): void {
  clientPromise = null;
}
