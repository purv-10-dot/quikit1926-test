import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { createClientMemberSchema } from "@/lib/schemas/clientMeetingsSchema";
import { writeAuditLog } from "@/lib/api/auditLog";

const withTenantAuth = withTenantAuthForModule("clientMeetings.members");

/**
 * GET /api/client-meetings/members
 *   ?includeDeleted=true → return ONLY soft-deleted rows (trash view)
 */
export const GET = withTenantAuth(async ({ tenantId }, request) => {
  const includeDeleted = new URL(request.url).searchParams.get("includeDeleted") === "true";
  const rows = await db.clientMember.findMany({
    where: { tenantId, deletedAt: includeDeleted ? { not: null } : null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, name: true, email: true,
      createdAt: true, updatedAt: true,
      createdBy: true, updatedBy: true,
    },
  });

  // Resolve actor initials/names (like WWW's table did).
  const actorIds = [...new Set(rows.flatMap(r => [r.createdBy, r.updatedBy].filter(Boolean) as string[]))];
  const users = actorIds.length
    ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const actorMap: Record<string, { name: string; initials: string }> = {};
  for (const u of users) {
    actorMap[u.id] = {
      name: `${u.firstName} ${u.lastName}`.trim(),
      initials: `${u.firstName[0] ?? ""}${u.lastName[0] ?? ""}`.toUpperCase() || "??",
    };
  }

  return NextResponse.json({
    success: true,
    data: rows.map((r, i) => ({
      id: r.id,
      displayId: i + 1,
      name: r.name,
      email: r.email,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      createdBy: r.createdBy,
      createdByName: actorMap[r.createdBy]?.name ?? "—",
      createdByInitials: actorMap[r.createdBy]?.initials ?? "??",
      updatedBy: r.updatedBy,
      updatedByName: r.updatedBy ? actorMap[r.updatedBy]?.name ?? "—" : null,
      updatedByInitials: r.updatedBy ? actorMap[r.updatedBy]?.initials ?? "??" : null,
    })),
  });
});

/** POST — create. Any tenant member. */
export const POST = withTenantAuth(async ({ tenantId, userId }, request) => {
  const parsed = createClientMemberSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });

  const { name, email } = parsed.data;

  // Block duplicate emails within tenant.
  const existing = await db.clientMember.findFirst({ where: { tenantId, email, deletedAt: null } });
  if (existing)
    return NextResponse.json({ success: false, error: "A member with that email already exists" }, { status: 409 });

  const created = await db.clientMember.create({
    data: { tenantId, name, email, createdBy: userId },
  });

  await writeAuditLog({
    tenantId, actorId: userId, action: "CREATE",
    entityType: "ClientMember", entityId: created.id,
    newValues: { name: created.name, email: created.email },
  });

  return NextResponse.json({ success: true, data: { id: created.id } }, { status: 201 });
});
