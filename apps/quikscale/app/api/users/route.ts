import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { toErrorMessage } from "@/lib/api/errors";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const membership = await db.membership.findFirst({
      where: { userId: session.user.id, status: "active" },
      orderBy: { createdAt: "asc" },
    });
    if (!membership)
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const { tenantId } = membership;
    const teamId = request.nextUrl.searchParams.get("teamId");
    const { page, limit, skip, take } = parsePagination(request);

    // Membership has a direct teamId field — filter there
    const where = {
      tenantId,
      status: "active",
      ...(teamId ? { teamId } : {}),
    };

    const [members, total] = await Promise.all([
      db.membership.findMany({
        where,
        select: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: "asc" },
        skip,
        take,
      }),
      db.membership.count({ where }),
    ]);

    const users = members.map(m => m.user).filter(Boolean);
    return NextResponse.json(paginatedResponse(users, total, page, limit));
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: toErrorMessage(error, "Failed to fetch users") }, { status: 500 });
  }
}
