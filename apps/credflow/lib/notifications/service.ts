/**
 * Core notification service.
 *
 * Single entry-point for all notification creation. Every write goes through
 * createNotification() which:
 *   1. Persists the row to QcfNotification (awaited — we want durability).
 *   2. Publishes an SSE event on the per-user Redis channel (fire-and-forget).
 *   3. Sends a transactional email to the recipient (fire-and-forget).
 *
 * Steps 2 & 3 are non-blocking — they never surface as errors on the API
 * response that triggered the notification.
 */

import { prisma } from "@/lib/db/prisma";
import { publishNotificationEvent } from "./realtime";
import { sendNotificationEmail } from "./email-templates";
import type { NotificationPayload, NotificationRow } from "./types";

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Persist a notification and deliver it via SSE + email (best-effort).
 * Awaits the DB write; SSE publish and email send are fire-and-forget.
 */
export async function createNotification(
  payload: NotificationPayload,
): Promise<void> {
  // 1. Persist — synchronous from the caller's perspective.
  const row = await prisma.qcfNotification.create({
    data: {
      tenantId: payload.tenantId,
      userId: payload.userId,
      title: payload.title,
      body: payload.body,
      category: payload.category,
      link: payload.link ?? null,
      // Store the discriminant type inside metadata so the UI can render
      // the correct icon / copy without an extra lookup.
      metadata: {
        type: payload.type,
        ...(payload.metadata ?? {}),
      },
    },
  });

  // 2. Real-time SSE push — fire-and-forget.
  publishNotificationEvent(payload.tenantId, payload.userId, {
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category,
    link: row.link,
    createdAt: row.createdAt.toISOString(),
  }).catch(() => {/* already warned inside publishNotificationEvent */});

  // 3. Email delivery — fire-and-forget; swallow all errors.
  if (!payload.skipEmail) {
    sendNotificationEmail(payload).catch((err) => {
      console.warn(
        "[notifications:email] delivery failed for user",
        payload.userId,
        "—",
        err instanceof Error ? err.message : String(err),
      );
    });
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export interface NotificationPage {
  items: NotificationRow[];
  unread: number;
  hasMore: boolean;
  /** ISO timestamp — pass as `cursor` on the next request for the next page. */
  nextCursor: string | null;
}

/**
 * Paginated notification list for a user.
 * Uses cursor-based pagination on `createdAt` (ISO string) for stable ordering.
 */
export async function getNotifications(
  tenantId: string,
  userId: string,
  cursor?: string | null,
  take = 30,
): Promise<NotificationPage> {
  const rows = await prisma.qcfNotification.findMany({
    where: {
      tenantId,
      userId,
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    // Fetch one extra to determine whether another page exists.
    take: take + 1,
  });

  const hasMore = rows.length > take;
  const items = (hasMore ? rows.slice(0, take) : rows) as NotificationRow[];
  const nextCursor =
    hasMore && items.length > 0
      ? (items[items.length - 1]!.createdAt as Date).toISOString()
      : null;

  // Compute unread across the WHOLE inbox (not just this page).
  const unread = await prisma.qcfNotification.count({
    where: { tenantId, userId, readAt: null },
  });

  return { items, unread, hasMore, nextCursor };
}

// ─── Count ────────────────────────────────────────────────────────────────────

/** Fast unread count — used by the bell badge endpoint. */
export async function getUnreadCount(
  tenantId: string,
  userId: string,
): Promise<number> {
  return prisma.qcfNotification.count({
    where: { tenantId, userId, readAt: null },
  });
}

// ─── Mark read ────────────────────────────────────────────────────────────────

/** Mark every unread notification as read for a user. Returns the count touched. */
export async function markAllRead(
  tenantId: string,
  userId: string,
): Promise<number> {
  const result = await prisma.qcfNotification.updateMany({
    where: { tenantId, userId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}
