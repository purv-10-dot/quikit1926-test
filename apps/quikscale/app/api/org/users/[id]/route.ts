import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { getTenantId } from "@/lib/api/getTenantId";


// PUT /api/org/users/[id]
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId)
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const membership = await db.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId: params.id } },
    });
    if (!membership)
      return NextResponse.json({ success: false, error: "User not found in this organisation" }, { status: 404 });

    const body = await request.json();
    const { firstName, lastName, email, password, role, status, teamIds } = body;
    const resolvedTeamIds: string[] | undefined =
      teamIds !== undefined ? teamIds :
      body.teamId !== undefined ? (body.teamId ? [body.teamId] : []) :
      undefined;

    // Update user record
    const userUpdates: Record<string, unknown> = {};
    if (firstName?.trim()) userUpdates.firstName = firstName.trim();
    if (lastName?.trim())  userUpdates.lastName  = lastName.trim();
    if (email?.trim())     userUpdates.email     = email.trim().toLowerCase();
    if (password?.trim())  userUpdates.password  = await bcrypt.hash(password.trim(), 12);
    if (Object.keys(userUpdates).length > 0)
      await db.user.update({ where: { id: params.id }, data: userUpdates });

    // Update membership record
    const membershipUpdates: Record<string, unknown> = {};
    if (role   !== undefined) membershipUpdates.role   = role;
    if (status !== undefined) membershipUpdates.status = status;
    if (resolvedTeamIds !== undefined) membershipUpdates.teamId = resolvedTeamIds[0] ?? null;

    if (Object.keys(membershipUpdates).length > 0) {
      await db.membership.update({
        where: { tenantId_userId: { tenantId, userId: params.id } },
        data: membershipUpdates,
      });
    }

    // Replace UserTeam records if teamIds supplied
    if (resolvedTeamIds !== undefined) {
      await db.userTeam.deleteMany({ where: { tenantId, userId: params.id } });
      for (const teamId of resolvedTeamIds) {
        await db.userTeam.create({ data: { tenantId, userId: params.id, teamId } });
      }
    }

    // Return updated membership with teams
    const updated = await db.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId: params.id } },
      include: {
        user: {
          select: {
            id: true, firstName: true, lastName: true, email: true, avatar: true, lastSignInAt: true,
            userTeams: { where: { tenantId }, include: { team: { select: { id: true, name: true } } } },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        membershipId: updated!.id,
        userId:       updated!.user.id,
        firstName:    updated!.user.firstName,
        lastName:     updated!.user.lastName,
        email:        updated!.user.email,
        avatar:       updated!.user.avatar,
        lastSignInAt: updated!.user.lastSignInAt?.toISOString() ?? null,
        role:         updated!.role,
        teamId:       updated!.teamId,
        teamIds:      updated!.user.userTeams.map(ut => ut.teamId),
        teamNames:    updated!.user.userTeams.map(ut => ut.team.name),
        status:       updated!.status,
        joinedAt:     updated!.createdAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to update user";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// DELETE /api/org/users/[id] — deactivate membership
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    if (params.id === session.user.id)
      return NextResponse.json({ success: false, error: "You cannot remove yourself" }, { status: 400 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId)
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    await db.membership.update({
      where: { tenantId_userId: { tenantId, userId: params.id } },
      data:  { status: "inactive" },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to remove user";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
