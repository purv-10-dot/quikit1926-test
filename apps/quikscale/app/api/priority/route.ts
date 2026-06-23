import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
const auth = withOrgAuthForResource("priority", "Priority");
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { createPrioritySchema } from "@/lib/schemas/prioritySchema";
import { writeAuditLog } from "@/lib/api/auditLog";
import { audit, requestContext } from "@/lib/audit";
import { rateLimit, LIMITS } from "@/lib/api/rateLimit";
import { getCurrentFiscalWeekFromDB } from "@/lib/utils/featureFlags";
import { notifyPriorityAssignment } from "@/lib/services/priorityNotifications";
import { isOrgAdmin } from "@/lib/api/visibility";
import { fetchAuditUserMap, decorateAudit } from "@/lib/api/auditUsers";
import { searchUserIds, dateSearchConditions, numericSearchValue } from "@/lib/api/listSearch";

const PRIORITY_SELECT = {
  id: true,
  name: true,
  description: true,
  owner: true,
  teamId: true,
  quarter: true,
  year: true,
  startWeek: true,
  endWeek: true,
  overallStatus: true,
  notes: true,
  importedFromOpsp: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
  owner_user: { select: { id: true, firstName: true, lastName: true } },
  team: { select: { id: true, name: true } },
  weeklyStatuses: {
    // `updatedAt` powers the Last Note column's "most recently edited" picker.
    // Without it the UI falls back to highest-weekNumber, which hides fresh
    // edits on earlier weeks. See lib/utils/priorityHelpers.getLatestPriorityNote.
    select: { id: true, priorityId: true, weekNumber: true, status: true, notes: true, updatedAt: true },
    orderBy: { weekNumber: "asc" as const },
  },
};

// GET /api/priority — list priorities filtered by year + quarter
export const GET = auth.view(async ({ orgId, userId }, req) => {
  const searchParams = req.nextUrl.searchParams;
  const year = searchParams.get("year") ? parseInt(searchParams.get("year")!) : undefined;
  const quarter = searchParams.get("quarter") || undefined;
  const sortByParam = searchParams.get("sortBy");
  const sortBy = sortByParam || "createdAt";
  // Default the list to newest-first (createdAt desc) so a just-created
  // priority appears at the TOP. An explicitly chosen column with no direction
  // still defaults to asc (unchanged); an explicit sortOrder always wins.
  const sortOrder = (searchParams.get("sortOrder") || (sortByParam ? "asc" : "desc")) as "asc" | "desc";
  const { page, limit, skip, take } = parsePagination(req);

  // DB-level filters (previously applied client-side on the page).
  const search = (searchParams.get("search") || "").trim();
  const ownerFilter = searchParams.get("owner") || undefined;
  const teamFilter = searchParams.get("teamId") || undefined;
  const statusFilter = searchParams.get("status") || undefined;

  const includeDeleted = searchParams.get("includeDeleted") === "true";
  const where: Record<string, unknown> = { orgId };
  where.deletedAt = includeDeleted ? { not: null } : null;
  if (year) where.year = year;
  if (quarter) where.quarter = quarter;
  if (statusFilter) where.overallStatus = statusFilter;

  // Row-level visibility: admins see all priorities, non-admins see only
  // priorities they own. An explicit owner/team filter can only NARROW within
  // that scope — a non-admin is always pinned to their own rows.
  const admin = await isOrgAdmin(userId, orgId);
  if (!admin) {
    where.owner = userId;
  } else if (ownerFilter) {
    where.owner = ownerFilter; // owner filter takes precedence over team
  } else if (teamFilter) {
    const members = await db.orgMember.findMany({
      where: { orgId, teamId: teamFilter, status: "active" },
      select: { userId: true },
    });
    const memberIds = members.map((m) => m.userId);
    where.owner = memberIds.length > 0 ? { in: memberIds } : "__no_team_members__";
  }

  // Global search across every visible Priority column: name/description/notes,
  // owner + team + created-by/updated-by, start/end week numbers, weekly status
  // labels + notes, and created/updated dates (year / full-date / month-name).
  if (search) {
    const matchedIds = await searchUserIds(db, search);
    const num = numericSearchValue(search);
    const searchOr: Record<string, unknown>[] = [
      { name: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { notes: { contains: search, mode: "insensitive" } },
      { overallStatus: { contains: search, mode: "insensitive" } },
      { team: { is: { name: { contains: search, mode: "insensitive" } } } },
      { weeklyStatuses: { some: { status: { contains: search, mode: "insensitive" } } } },
      { weeklyStatuses: { some: { notes: { contains: search, mode: "insensitive" } } } },
    ];
    if (matchedIds.length) {
      searchOr.push({ owner: { in: matchedIds } });
      searchOr.push({ createdBy: { in: matchedIds } });
      searchOr.push({ updatedBy: { in: matchedIds } });
    }
    if (num != null) {
      searchOr.push({ startWeek: num });
      searchOr.push({ endWeek: num });
    }
    for (const cond of dateSearchConditions(["createdAt", "updatedAt"], search)) {
      searchOr.push(cond);
    }
    // AND-compose so search narrows within (never replaces) the row-level
    // visibility scope (`where.owner` for non-admins, owner/team filters).
    if (where.owner !== undefined || where.OR) {
      const existing = where.OR ? [{ OR: where.OR }] : [];
      delete where.OR;
      where.AND = [...existing, { OR: searchOr }];
    } else {
      where.OR = searchOr;
    }
  }

  // Allowed sort fields + stable `id` tie-breaker so pages never overlap.
  const sortMap: Record<string, Record<string, unknown>> = {
    team: { team: { name: sortOrder } },
    priorityName: { name: sortOrder },
    owner: { owner_user: { firstName: sortOrder } },
    startWeek: { startWeek: sortOrder },
    endWeek: { endWeek: sortOrder },
    overallStatus: { overallStatus: sortOrder },
    createdAt: { createdAt: sortOrder },
    updatedAt: { updatedAt: sortOrder },
  };
  const orderBy = [sortMap[sortBy] || { createdAt: sortOrder }, { id: "desc" }];

  const [priorities, total] = await Promise.all([
    db.priority.findMany({
      where,
      select: PRIORITY_SELECT,
      orderBy: orderBy as any,
      skip,
      take,
    }),
    db.priority.count({ where }),
  ]);

  // Resolve createdBy/updatedBy → name + initials so the table can paint
  // the audit columns without a second round-trip.
  const auditMap = await fetchAuditUserMap(priorities);
  const decorated = priorities.map((p) => decorateAudit(p, auditMap));

  return NextResponse.json(paginatedResponse(decorated, total, page, limit));
});

// POST /api/priority — create a priority
export const POST = auth.create(async ({ orgId, userId }, req) => {
  const rl = rateLimit({
    routeKey: "priority:create",
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
  const parsed = createPrioritySchema.safeParse(body);
  if (!parsed.success) {
    const error = parsed.error.errors[0]?.message ?? "Invalid input";
    return NextResponse.json({ success: false, error }, { status: 400 });
  }
  const { name, description, owner, teamId, quarter, year, startWeek, endWeek, overallStatus, importedFromOpsp } = parsed.data;

  const created = await db.priority.create({
    data: {
      orgId,
      name,
      description: description ?? null,
      owner,
      teamId: teamId ?? null,
      quarter,
      year,
      startWeek: startWeek ?? null,
      endWeek: endWeek ?? null,
      overallStatus: overallStatus ?? "not-yet-started",
      importedFromOpsp: importedFromOpsp ?? false,
      createdBy: userId,
    },
    select: PRIORITY_SELECT,
  });

  // Seed weekly statuses across [startWeek..endWeek]:
  //   week <  currentWeek  → "not-yet-started"  (past)
  //   week >= currentWeek  → "not-applicable"   (current + future)
  // Only seed when both bounds are set; otherwise leave the priority bare so
  // existing list/detail flows behave unchanged.
  let priority = created;
  if (startWeek != null && endWeek != null && startWeek <= endWeek) {
    const currentWeek = await getCurrentFiscalWeekFromDB(orgId, year, quarter);
    const seeds = [];
    for (let w = startWeek; w <= endWeek; w++) {
      seeds.push({
        priorityId: created.id,
        weekNumber: w,
        status: w < currentWeek ? "not-yet-started" : "not-applicable",
        updatedBy: userId,
      });
    }
    if (seeds.length) {
      await db.priorityWeeklyStatus.createMany({ data: seeds, skipDuplicates: true });
      const refreshed = await db.priority.findUnique({
        where: { id: created.id },
        select: PRIORITY_SELECT,
      });
      if (refreshed) priority = refreshed;
    }
  }

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "CREATE",
    entityType: "Priority",
    entityId: priority.id,
    newValues: priority,
  });

  // ── Centralized audit (dual-write) ── one CREATE event with the full
  // post-state snapshot (incl. seeded weekly statuses) so the Change History
  // Create card can render the complete spec + week-status breakdown.
  await audit.log({
    entityType: "PRIORITY",
    entityId: priority.id,
    action: "CREATE",
    actor: { userId, orgId, teamId: priority.teamId },
    snapshot: priority,
    ...requestContext(req),
  });

  if (priority.owner) {
    notifyPriorityAssignment({
      orgId,
      priorityId: priority.id,
      priorityName: priority.name,
      quarter: priority.quarter,
      year: priority.year,
      creatorUserId: userId,
      ownerUserId: priority.owner,
    }).catch((err) => {
      console.error("[POST /api/priority] notifyPriorityAssignment failed:", err);
    });
  }

  return NextResponse.json({ success: true, data: priority }, { status: 201 });
});
