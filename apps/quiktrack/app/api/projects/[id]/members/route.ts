import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { addMemberSchema } from "@/lib/validation/member";
import { randomBytes } from "node:crypto";

export const GET = withProjectAccess<{ id: string }>(
  async ({ projectId }) => {
    const members = await db.qtProjectMember.findMany({
      where: { projectId, isDeleted: false },
      include: {
        projectRole: { select: { id: true, name: true } },
      },
      orderBy: { joinedAt: "asc" },
    });

    const userIds = members.map((m) => m.userId);
    const users =
      userIds.length > 0
        ? await db.user.findMany({
            where: { id: { in: userIds } },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              avatar: true,
              lastSignInAt: true,
            },
          })
        : [];
    const userById = new Map(users.map((u) => [u.id, u] as const));

    const data = members.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      projectRoleId: m.projectRoleId,
      projectRole: m.projectRole,
      status: "active",
      teams: [] as string[],
      joinedAt: m.joinedAt,
      user: userById.get(m.userId) ?? null,
    }));

    const pendingInvites = await db.qtInvitation.findMany({
      where: { projectId, acceptedAt: null, revokedAt: null, isDeleted: false },
      select: {
        id: true,
        email: true,
        role: true,
        invitedBy: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: { members: data, pendingInvites },
    });
  },
  { paramKey: "id" },
);

export const POST = withProjectAccess<{ id: string }>(
  async ({ orgId, userId, projectId }, req) => {
    const parsed = addMemberSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }

    if (parsed.data.userId) {
      const tenantUser = await db.orgMember.findFirst({
        where: { userId: parsed.data.userId, orgId, status: "active" },
        select: { userId: true },
      });
      if (!tenantUser) {
        return NextResponse.json(
          { success: false, error: "User is not a member of this tenant" },
          { status: 400 },
        );
      }
      const member = await db.qtProjectMember.upsert({
        where: { projectId_userId: { projectId, userId: parsed.data.userId } },
        create: {
          projectId,
          userId: parsed.data.userId,
          role: parsed.data.role,
          invitedBy: userId,
        },
        update: { role: parsed.data.role, isDeleted: false },
      });
      return NextResponse.json({ success: true, data: member }, { status: 201 });
    }

    const email = parsed.data.email!.toLowerCase();
    const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      const inTenant = await db.orgMember.findFirst({
        where: { userId: existing.id, orgId, status: "active" },
        select: { id: true },
      });
      if (inTenant) {
        const member = await db.qtProjectMember.upsert({
          where: { projectId_userId: { projectId, userId: existing.id } },
          create: {
            projectId,
            userId: existing.id,
            role: parsed.data.role,
            invitedBy: userId,
          },
          update: { role: parsed.data.role, isDeleted: false },
        });
        return NextResponse.json({ success: true, data: member }, { status: 201 });
      }
    }

    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const invitation = await db.qtInvitation.create({
      data: {
        orgId: orgId,
        email,
        projectId,
        role: parsed.data.role,
        token,
        invitedBy: userId,
        expiresAt,
      },
    });

    // TODO(integration): wire to @quikit/shared email helper.
    return NextResponse.json(
      { success: true, data: { invitation, kind: "invited" } },
      { status: 201 },
    );
  },
  { paramKey: "id", requireRoles: ["PROJECT_ADMIN"] },
);
