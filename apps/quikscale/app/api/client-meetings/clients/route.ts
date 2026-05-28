import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { createClientSchema } from "@/lib/schemas/clientMeetingsSchema";
import { toErrorMessage } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/api/auditLog";
import { parseSort, type SortDirection } from "@/lib/api/parseSort";

const withOrgAuth = withOrgAuthForModule("clientMeetings.clients");

const CLIENT_SORT_WHITELIST = [
  "name",
  "createdAt",
  "updatedAt",
  "isActive",
  "weeklyStartTime",
  "dailyStartTime",
] as const;

function mapClientSort(key: string, dir: SortDirection): Prisma.ClientOrderByWithRelationInput {
  if (key === "name") return { name: dir };
  if (key === "updatedAt") return { updatedAt: dir };
  if (key === "isActive") return { isActive: dir };
  if (key === "weeklyStartTime") return { weeklyStartTime: dir };
  if (key === "dailyStartTime") return { dailyStartTime: dir };
  return { createdAt: key === "createdAt" ? dir : "asc" }; // default preserves the legacy order
}

/**
 * GET /api/client-meetings/clients
 *   ?includeDeleted=true → return ONLY soft-deleted rows (trash view).
 *   ?sortBy=<col>&sortOrder=<asc|desc> → server-side sort (whitelist enforced).
 *     Falls back to the historical `createdAt asc` when omitted/invalid.
 */
export const GET = withOrgAuth(async ({ orgId }, request) => {
  const includeDeleted = new URL(request.url).searchParams.get("includeDeleted") === "true";
  const { orderBy } = parseSort(request, CLIENT_SORT_WHITELIST, mapClientSort);
  const rows = await db.client.findMany({
    where: { orgId, deletedAt: includeDeleted ? { not: null } : null },
    orderBy,
    include: {
      teamMembers: { include: { member: { select: { id: true, name: true, email: true } } } },
      _count: { select: { memberships: { where: { deletedAt: null } } } },
    },
  });

  // Actor name/initials resolution (same pattern as Client Members).
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
      description: r.description,
      isActive: r.isActive,
      startDate: r.startDate?.toISOString() ?? null,
      weeklyStartTime: r.weeklyStartTime, weeklyEndTime: r.weeklyEndTime,
      dailyStartTime: r.dailyStartTime,   dailyEndTime: r.dailyEndTime,
      teamMembers: r.teamMembers.map(tm => ({ id: tm.member.id, name: tm.member.name, email: tm.member.email })),
      userMemberCount: r._count.memberships,
      createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
      createdBy: r.createdBy,
      createdByName: actorMap[r.createdBy]?.name ?? "—",
      createdByInitials: actorMap[r.createdBy]?.initials ?? "??",
      updatedBy: r.updatedBy,
      updatedByName: r.updatedBy ? actorMap[r.updatedBy]?.name ?? "—" : null,
      updatedByInitials: r.updatedBy ? actorMap[r.updatedBy]?.initials ?? "??" : null,
    })),
  });
});

/**
 * POST /api/client-meetings/clients — admin-only.
 * Body accepts teamMemberIds[] to populate the client's roster at create time.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId, userId } = auth as { orgId: string; userId: string };

    const parsed = createClientSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const d = parsed.data;

    // Uniqueness check spans soft-deleted rows because the DB constraint
    // `@@unique([orgId, name])` does too — otherwise a trashed name leaks
    // through and Prisma throws P2002 at insert time.
    const existing = await db.client.findFirst({
      where: { orgId, name: d.name },
      select: { id: true, deletedAt: true },
    });
    if (existing) {
      const msg = existing.deletedAt
        ? "A deleted client with that name is still in Trash. Restore it or choose a different name."
        : "A client with that name already exists";
      return NextResponse.json({ success: false, error: msg }, { status: 409 });
    }

    // Confirm all requested team members exist for this tenant.
    if (d.teamMemberIds.length) {
      const validIds = await db.clientMember.findMany({
        where: { id: { in: d.teamMemberIds }, orgId, deletedAt: null },
        select: { id: true },
      });
      if (validIds.length !== d.teamMemberIds.length)
        return NextResponse.json({ success: false, error: "One or more team members are invalid" }, { status: 400 });
    }

    const created = await db.client.create({
      data: {
        orgId,
        name: d.name,
        description: d.description ?? null,
        isActive: d.isActive,
        startDate: d.startDate ? new Date(d.startDate) : null,
        weeklyStartTime: d.weeklyStartTime ?? null,
        weeklyEndTime:   d.weeklyEndTime ?? null,
        dailyStartTime:  d.dailyStartTime ?? null,
        dailyEndTime:    d.dailyEndTime ?? null,
        createdBy: userId,
        teamMembers: {
          create: d.teamMemberIds.map(cmId => ({ orgId, clientMemberId: cmId })),
        },
      },
    });

    await writeAuditLog({
      orgId, actorId: userId, action: "CREATE",
      entityType: "Client", entityId: created.id,
      newValues: {
        name: created.name,
        description: created.description,
        isActive: created.isActive,
        teamMemberIds: d.teamMemberIds,
      },
    });

    return NextResponse.json({ success: true, data: { id: created.id } }, { status: 201 });
  } catch (error: unknown) {
    // Race-loss safety net for the (orgId, name) unique constraint — keep
    // the response shape consistent with the pre-check above.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { success: false, error: "A client with that name already exists" },
        { status: 409 },
      );
    }
    return NextResponse.json({ success: false, error: toErrorMessage(error, "Failed to create client") }, { status: 500 });
  }
}
