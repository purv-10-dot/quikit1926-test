import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";

const addSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["LEAD", "MEMBER"]).default("MEMBER"),
});

async function loadTeam(orgId: string, teamId: string) {
  return db.qtTeam.findFirst({
    where: { id: teamId, orgId: orgId, isDeleted: false },
    select: { id: true, orgId: true },
  });
}

export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId }, _req, { params }) => {
    const team = await loadTeam(orgId, params.id);
    if (!team) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const members = await db.qtTeamMember.findMany({
      where: { teamId: team.id, isDeleted: false },
      orderBy: { joinedAt: "asc" },
    });
    const userIds = members.map((m) => m.userId);
    const users = userIds.length
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return NextResponse.json({
      success: true,
      data: members.map((m) => ({ ...m, user: byId.get(m.userId) ?? null })),
    });
  },
);

export const POST = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    if (!(await hasAdminAccess(userId, orgId))) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const team = await loadTeam(orgId, params.id);
    if (!team) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const parsed = addSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const inTenant = await db.orgMember.findFirst({
      where: { userId: parsed.data.userId, orgId, status: "active" },
      select: { id: true },
    });
    if (!inTenant) {
      return NextResponse.json(
        { success: false, error: "User not in tenant" },
        { status: 400 },
      );
    }
    const member = await db.qtTeamMember.upsert({
      where: { teamId_userId: { teamId: team.id, userId: parsed.data.userId } },
      create: { teamId: team.id, userId: parsed.data.userId, role: parsed.data.role },
      update: { role: parsed.data.role, isDeleted: false },
    });
    return NextResponse.json({ success: true, data: member }, { status: 201 });
  },
);
