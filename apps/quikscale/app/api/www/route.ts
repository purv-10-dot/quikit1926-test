import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
const auth = withOrgAuthForResource("www", "WWW");
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { createWWWSchema } from "@/lib/schemas/wwwSchema";
import { validationError } from "@/lib/api/validationError";
import { writeAuditLog } from "@/lib/api/auditLog";
import { audit, requestContext } from "@/lib/audit";
import { rateLimit, LIMITS } from "@/lib/api/rateLimit";
import { notifyWWWAssignment } from "@/lib/services/wwwNotifications";
import { isOrgAdmin } from "@/lib/api/visibility";
import { fetchAuditUserMap, decorateAudit } from "@/lib/api/auditUsers";

// GET /api/www — list all WWWItems for tenant
export const GET = auth.view(async ({ orgId, userId }, req) => {
  const searchParams = req.nextUrl.searchParams;
  const search = searchParams.get("search") || undefined;
  const status = searchParams.get("status") || undefined;
  const sortBy = searchParams.get("sortBy") || "createdAt";
  const sortOrder = (searchParams.get("sortOrder") || "asc") as "asc" | "desc";
  const { page, limit, skip, take } = parsePagination(req);

  const includeDeleted = searchParams.get("includeDeleted") === "true";
  const where: Record<string, unknown> = { orgId };
  where.deletedAt = includeDeleted ? { not: null } : null;
  if (status) where.status = status;

  // Row-level visibility: admins see all WWW items, non-admins see only
  // items where they are the `who` (assigned person).
  const wwwAdminBypass = await isOrgAdmin(userId, orgId);
  if (!wwwAdminBypass) {
    where.who = userId;
  }

  if (search) {
    const searchOr = [
      { what:  { contains: search, mode: "insensitive" } },
      { notes: { contains: search, mode: "insensitive" } },
    ];
    // Don't blow away any prior OR (none here today, but guard anyway).
    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: searchOr }];
      delete where.OR;
    } else {
      where.OR = searchOr;
    }
  }

  // Allowed sort fields
  const sortMap: Record<string, Record<string, "asc" | "desc">> = {
    who: { who: sortOrder },
    when: { when: sortOrder },
    what: { what: sortOrder },
    revisedDate: { when: sortOrder }, // revisedDates is JSON array; fall back to when
    status: { status: sortOrder },
    notes: { notes: sortOrder },
    createdAt: { createdAt: sortOrder },
  };
  const orderBy = sortMap[sortBy] || { createdAt: sortOrder };

  const [items, total] = await Promise.all([
    db.wWWItem.findMany({
      where,
      orderBy: orderBy as any,
      skip,
      take,
    }),
    db.wWWItem.count({ where }),
  ]);

  // Single-`who` storage: synthesize `whoIds` and `who_users` from the
  // persisted scalar so existing frontend consumers continue to work.
  const allIds = new Set<string>();
  for (const i of items) if (i.who) allIds.add(i.who);
  const users = allIds.size
    ? await db.user.findMany({
        where: { id: { in: [...allIds] } },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : [];
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  // Resolve createdBy/updatedBy → name + initials so the WWW table can
  // paint the audit columns without a second round-trip.
  const auditMap = await fetchAuditUserMap(items);

  const result = items.map(item => {
    const ids = item.who ? [item.who] : [];
    return decorateAudit({
      ...item,
      whoIds: ids,
      when: item.when.toISOString(),
      originalDueDate: item.originalDueDate?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      who_user: userMap[item.who] ?? null,
      who_users: ids.map(id => userMap[id]).filter(Boolean),
    }, auditMap);
  });

  return NextResponse.json(paginatedResponse(result, total, page, limit));
});

// POST /api/www — create a WWWItem
export const POST = auth.create(async ({ orgId, userId }, req) => {
  const rl = rateLimit({
    routeKey: "www:create",
    clientKey: `${orgId}:${userId}`,
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
  const parsed = createWWWSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { who, whoIds, what, when, status, notes, category, originalDueDate } = parsed.data;

  // Resolve assignee list. Zod refine guarantees at least one of `who`/`whoIds`
  // is set. Dedupe so an accidental duplicate selection doesn't create dupes.
  const resolvedIds = Array.from(
    new Set(
      (whoIds && whoIds.length > 0) ? whoIds : (who ? [who] : []),
    ),
  );
  const primaryWho = resolvedIds[0]!;

  // Fan out: one WWWItem record per selected assignee, atomically. Each row
  // owns a single `who`, mirroring the list view's "one row = one assignee"
  // shape so each assignee can independently update their own status / notes.
  const commonData = {
    orgId,
    what,
    when: new Date(when),
    status: status ?? "not-yet-started",
    notes: notes ?? null,
    category: category ?? null,
    originalDueDate: originalDueDate ? new Date(originalDueDate) : null,
    revisedDates: [] as string[],
    createdBy: userId,
  };
  const createdItems = await db.$transaction(
    resolvedIds.map((whoId) =>
      db.wWWItem.create({
        data: { ...commonData, who: whoId },
      }),
    ),
  );
  const primaryItem = createdItems[0]!;

  // Hydrate full assignee list for the response.
  const assignees = await db.user.findMany({
    where: { id: { in: resolvedIds } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  const whoUser = assignees.find(u => u.id === primaryWho) ?? null;

  // Return the first record in the existing single-item envelope shape so the
  // useCreate hook continues to work; the list refetch surfaces the rest.
  const result = {
    ...primaryItem,
    whoIds: resolvedIds,
    when: primaryItem.when.toISOString(),
    originalDueDate: primaryItem.originalDueDate?.toISOString() ?? null,
    createdAt: primaryItem.createdAt.toISOString(),
    updatedAt: primaryItem.updatedAt.toISOString(),
    who_user: whoUser,
    who_users: resolvedIds.map(id => assignees.find(u => u.id === id)).filter(Boolean),
  };

  // One audit log per created row.
  const ctx = requestContext(req);
  for (const item of createdItems) {
    await writeAuditLog({
      orgId,
      actorId: userId,
      action: "CREATE",
      entityType: "WWWItem",
      entityId: item.id,
      newValues: item,
    });
    // ── Centralized audit (dual-write) ── CREATE event with the full
    // post-state snapshot so the Change History Create card shows all values.
    await audit.log({
      entityType: "WWW",
      entityId: item.id,
      action: "CREATE",
      actor: { userId, orgId, teamId: null },
      snapshot: item,
      ...ctx,
    });
  }

  // One notification per assignee, scoped to their own row.
  for (const item of createdItems) {
    notifyWWWAssignment({
      orgId,
      itemId: item.id,
      what: item.what,
      when: item.when,
      creatorUserId: userId,
      ownerUserIds: [item.who],
    }).catch((err) => {
      console.error("[POST /api/www] notifyWWWAssignment failed:", err);
    });
  }

  return NextResponse.json(
    {
      success: true,
      data: result,
      message: createdItems.length > 1
        ? `Created ${createdItems.length} WWW items`
        : "WWW item created",
    },
    { status: 201 },
  );
});
