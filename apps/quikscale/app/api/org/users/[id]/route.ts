import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("orgSetup.users");
import { updateOrgUserSchema } from "@/lib/schemas/userSchema";
import { writeAuditLog } from "@/lib/api/auditLog";


// PUT /api/org/users/[id]
export const PUT = withTenantAuth<{ id: string }>(async ({ tenantId, userId }, req, { params }) => {
  const membership = await db.membership.findUnique({
    where: { tenantId_userId: { tenantId, userId: params.id } },
  });
  if (!membership)
    return NextResponse.json({ success: false, error: "User not found in this organisation" }, { status: 404 });

  const parsed = updateOrgUserSchema.safeParse(await req.json());
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message ?? "Invalid input";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
  const { firstName, lastName, email, password, role, status, teamIds, teamId } = parsed.data;
  const resolvedTeamIds: string[] | undefined =
    teamIds !== undefined ? teamIds :
    teamId !== undefined ? (teamId ? [teamId] : []) :
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

  await writeAuditLog({
    tenantId,
    actorId: userId,
    action: "UPDATE",
    entityType: "User",
    entityId: params.id,
    changes: [
      ...Object.keys(userUpdates).filter((k) => k !== "password"),
      ...(Object.keys(userUpdates).includes("password") ? ["password-changed"] : []),
      ...Object.keys(membershipUpdates),
      ...(resolvedTeamIds !== undefined ? ["teams"] : []),
    ],
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
}, { fallbackErrorMessage: "Failed to update user" });

// DELETE /api/org/users/[id] — deactivate membership
export const DELETE = withTenantAuth<{ id: string }>(async ({ tenantId, userId }, req, { params }) => {
  if (params.id === userId)
    return NextResponse.json({ success: false, error: "You cannot remove yourself" }, { status: 400 });

  await db.membership.update({
    where: { tenantId_userId: { tenantId, userId: params.id } },
    data:  { status: "inactive" },
  });

  await writeAuditLog({
    tenantId,
    actorId: userId,
    action: "DELETE",
    entityType: "User",
    entityId: params.id,
    reason: "Membership deactivated",
  });

  return NextResponse.json({ success: true });
}, { fallbackErrorMessage: "Failed to remove user" });
