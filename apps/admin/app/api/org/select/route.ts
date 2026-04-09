import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_HIERARCHY } from "@/lib/constants";

const ADMIN_MIN_LEVEL = ROLE_HIERARCHY["admin"];

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { tenantId } = await request.json();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: "tenantId is required" }, { status: 400 });
  }

  const membership = await db.membership.findFirst({
    where: {
      userId: session.user.id,
      tenantId,
      status: "active",
    },
  });

  if (!membership) {
    return NextResponse.json(
      { success: false, error: "No active membership for this organisation" },
      { status: 403 }
    );
  }

  // Verify admin-level access for this portal
  const roleLevel = ROLE_HIERARCHY[membership.role as keyof typeof ROLE_HIERARCHY] ?? 0;
  if (roleLevel < ADMIN_MIN_LEVEL) {
    return NextResponse.json(
      { success: false, error: "Admin access required for this portal" },
      { status: 403 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      tenantId: membership.tenantId,
      membershipRole: membership.role,
    },
  });
}
