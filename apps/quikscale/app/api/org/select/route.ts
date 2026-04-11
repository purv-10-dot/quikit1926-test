import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toErrorMessage } from "@/lib/api/errors";
import { selectOrgSchema } from "@/lib/schemas/orgSchema";

/**
 * POST /api/org/select
 * Validates that the user has an active membership for the given tenantId,
 * returns the membership role so the client can update the JWT session.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const parsed = selectOrgSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }
    const { tenantId } = parsed.data;

    // Verify the user has an active membership for this tenant
    const membership = await db.membership.findFirst({
      where: { userId: session.user.id, tenantId, status: "active" },
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, error: "No active membership for this organisation" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { tenantId: membership.tenantId, membershipRole: membership.role },
    });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: toErrorMessage(error, "Failed to select organisation") }, { status: 500 });
  }
}
