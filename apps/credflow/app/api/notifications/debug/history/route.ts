/**
 * GET /api/notifications/debug/history
 *
 * Tenant-wide notification history for the admin debug page.
 * Returns all notifications across all users in the tenant.
 * Admin-only.
 *
 * Query params:
 *   filter   — "all" | "unread" | "read" (default: "all")
 *   page     — 1-based page number (default: 1)
 *   pageSize — 10–100 (default: 25)
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    if (user.role !== "Administrator") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const filter = searchParams.get("filter") ?? "all";
    const rawPage = Number(searchParams.get("page") ?? "1");
    const rawSize = Number(searchParams.get("pageSize") ?? "25");
    const page = Math.max(1, Number.isFinite(rawPage) ? rawPage : 1);
    const pageSize = Math.min(100, Math.max(10, Number.isFinite(rawSize) ? rawSize : 25));

    const readFilter =
      filter === "unread"
        ? { readAt: null }
        : filter === "read"
          ? { readAt: { not: null } }
          : {};

    const where = { tenantId: user.tenantId, ...readFilter };

    const [items, total] = await Promise.all([
      prisma.crmNotification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.crmNotification.count({ where }),
    ]);

    // Attach display name from User table for each notification row.
    const userIds = [...new Set(items.map((n) => n.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const userMap = Object.fromEntries(
      users.map((u) => [
        u.id,
        {
          name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
          email: u.email,
        },
      ]),
    );

    const enriched = items.map((n) => ({
      ...n,
      userName: userMap[n.userId]?.name ?? n.userId,
      userEmail: userMap[n.userId]?.email ?? "",
    }));

    return NextResponse.json({
      items: enriched,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
