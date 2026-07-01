import { NextResponse } from "next/server";
import { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
const auth = withOrgAuthForResource("www", "WWW");
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { createWWWSchema } from "@/lib/schemas/wwwSchema";
import { validationError } from "@/lib/api/validationError";
import { findWWWDuplicate, wwwDuplicateMessage } from "@/lib/api/wwwDuplicate";
import { writeAuditLog } from "@/lib/api/auditLog";
import { audit, requestContext } from "@/lib/audit";
import { rateLimit, LIMITS } from "@/lib/api/rateLimit";
import { notifyWWWAssignment } from "@/lib/services/wwwNotifications";
import { isOrgAdmin } from "@/lib/api/visibility";
import { fetchAuditUserMap, decorateAudit } from "@/lib/api/auditUsers";
import { searchUserIds, dateSearchConditions } from "@/lib/api/listSearch";

// GET /api/www — list all WWWItems for tenant
export const GET = auth.view(async ({ orgId, userId }, req) => {
  const searchParams = req.nextUrl.searchParams;
  const search = searchParams.get("search") || undefined;
  const status = searchParams.get("status") || undefined;
  const sortBy = searchParams.get("sortBy") || "createdAt";
  // Default to newest-first so freshly created items land at the top of page 1
  // (matches KPI). Explicit ?sortOrder= from the client still wins.
  const sortOrder = (searchParams.get("sortOrder") || "desc") as "asc" | "desc";
  const { page, limit, skip, take } = parsePagination(req);

  const whoFilter = searchParams.get("who") || undefined;
  const teamFilter = searchParams.get("teamId") || undefined;

  const includeDeleted = searchParams.get("includeDeleted") === "true";
  // Typed so the `orgId` tenant filter can't be silently dropped by a future edit.
  const where: Prisma.WWWItemWhereInput = { orgId };
  where.deletedAt = includeDeleted ? { not: null } : null;
  // `status` accepts a single value (`status=completed`) or a comma-separated
  // set (`status=on-track,behind-schedule`). The Dashboard WWW section uses a
  // multi-select status filter, so a set maps to `status IN (...)`. An empty
  // set (every status unchecked) forces an empty result via a sentinel.
  if (status) {
    const statuses = status.split(",").map((s) => s.trim()).filter(Boolean);
    if (statuses.length === 1) where.status = statuses[0];
    else if (statuses.length > 1) where.status = { in: statuses };
    else where.status = "__none__";
  }

  // Row-level visibility: admins see all WWW items, non-admins see only
  // items where they are the `who` (assigned person). An explicit who/team
  // filter can only NARROW within that scope.
  const wwwAdminBypass = await isOrgAdmin(userId, orgId);
  if (!wwwAdminBypass) {
    where.who = userId;
  } else if (whoFilter) {
    where.who = whoFilter; // explicit assignee filter takes precedence over team
  } else if (teamFilter) {
    const members = await db.orgMember.findMany({
      where: { orgId, teamId: teamFilter, status: "active" },
      select: { userId: true },
    });
    const memberIds = members.map((m) => m.userId);
    where.who = memberIds.length > 0 ? { in: memberIds } : "__no_team_members__";
  }

  if (search) {
    // Global search across every visible WWW column: what/notes, who (assignee
    // name), created-by/updated-by, status, and the date columns (when, created,
    // updated) understanding year / full-date / month-name terms.
    const matchedIds = await searchUserIds(db, search);
    const searchOr: Prisma.WWWItemWhereInput[] = [
      { what:  { contains: search, mode: "insensitive" } },
      { notes: { contains: search, mode: "insensitive" } },
      { status: { contains: search, mode: "insensitive" } },
    ];
    if (matchedIds.length) {
      searchOr.push({ who: { in: matchedIds } });
      searchOr.push({ createdBy: { in: matchedIds } });
      searchOr.push({ updatedBy: { in: matchedIds } });
    }
    for (const cond of dateSearchConditions(["when", "createdAt", "updatedAt"], search)) {
      searchOr.push(cond as Prisma.WWWItemWhereInput);
    }
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
  // Stable `id` tie-breaker so equal-sort rows keep a deterministic order
  // across pages.
  const orderBy = [sortMap[sortBy] || { createdAt: sortOrder }, { id: "desc" }];

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

  // ── Duplicate guard ── reject (409) before creating anything:
  //   • an assignee already has an item due on the same calendar day, OR
  //   • the "What?" name already exists anywhere in the org.
  const duplicate = await findWWWDuplicate(db, orgId, { whoIds: resolvedIds, what, when });
  if (duplicate) {
    return NextResponse.json(
      { success: false, error: await wwwDuplicateMessage(db, duplicate) },
      { status: 409 },
    );
  }

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

  // One audit log per created row. Written in parallel rather than in a serial
  // await-loop: each row's two audit entries are independent rows, both helpers
  // swallow their own errors, and the response doesn't depend on completion
  // order — so this is behavior-identical to the prior loop, just without the
  // per-row round-trip wait stacking up (2N sequential awaits → N parallel).
  const ctx = requestContext(req);
  await Promise.all(
    createdItems.map(async (item) => {
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
    }),
  );

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
