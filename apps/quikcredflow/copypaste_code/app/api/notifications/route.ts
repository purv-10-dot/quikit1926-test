import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const items = await prisma.crmNotification.findMany({
      where: { tenantId: user.tenantId, userId: user.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const unread = items.filter((n) => !n.readAt).length;
    return NextResponse.json({ items, unread });
  } catch (e) {
    return errorResponse(e);
  }
}
