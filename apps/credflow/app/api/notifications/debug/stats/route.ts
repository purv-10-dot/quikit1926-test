/**
 * GET /api/notifications/debug/stats
 *
 * Tenant-wide notification statistics for the admin debug page.
 * Admin-only: returns 403 for non-Administrator roles.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    if (user.role !== "Administrator") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [total, unread, today] = await Promise.all([
      prisma.crmNotification.count({
        where: { tenantId: user.tenantId },
      }),
      prisma.crmNotification.count({
        where: { tenantId: user.tenantId, readAt: null },
      }),
      prisma.crmNotification.count({
        where: {
          tenantId: user.tenantId,
          createdAt: { gte: todayStart },
        },
      }),
    ]);

    return NextResponse.json({
      total,
      unread,
      read: total - unread,
      today,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
