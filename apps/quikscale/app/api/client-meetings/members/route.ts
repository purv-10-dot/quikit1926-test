import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { createClientMemberSchema } from "@/lib/schemas/clientMeetingsSchema";
import { writeAuditLog } from "@/lib/api/auditLog";
import { audit, requestContext } from "@/lib/audit";
import { parseSort, type SortDirection } from "@/lib/api/parseSort";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";

const withOrgAuth = withOrgAuthForModule("clientMeetings.members");

const MEMBER_SORT_WHITELIST = ["name", "email", "createdAt", "updatedAt"] as const;

function mapMemberSort(key: string, dir: SortDirection): Prisma.ClientMemberOrderByWithRelationInput {
  if (key === "name") return { name: dir };
  if (key === "email") return { email: dir };
  if (key === "updatedAt") return { updatedAt: dir };
  return { createdAt: key === "createdAt" ? dir : "asc" };
}

/**
 * GET /api/client-meetings/members
 *   ?includeDeleted=true → return ONLY soft-deleted rows (trash view)
 *   ?sortBy=<col>&sortOrder=<asc|desc> → server-side sort (whitelist enforced).
 *     Falls back to the historical `createdAt asc` when omitted/invalid.
 */
export const GET = withOrgAuth(async ({ orgId }, request) => {
  const sp = new URL(request.url).searchParams;
  const includeDeleted = sp.get("includeDeleted") === "true";
  const search = (sp.get("search") ?? "").trim();
  // Optional: restrict to a single client's roster (drives the per-client
  // Absent Member / Weekly-NA infinite pickers without loading the full roster).
  const clientId = sp.get("clientId") || undefined;
  // Optional: narrow to one member (the Members page "Name" filter).
  const memberId = sp.get("memberId") || undefined;
  const { sortBy, sortOrder, orderBy } = parseSort(request, MEMBER_SORT_WHITELIST, mapMemberSort);
  const { page, limit, skip, take } = parsePagination(request);

  const where: Prisma.ClientMemberWhereInput = {
    orgId,
    deletedAt: includeDeleted ? { not: null } : null,
    ...(memberId ? { id: memberId } : {}),
    ...(clientId ? { clientLinks: { some: { clientId } } } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.clientMember.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        id: true, name: true, email: true,
        createdAt: true, updatedAt: true,
        createdBy: true, updatedBy: true,
      },
    }),
    db.clientMember.count({ where }),
  ]);

  // Case-insensitive name ordering (Prisma can't LOWER()); re-sort the page.
  if (sortBy === "name") {
    const dir = sortOrder === "desc" ? -1 : 1;
    rows.sort((a, b) => dir * a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

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

  const data = rows.map((r, i) => ({
      id: r.id,
      displayId: skip + i + 1,
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
    }));

  return NextResponse.json(paginatedResponse(data, total, page, limit));
});

/** POST — create. Any tenant member. */
export const POST = withOrgAuth(async ({ orgId, userId }, request) => {
  const parsed = createClientMemberSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });

  const { name, email } = parsed.data;

  // Block duplicate emails within tenant.
  const existing = await db.clientMember.findFirst({ where: { orgId, email, deletedAt: null } });
  if (existing)
    return NextResponse.json({ success: false, error: "A member with that email already exists" }, { status: 409 });

  const created = await db.clientMember.create({
    data: { orgId, name, email, createdBy: userId },
  });

  await writeAuditLog({
    orgId, actorId: userId, action: "CREATE",
    entityType: "ClientMember", entityId: created.id,
    newValues: { name: created.name, email: created.email },
  });

  // ── Centralized audit (dual-write) ── CREATE with the full snapshot.
  await audit.log({
    entityType: "CLIENT_MEMBER",
    entityId: created.id,
    action: "CREATE",
    actor: { userId, orgId, teamId: null },
    snapshot: { name: created.name, email: created.email },
    ...requestContext(request),
  });

  return NextResponse.json({ success: true, data: { id: created.id } }, { status: 201 });
});
