/**
 * Server-side publisher. Called from API routes after a successful DB write.
 *
 * Fire-and-forget and fail-open: real-time delivery is best-effort, so a Redis
 * hiccup must never break the write that already succeeded. Mirrors the
 * existing `logApiCall` pattern. Node-only (uses @quikit/redis → ioredis).
 */
import { getRedis } from "@quikit/redis";
import { REALTIME_CHANNEL, type RealtimeSignal } from "./contract";

export async function publishRealtime(
  signal: Omit<RealtimeSignal, "ts">,
): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return; // REDIS_URL unset → degrade silently (dev / no real-time)
    const payload: RealtimeSignal = { ...signal, ts: Date.now() };
    await redis.publish(REALTIME_CHANNEL, JSON.stringify(payload));
  } catch {
    // Swallow — the DB write already committed; real-time is best-effort.
  }
}
