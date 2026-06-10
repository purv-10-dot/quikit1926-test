/**
 * Notification realtime pub/sub.
 *
 * Mirrors the pattern in lib/services/leads/realtime.ts:
 *   - Tenant + user-scoped channel → zero cross-user leakage.
 *   - Fire-and-forget publish; graceful no-op when Redis is disabled.
 *   - SSE consumers (app/api/notifications/stream) subscribe to these channels.
 */

import { getRedis, isRedisEnabled } from "@/lib/db/redis";

/** Per-user channel name. One Redis subscriber per open SSE connection. */
export function tenantUserNotificationChannel(
  orgId: string,
  userId: string,
): string {
  return `quikcrm:notifications:${orgId}:${userId}`;
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
 * Fire-and-forget publish. No-op when Redis is disabled so the rest of
 * the CRM stays functional in environments without a Redis instance.
 */
export async function publishNotificationEvent(
  orgId: string,
  userId: string,
  event: NotificationEvent,
): Promise<void> {
  if (!isRedisEnabled()) return;
  try {
    const channel = tenantUserNotificationChannel(orgId, userId);
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
