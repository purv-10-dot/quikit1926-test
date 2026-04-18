import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";
import { updateMemberSchema } from "@/lib/schemas/memberSchema";

export const GET = withAdminAuth<{ id: string }>(async ({ tenantId }, _request, { params }) => {
  const blocked = await gateModuleApi("admin", "members", tenantId);
  if (blocked) return blocked as NextResponse;
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
});

export const PATCH = withAdminAuth<{ id: string }>(async ({ tenantId }, request: NextRequest, { params }) => {
  const blocked = await gateModuleApi("admin", "members", tenantId);
  if (blocked) return blocked as NextResponse;
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
  const parsed = updateMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { role, status, teamIds, customPermissions } = parsed.data;

  // Update membership fields
  const updateData: Record<string, unknown> = {};
  if (role) updateData.role = role;
  if (status) updateData.status = status;
  if (customPermissions !== undefined) updateData.customPermissions = customPermissions;

  const updated = await db.membership.update({
    where: { id: membershipId },
    data: updateData,
  });

  // Update team assignments if provided
  if (teamIds !== undefined) {
    // Validate all teamIds belong to this tenant
    if (teamIds.length > 0) {
      const validTeams = await db.team.findMany({
        where: { id: { in: teamIds }, tenantId },
        select: { id: true },
      });
      const validTeamIds = new Set(validTeams.map((t) => t.id));
      const invalidIds = teamIds.filter((id: string) => !validTeamIds.has(id));
      if (invalidIds.length > 0) {
        return NextResponse.json(
          { success: false, error: "One or more team IDs are invalid" },
          { status: 400 }
        );
      }
    }

    // Atomic delete + create in a transaction
    await db.$transaction([
      db.userTeam.deleteMany({
        where: { tenantId, userId: membership.userId },
      }),
      ...(teamIds.length > 0
        ? [
            db.userTeam.createMany({
              data: teamIds.map((teamId: string) => ({
                tenantId,
                userId: membership.userId,
                teamId,
              })),
            }),
          ]
        : []),
    ]);
  }

  return NextResponse.json({
    success: true,
    data: updated,
  });
});

export const DELETE = withAdminAuth<{ id: string }>(async ({ tenantId }, _request, { params }) => {
  const blocked = await gateModuleApi("admin", "members", tenantId);
  if (blocked) return blocked as NextResponse;
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
});
