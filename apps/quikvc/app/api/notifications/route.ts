/**
 * Notifications feed for the current user.
 *
 *   GET  /api/notifications?unreadOnly=true&limit=20
 *   POST /api/notifications/mark-read  (in [...action]/route.ts)
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

export const GET = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const unreadOnly = req.nextUrl.searchParams.get("unreadOnly") === "true";
  const limit = Math.min(100, parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10));

  const where = unreadOnly
    ? { orgId, userId, readAt: null }
    : { orgId, userId };

  const [items, unreadCount] = await Promise.all([
    db.vCNotification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, type: true, title: true, body: true, href: true, readAt: true, createdAt: true },
    }),
    db.vCNotification.count({ where: { orgId, userId, readAt: null } }),
  ]);

  return NextResponse.json({ success: true, data: { items, unreadCount } });
});
