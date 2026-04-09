import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { db } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const { tenantId } = auth;
  const membershipId = params.id;

  const membership = await db.membership.findFirst({
    where: { id: membershipId, tenantId },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatar: true,
          lastSignInAt: true,
          createdAt: true,
        },
      },
    },
  });

  if (!membership) {
    return NextResponse.json(
      { success: false, error: "Member not found" },
      { status: 404 }
    );
  }

  const userTeams = await db.userTeam.findMany({
    where: { tenantId, userId: membership.userId },
    include: { team: { select: { id: true, name: true, color: true } } },
  });

  const appAccess = await db.userAppAccess.findMany({
    where: { tenantId, userId: membership.userId },
    include: { app: { select: { id: true, name: true, slug: true, iconUrl: true } } },
  });

  return NextResponse.json({
    success: true,
    data: {
      membershipId: membership.id,
      userId: membership.userId,
      firstName: membership.user.firstName,
      lastName: membership.user.lastName,
      email: membership.user.email,
      avatar: membership.user.avatar,
      role: membership.role,
      status: membership.status,
      customPermissions: membership.customPermissions,
      invitedAt: membership.invitedAt?.toISOString() ?? null,
      acceptedAt: membership.acceptedAt?.toISOString() ?? null,
      lastSignInAt: membership.user.lastSignInAt?.toISOString() ?? null,
      userCreatedAt: membership.user.createdAt.toISOString(),
      teams: userTeams.map((ut) => ({
        id: ut.team.id,
        name: ut.team.name,
        color: ut.team.color,
      })),
      apps: appAccess.map((a) => ({
        id: a.app.id,
        name: a.app.name,
        slug: a.app.slug,
        iconUrl: a.app.iconUrl,
        role: a.role,
      })),
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const { tenantId } = auth;
  const membershipId = params.id;

  const membership = await db.membership.findFirst({
    where: { id: membershipId, tenantId },
  });

  if (!membership) {
    return NextResponse.json(
      { success: false, error: "Member not found" },
      { status: 404 }
    );
  }

  const body = await request.json();
  const { role, status, teamIds, customPermissions } = body;

  // Update membership fields
  const updateData: Record<string, any> = {};
  if (role) updateData.role = role;
  if (status) updateData.status = status;
  if (customPermissions !== undefined) updateData.customPermissions = customPermissions;

  const updated = await db.membership.update({
    where: { id: membershipId },
    data: updateData,
  });

  // Update team assignments if provided
  if (teamIds !== undefined) {
    // Remove existing team assignments
    await db.userTeam.deleteMany({
      where: { tenantId, userId: membership.userId },
    });

    // Create new assignments
    if (teamIds.length > 0) {
      await db.userTeam.createMany({
        data: teamIds.map((teamId: string) => ({
          tenantId,
          userId: membership.userId,
          teamId,
        })),
      });
    }
  }

  return NextResponse.json({
    success: true,
    data: updated,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const { tenantId } = auth;
  const membershipId = params.id;

  const membership = await db.membership.findFirst({
    where: { id: membershipId, tenantId },
  });

  if (!membership) {
    return NextResponse.json(
      { success: false, error: "Member not found" },
      { status: 404 }
    );
  }

  // Soft deactivate — don't hard delete
  await db.membership.update({
    where: { id: membershipId },
    data: { status: "inactive" },
  });

  return NextResponse.json({
    success: true,
    message: "Member deactivated",
  });
}
