import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const memberships = await prisma.orgMember.findMany({
      where: { orgId: user.orgId, status: "active" },
      select: {
        userId: true,
        role: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    const items = memberships.map((m) => ({
      id: m.user.id,
      name: `${m.user.firstName ?? ""} ${m.user.lastName ?? ""}`.trim() || m.user.email,
      email: m.user.email,
      role: m.role,
    }));
    return NextResponse.json({ success: true, data: { items } });
  } catch (e) {
    return errorResponse(e);
  }
}
