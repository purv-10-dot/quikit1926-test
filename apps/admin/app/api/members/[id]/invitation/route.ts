import { NextResponse, NextRequest } from "next/server";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

export const DELETE = withAdminAuth<{ id: string }>(
  async ({ tenantId, userId: actorId }, request: NextRequest, { params }) => {
    const blocked = await gateModuleApi("admin", "members", tenantId);
    if (blocked) return blocked as NextResponse;

    const membershipId = params.id;

    const membership = await db.membership.findFirst({
      where: { id: membershipId, tenantId, status: "invited" },
      include: { user: { select: { email: true } } },
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, error: "No pending invitation found" },
        { status: 404 }
      );
    }

    await db.membership.delete({ where: { id: membershipId } });

    await writeAuditLog({
      tenantId,
      actorId,
      action: "REVOKED",
      entityType: "Membership",
      entityId: membershipId,
      oldValues: { email: membership.user.email, role: membership.role },
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({
      success: true,
      message: `Invitation revoked for ${membership.user.email}`,
    });
  }
);
