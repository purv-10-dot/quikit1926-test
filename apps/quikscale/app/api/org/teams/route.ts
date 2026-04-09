import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getTenantId } from "@/lib/api/getTenantId";
import { createTeamSchema } from "@/lib/schemas/teamSchema";

// GET /api/org/teams — all teams with member count and head info
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId)
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const teams = await db.team.findMany({
      where: { tenantId },
      include: {
        members: {
          where: { status: "active" },
          select: {
            userId: true,
            user:   { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    // Resolve head name
    const headIds = teams.map(t => t.headId).filter(Boolean) as string[];
    const heads   = headIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: headIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const headMap = Object.fromEntries(heads.map(h => [h.id, `${h.firstName} ${h.lastName}`]));

    const data = teams.map(t => ({
      id:          t.id,
      name:        t.name,
      description: t.description,
      color:       t.color,
      headId:      t.headId,
      headName:    t.headId ? (headMap[t.headId] ?? null) : null,
      memberCount: t.members.length,
      members:     t.members.map(m => ({
        userId:    m.user.id,
        firstName: m.user.firstName,
        lastName:  m.user.lastName,
        email:     m.user.email,
      })),
      createdAt:   t.createdAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch teams";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// POST /api/org/teams — create team
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId)
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const body = await request.json();
    const parsed = createTeamSchema.safeParse(body);
    if (!parsed.success) {
      const error = parsed.error.errors[0]?.message ?? "Invalid input";
      return NextResponse.json({ success: false, error }, { status: 400 });
    }
    const { name, description, color, headId } = parsed.data;

    const existing = await db.team.findFirst({
      where: { tenantId, name: { equals: name.trim(), mode: "insensitive" } },
    });
    if (existing)
      return NextResponse.json({ success: false, error: `A team named "${existing.name}" already exists` }, { status: 409 });

    const baseSlug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const slug     = `${baseSlug}-${Date.now().toString(36)}`;

    const team = await db.team.create({
      data: {
        tenantId,
        name:        name.trim(),
        description: description?.trim() || null,
        color:       color || "#0066cc",
        headId:      headId || null,
        slug,
        createdBy:   session.user.id,
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

    return NextResponse.json({
      success: true,
      data: {
        id:          team.id,
        name:        team.name,
        description: team.description,
        color:       team.color,
        headId:      team.headId,
        headName,
        memberCount: 0,
        members:     [],
        createdAt:   team.createdAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to create team";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
