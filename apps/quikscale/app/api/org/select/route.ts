import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/org/select
 * Validates that the user has an active membership for the given tenantId,
 * returns the membership role so the client can update the JWT session.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { tenantId } = await request.json();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: "tenantId is required" }, { status: 400 });
  }

  // Verify the user has an active membership for this tenant
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

  return NextResponse.json({
    success: true,
    data: {
      tenantId: membership.tenantId,
      membershipRole: membership.role,
    },
  });
}
