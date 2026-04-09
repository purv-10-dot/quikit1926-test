import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";

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

    let userIds: string[] | undefined;

    if (teamId) {
      // Get all users who are members of this team via UserTeam
      const teamMembers = await db.userTeam.findMany({
        where: { tenantId, teamId },
        select: { userId: true },
      });
      userIds = teamMembers.map(m => m.userId);
      if (userIds.length === 0)
        return NextResponse.json({ success: true, data: [] });
    }

    const members = await db.membership.findMany({
      where: {
        tenantId,
        status: "active",
        ...(userIds ? { userId: { in: userIds } } : {}),
      },
      select: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });

    const users = members.map(m => m.user).filter(Boolean);
    return NextResponse.json({ success: true, data: users });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed to fetch users" }, { status: 500 });
  }
}
