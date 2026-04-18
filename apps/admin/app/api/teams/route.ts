import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";
import { createTeamSchema } from "@/lib/schemas/teamSchema";
import { slugify } from "@/lib/utils";

export const GET = withAdminAuth(async ({ tenantId }, request: NextRequest) => {
  const blocked = await gateModuleApi("admin", "teams", tenantId);
  if (blocked) return blocked as NextResponse;

  // Pagination
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50));
  const skip = (page - 1) * limit;

  const [teams, total] = await Promise.all([
    db.team.findMany({
      where: { tenantId },
      include: {
        userTeams: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
            },
          },
        },
        parentTeam: { select: { id: true, name: true } },
        childTeams: { select: { id: true, name: true, color: true } },
      },
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
    db.team.count({ where: { tenantId } }),
  ]);

  // Resolve head names
  const headIds = teams.map((t) => t.headId).filter(Boolean) as string[];
  const heads = headIds.length > 0
    ? await db.user.findMany({
        where: { id: { in: headIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const headMap = new Map(heads.map((h) => [h.id, h]));

  const data = teams.map((t) => {
    const head = t.headId ? headMap.get(t.headId) : null;
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      slug: t.slug,
      color: t.color,
      headId: t.headId,
      headName: head ? `${head.firstName} ${head.lastName}` : null,
      parentTeamId: t.parentTeamId,
      parentTeamName: t.parentTeam?.name ?? null,
      childTeams: t.childTeams,
      memberCount: t.userTeams.length,
      members: t.userTeams.map((ut) => ({
        id: ut.user.id,
        firstName: ut.user.firstName,
        lastName: ut.user.lastName,
        email: ut.user.email,
        avatar: ut.user.avatar,
      })),
      createdAt: t.createdAt.toISOString(),
    };
  });

  return NextResponse.json({
    success: true,
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

export const POST = withAdminAuth(async ({ tenantId, userId }, request: NextRequest) => {
  const blocked = await gateModuleApi("admin", "teams", tenantId);
  if (blocked) return blocked as NextResponse;
  const body = await request.json();

  const parsed = createTeamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const { name, description, color, headId, parentTeamId } = parsed.data;

  // Check unique name per tenant
  const existing = await db.team.findFirst({
    where: {
      tenantId,
      name: { equals: name, mode: "insensitive" },
    },
  });

  if (existing) {
    return NextResponse.json(
      { success: false, error: "A team with this name already exists" },
      { status: 409 }
    );
  }

  const baseSlug = slugify(name);
  const slug = `${baseSlug}-${Date.now()}`;

  const team = await db.team.create({
    data: {
      tenantId,
      name,
      description,
      slug,
      color: color || "#0066cc",
      headId,
      parentTeamId,
      createdBy: userId,
    },
  });

  return NextResponse.json({
    success: true,
    data: { ...team, memberCount: 0, members: [] },
  });
});
