import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/api/requireSuperAdmin";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const search = request.nextUrl.searchParams.get("search") || "";

  const users = await db.user.findMany({
    where: search
      ? {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
  });

  const membershipCounts = await db.membership.groupBy({
    by: ["userId"],
    where: { status: "active" },
    _count: { tenantId: true },
  });
  const countMap = new Map(membershipCounts.map((m) => [m.userId, m._count.tenantId]));

  const data = users.map((u) => ({
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    avatar: u.avatar,
    isSuperAdmin: u.isSuperAdmin,
    orgCount: countMap.get(u.id) || 0,
    lastSignInAt: u.lastSignInAt ? u.lastSignInAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  }));

  return NextResponse.json({ success: true, data });
}
