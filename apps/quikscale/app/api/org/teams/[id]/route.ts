import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getTenantId } from "@/lib/api/getTenantId";
import { toErrorMessage } from "@/lib/api/errors";
import { updateTeamSchema } from "@/lib/schemas/teamSchema";


// PUT /api/org/teams/[id] — update team
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId)
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const existing = await db.team.findFirst({ where: { id: params.id, tenantId } });
    if (!existing)
      return NextResponse.json({ success: false, error: "Team not found" }, { status: 404 });

    const parsed = updateTeamSchema.safeParse(await request.json());
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? "Invalid input";
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }
    const { name, description, color, headId } = parsed.data;

    // Check name uniqueness if name is being changed
    if (name?.trim() && name.trim().toLowerCase() !== existing.name.toLowerCase()) {
      const dup = await db.team.findFirst({
        where: { tenantId, name: { equals: name.trim(), mode: "insensitive" }, id: { not: params.id } },
      });
      if (dup)
        return NextResponse.json({ success: false, error: `A team named "${dup.name}" already exists` }, { status: 409 });
    }

    const team = await db.team.update({
      where: { id: params.id },
      data: {
        name:        name?.trim()        || undefined,
        description: description !== undefined ? (description?.trim() || null) : undefined,
        color:       color               || undefined,
        headId:      headId !== undefined ? (headId || null) : undefined,
      },
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
    const memberCount = await db.membership.count({
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
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: toErrorMessage(error, "Failed to update team") }, { status: 500 });
  }
}

// DELETE /api/org/teams/[id] — delete team
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId)
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const existing = await db.team.findFirst({ where: { id: params.id, tenantId } });
    if (!existing)
      return NextResponse.json({ success: false, error: "Team not found" }, { status: 404 });

    // Soft delete — set deletedAt instead of removing the row so we keep
    // historical KPI/priority references intact.
    await db.team.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: toErrorMessage(error, "Failed to delete team") }, { status: 500 });
  }
}
