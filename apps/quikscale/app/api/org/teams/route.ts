import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("orgSetup.teams");
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { createTeamSchema } from "@/lib/schemas/teamSchema";
import { writeAuditLog } from "@/lib/api/auditLog";
import { rateLimit, LIMITS } from "@/lib/api/rateLimit";

// GET /api/org/teams — all teams with member count and head info
export const GET = withTenantAuth(async ({ tenantId }, req) => {
  const { page, limit, skip, take } = parsePagination(req);
  const where = { tenantId };

  const [teams, total] = await Promise.all([
    db.team.findMany({
      where,
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
      skip,
      take,
    }),
    db.team.count({ where }),
  ]);

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

  return NextResponse.json(paginatedResponse(data, total, page, limit));
}, { fallbackErrorMessage: "Failed to fetch teams" });

// POST /api/org/teams — create team
export const POST = withTenantAuth(async ({ tenantId, userId }, req) => {
  const rl = rateLimit({
    routeKey: "team:create",
    clientKey: `${tenantId}:${userId}`,
    limit: LIMITS.mutation.limit,
    windowMs: LIMITS.mutation.windowMs,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const body = await req.json();
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
      createdBy:   userId,
    },
  });

  await writeAuditLog({
    tenantId,
    actorId: userId,
    action: "CREATE",
    entityType: "Team",
    entityId: team.id,
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
}, { fallbackErrorMessage: "Failed to create team" });
