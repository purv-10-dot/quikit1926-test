import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toErrorMessage } from "@/lib/api/errors";
import { invitationActionSchema } from "@/lib/schemas/orgSchema";

/**
 * POST /api/org/invitations
 * Accept or decline a pending invitation.
 * Body: { membershipId: string, action: "accept" | "decline" }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const parsed = invitationActionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }
    const { membershipId, action } = parsed.data;

    // Verify the membership belongs to this user and is pending
    const membership = await db.membership.findFirst({
      where: { id: membershipId, userId: session.user.id, status: "pending" },
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, error: "Invitation not found or already processed" },
        { status: 404 }
      );
    }

    if (action === "accept") {
      await db.membership.update({
        where: { id: membershipId },
        data: { status: "active", acceptedAt: new Date() },
      });

      // Auto-grant access to all active apps for this tenant
      const activeApps = await db.app.findMany({ where: { status: "active" } });

      for (const app of activeApps) {
        await db.userAppAccess.upsert({
          where: {
            userId_tenantId_appId: {
              userId: session.user.id,
              tenantId: membership.tenantId,
              appId: app.id,
            },
          },
          update: {},
          create: {
            userId: session.user.id,
            tenantId: membership.tenantId,
            appId: app.id,
            role: "member",
          },
        });
      }

      return NextResponse.json({ success: true, message: "Invitation accepted" });
    }

    // Decline — mark as declined
    await db.membership.update({
      where: { id: membershipId },
      data: { status: "declined" },
    });

    return NextResponse.json({ success: true, message: "Invitation declined" });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: toErrorMessage(error, "Failed to process invitation") },
      { status: 500 }
    );
  }
}
