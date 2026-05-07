import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
const withOrgAuth = withOrgAuthForModule("www");
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { createWWWSchema } from "@/lib/schemas/wwwSchema";
import { validationError } from "@/lib/api/validationError";
import { writeAuditLog } from "@/lib/api/auditLog";
import { rateLimit, LIMITS } from "@/lib/api/rateLimit";
import { notifyWWWAssignment } from "@/lib/services/wwwNotifications";

// GET /api/www — list all WWWItems for tenant
export const GET = withOrgAuth(async ({ orgId }, req) => {
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
  if (search) {
    where.OR = [
      { what:  { contains: search, mode: "insensitive" } },
      { notes: { contains: search, mode: "insensitive" } },
    ];
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

  // Build user map covering BOTH legacy single `who` and new `whoIds[]`.
  // Note: cached Prisma types may not yet include `whoIds` until the dev
  // server restarts and re-runs `prisma generate`. Read it via an unknown
  // cast in the meantime — the column exists in the DB after migration.
  const allIds = new Set<string>();
  for (const i of items) {
    if (i.who) allIds.add(i.who);
    const ids = ((i as unknown as { whoIds?: string[] }).whoIds) ?? [];
    for (const id of ids) allIds.add(id);
  }
  const users = allIds.size
    ? await db.user.findMany({
        where: { id: { in: [...allIds] } },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : [];
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  const result = items.map(item => {
    const rawIds = (item as unknown as { whoIds?: string[] }).whoIds ?? [];
    const ids = rawIds.length > 0 ? rawIds : item.who ? [item.who] : [];
    return {
      ...item,
      whoIds: ids,
      when: item.when.toISOString(),
      originalDueDate: item.originalDueDate?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      who_user: userMap[item.who] ?? null,
      who_users: ids.map(id => userMap[id]).filter(Boolean),
    };
  });

  return NextResponse.json(paginatedResponse(result, total, page, limit));
});

// POST /api/www — create a WWWItem
export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
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

  // Resolve assignee list. The Zod refine guarantees at least one of
  // `who` / `whoIds` is set. `who` is mirrored as the primary assignee for
  // legacy indexes / sort columns and equals whoIds[0].
  const resolvedIds = (whoIds && whoIds.length > 0)
    ? whoIds
    : who ? [who] : [];
  const primaryWho = resolvedIds[0]!;

  const item = await db.wWWItem.create({
    data: {
      orgId,
      who: primaryWho,
      ...({ whoIds: resolvedIds } as { whoIds: string[] }),
      what,
      when: new Date(when),
      status: status ?? "not-yet-started",
      notes: notes ?? null,
      category: category ?? null,
      originalDueDate: originalDueDate ? new Date(originalDueDate) : null,
      revisedDates: [],
      createdBy: userId,
    } as Parameters<typeof db.wWWItem.create>[0]["data"],
  });

  // Hydrate full assignee list for the response.
  const assignees = await db.user.findMany({
    where: { id: { in: resolvedIds } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  const whoUser = assignees.find(u => u.id === primaryWho) ?? null;

  const result = {
    ...item,
    whoIds: resolvedIds,
    when: item.when.toISOString(),
    originalDueDate: item.originalDueDate?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    who_user: whoUser,
    who_users: resolvedIds.map(id => assignees.find(u => u.id === id)).filter(Boolean),
  };

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "CREATE",
    entityType: "WWWItem",
    entityId: item.id,
    newValues: item,
  });

  if (resolvedIds.length > 0) {
    notifyWWWAssignment({
      orgId,
      itemId: item.id,
      what: item.what,
      when: item.when,
      creatorUserId: userId,
      ownerUserIds: resolvedIds,
    }).catch((err) => {
      console.error("[POST /api/www] notifyWWWAssignment failed:", err);
    });
  }

  return NextResponse.json({ success: true, data: result }, { status: 201 });
});
