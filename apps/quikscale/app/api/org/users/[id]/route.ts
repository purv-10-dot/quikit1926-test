import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
// RBAC v2: per-action `User` grants gate PUT/DELETE. Admin role bypass is
// handled by `userCan()` so admins still pass without explicit matrix ticks.
const auth = withOrgAuthForResource("orgSetup.users", "User");
import { updateOrgUserSchema } from "@/lib/schemas/userSchema";
import { writeAuditLog } from "@/lib/api/auditLog";


// PUT /api/org/users/[id]
export const PUT = auth.update<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const membership = await db.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId: params.id } },
  });
  if (!membership)
    return NextResponse.json({ success: false, error: "User not found in this organisation" }, { status: 404 });

  const parsed = updateOrgUserSchema.safeParse(await req.json());
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message ?? "Invalid input";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
  const { firstName, lastName, email, password, status, teamIds, teamId } = parsed.data;
  // OrgMember.role is pinned to "member" — app-level authority lives in
  // app_quikscale.UserAppRole. Ignore any `role` value the client tries to PUT.
  const role: string | undefined = undefined;
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
    await db.orgMember.update({
      where: { orgId_userId: { orgId, userId: params.id } },
      data: membershipUpdates,
    });
  }

  // Replace UserTeam records if teamIds supplied
  if (resolvedTeamIds !== undefined) {
    await db.qsUserTeam.deleteMany({ where: { orgId, userId: params.id } });
    for (const teamId of resolvedTeamIds) {
      await db.qsUserTeam.create({ data: { orgId, userId: params.id, teamId } });
    }
  }

  // Return updated membership with teams
  const updated = await db.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId: params.id } },
    include: {
      user: {
        select: {
          id: true, firstName: true, lastName: true, email: true, avatar: true, lastSignInAt: true,
          qsUserTeams: { where: { orgId }, include: { team: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  await writeAuditLog({
    orgId,
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
      teamIds:      updated!.user.qsUserTeams.map(ut => ut.teamId),
      teamNames:    updated!.user.qsUserTeams.map(ut => ut.team.name),
      status:       updated!.status,
      joinedAt:     updated!.createdAt.toISOString(),
    },
  });
}, { fallbackErrorMessage: "Failed to update user" });

// DELETE /api/org/users/[id] — deactivate membership
export const DELETE = auth.delete<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  if (params.id === userId)
    return NextResponse.json({ success: false, error: "You cannot remove yourself" }, { status: 400 });

  await db.orgMember.update({
    where: { orgId_userId: { orgId, userId: params.id } },
    data:  { status: "inactive" },
  });

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "DELETE",
    entityType: "User",
    entityId: params.id,
    reason: "Membership deactivated",
  });

  return NextResponse.json({ success: true });
}, { fallbackErrorMessage: "Failed to remove user" });
