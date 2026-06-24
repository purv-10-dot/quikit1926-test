import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
const withOrgAuth = withOrgAuthForModule("orgSetup.teams");
import { updateTeamSchema } from "@/lib/schemas/teamSchema";
import { writeAuditLog } from "@/lib/api/auditLog";


// PUT /api/org/teams/[id] — update team
export const PUT = withOrgAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const existing = await db.qsTeam.findFirst({ where: { id: params.id, orgId } });
  if (!existing)
    return NextResponse.json({ success: false, error: "Team not found" }, { status: 404 });

  const parsed = updateTeamSchema.safeParse(await req.json());
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message ?? "Invalid input";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
  const { name, description, color, headId } = parsed.data;

  // Check name uniqueness if name is being changed
  if (name?.trim() && name.trim().toLowerCase() !== existing.name.toLowerCase()) {
    const dup = await db.qsTeam.findFirst({
      where: { orgId, name: { equals: name.trim(), mode: "insensitive" }, id: { not: params.id } },
    });
    if (dup)
      return NextResponse.json({ success: false, error: `A team named "${dup.name}" already exists` }, { status: 409 });
  }

  const team = await db.qsTeam.update({
    where: { id: params.id },
    data: {
      name:        name?.trim()        || undefined,
      description: description !== undefined ? (description?.trim() || null) : undefined,
      color:       color               || undefined,
      headId:      headId !== undefined ? (headId || null) : undefined,
    },
  });

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "UPDATE",
    entityType: "Team",
    entityId: team.id,
    oldValues: existing,
    newValues: team,
  });

  // Resolve head name
  let headName: string | null = null;
  if (team.headId) {
    const head = await db.user.findUnique({
      where: { id: team.headId },
      select: { firstName: true, lastName: true },
    });
    if (head) headName = `${head.firstName} ${head.lastName}`;
  }

  // Get member count
  const memberCount = await db.orgMember.count({
    where: { teamId: team.id, status: "active" },
  });

  return NextResponse.json({
    success: true,
    data: {
      id:          team.id,
      name:        team.name,
      description: team.description,
      color:       team.color,
      headId:      team.headId,
      headName,
      memberCount,
      createdAt:   team.createdAt.toISOString(),
    },
  });
}, { fallbackErrorMessage: "Failed to update team" });

// DELETE /api/org/teams/[id] — delete team
export const DELETE = withOrgAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const existing = await db.qsTeam.findFirst({ where: { id: params.id, orgId } });
  if (!existing)
    return NextResponse.json({ success: false, error: "Team not found" }, { status: 404 });

  // Soft delete — set deletedAt instead of removing the row so we keep
  // historical KPI/priority references intact.
  await db.qsTeam.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  });

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "DELETE",
    entityType: "Team",
    entityId: params.id,
    oldValues: existing,
  });

  return NextResponse.json({ success: true });
}, { fallbackErrorMessage: "Failed to delete team" });
