/**
 * Notification realtime pub/sub.
 *
 * Mirrors the pattern in lib/services/leads/realtime.ts:
 *   - Tenant + user-scoped channel → zero cross-user leakage.
 *   - Fire-and-forget publish; graceful no-op when Redis is disabled.
 *   - SSE consumers (app/api/notifications/stream) subscribe to these channels.
 */

import { getRedis, isRedisEnabled } from "@/lib/db/redis";
import { publishLocalNotification } from "./local-bus";

/** Per-user channel name. One Redis subscriber per open SSE connection. */
export function tenantUserNotificationChannel(
  tenantId: string,
  userId: string,
): string {
  return `quikcrm:notifications:${tenantId}:${userId}`;
}

/** Minimal payload pushed over SSE — enough to render a toast + update the bell. */
export interface NotificationEvent {
  id: string;
  title: string;
  body: string | null;
  category: string | null;
  link: string | null;
  createdAt: string; // ISO string — safe for JSON serialisation
}

let warnedDown = false;

/**
 * Fire-and-forget publish.
 *
 * Always emits on the in-process bus — in single-process `next dev` this is
 * what actually delivers the event to the open SSE connection (Redis may be
 * absent or unreachable). Additionally publishes to Redis when it's enabled so
 * production can fan out across instances. The SSE route attaches a listener to
 * only ONE transport, so this never double-delivers.
 */
export async function publishNotificationEvent(
  tenantId: string,
  userId: string,
  event: NotificationEvent,
): Promise<void> {
  const channel = tenantUserNotificationChannel(tenantId, userId);

  // In-process delivery — free no-op when nothing is subscribed in this process.
  publishLocalNotification(channel, event);

  if (!isRedisEnabled()) return;
  try {
    await getRedis().publish(channel, JSON.stringify(event));
  } catch (err) {
    if (!warnedDown) {
      warnedDown = true;
      console.warn(
        "[notifications:realtime] publish failed — bell badge may lag:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}
