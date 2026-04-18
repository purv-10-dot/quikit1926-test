import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";
import { updateTeamSchema } from "@/lib/schemas/teamSchema";

export const GET = withAdminAuth<{ id: string }>(async ({ tenantId }, _request, { params }) => {
  const blocked = await gateModuleApi("admin", "teams", tenantId);
  if (blocked) return blocked as NextResponse;

  const team = await db.team.findFirst({
    where: { id: params.id, tenantId },
    include: {
      userTeams: {
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
          },
        },
      },
      parentTeam: { select: { id: true, name: true } },
      childTeams: {
        select: { id: true, name: true, color: true },
        orderBy: { name: "asc" },
      },
    },
  });

  if (!team) {
    return NextResponse.json({ success: false, error: "Team not found" }, { status: 404 });
  }

  let headName: string | null = null;
  if (team.headId) {
    const head = await db.user.findUnique({
      where: { id: team.headId },
      select: { firstName: true, lastName: true },
    });
    if (head) headName = `${head.firstName} ${head.lastName}`;
  }

  return NextResponse.json({
    success: true,
    data: {
      id: team.id,
      name: team.name,
      description: team.description,
      slug: team.slug,
      color: team.color,
      headId: team.headId,
      headName,
      parentTeamId: team.parentTeamId,
      parentTeamName: team.parentTeam?.name ?? null,
      childTeams: team.childTeams,
      memberCount: team.userTeams.length,
      members: team.userTeams.map((ut) => ({
        id: ut.user.id,
        firstName: ut.user.firstName,
        lastName: ut.user.lastName,
        email: ut.user.email,
        avatar: ut.user.avatar,
      })),
      createdAt: team.createdAt.toISOString(),
    },
  });
});

export const PATCH = withAdminAuth<{ id: string }>(async ({ tenantId }, request: NextRequest, { params }) => {
  const blocked = await gateModuleApi("admin", "teams", tenantId);
  if (blocked) return blocked as NextResponse;

  const team = await db.team.findFirst({
    where: { id: params.id, tenantId },
  });

  if (!team) {
    return NextResponse.json({ success: false, error: "Team not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateTeamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const { name, description, color, headId, parentTeamId } = parsed.data;

  // If renaming, check uniqueness
  if (name && name.toLowerCase() !== team.name.toLowerCase()) {
    const existing = await db.team.findFirst({
      where: {
        tenantId,
        name: { equals: name, mode: "insensitive" },
        id: { not: team.id },
      },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "A team with this name already exists" },
        { status: 409 }
      );
    }
  }

  // Prevent circular parent reference
  if (parentTeamId === params.id) {
    return NextResponse.json(
      { success: false, error: "A team cannot be its own parent" },
      { status: 400 }
    );
  }

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (color !== undefined) updateData.color = color;
  if (headId !== undefined) updateData.headId = headId;
  if (parentTeamId !== undefined) updateData.parentTeamId = parentTeamId;

  const updated = await db.team.update({
    where: { id: params.id },
    data: updateData,
  });

  return NextResponse.json({ success: true, data: updated });
});

export const DELETE = withAdminAuth<{ id: string }>(async ({ tenantId }, _request, { params }) => {
  const blocked = await gateModuleApi("admin", "teams", tenantId);
  if (blocked) return blocked as NextResponse;

  const team = await db.team.findFirst({
    where: { id: params.id, tenantId },
    include: { _count: { select: { userTeams: true, childTeams: true } } },
  });

  if (!team) {
    return NextResponse.json({ success: false, error: "Team not found" }, { status: 404 });
  }

  if (team._count.childTeams > 0) {
    return NextResponse.json(
      { success: false, error: "Cannot delete a team that has child teams. Reassign or remove child teams first." },
      { status: 400 }
    );
  }

  // Remove team member associations, then delete team
  await db.userTeam.deleteMany({ where: { teamId: params.id, tenantId } });
  await db.membership.updateMany({
    where: { teamId: params.id, tenantId },
    data: { teamId: null },
  });
  await db.team.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true, message: "Team deleted" });
});
