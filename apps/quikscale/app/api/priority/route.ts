import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
const auth = withOrgAuthForResource("priority", "Priority");
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { createPrioritySchema } from "@/lib/schemas/prioritySchema";
import { writeAuditLog } from "@/lib/api/auditLog";
import { audit, requestContext } from "@/lib/audit";
import { rateLimitAsync, LIMITS } from "@/lib/api/rateLimit";
import { getCurrentFiscalWeekFromDB } from "@/lib/utils/featureFlags";
import { notifyPriorityAssignment } from "@/lib/services/priorityNotifications";
import { emitPriorityCreated } from "@/lib/services/workflowEvents";
import { findPriorityDuplicate, priorityDuplicateMessage } from "@/lib/api/priorityDuplicate";
import { buildPriorityScopeWhere } from "@/lib/api/priorityListQuery";
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
  // Scope + trash + filters + row-level visibility live in the shared helper so
  // the Priority export route enforces identical rules. Search + orderBy below.
  const where = (await buildPriorityScopeWhere(
    { orgId, userId },
    { year, quarter, status: statusFilter, owner: ownerFilter, teamId: teamFilter, includeDeleted },
  )) as Record<string, unknown>;

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
  // Manual (drag-to-reorder) mode when no column sort is chosen: order by the
  // shared `position` rank (nulls first so new rows stay on top until dragged).
  const orderBy = sortByParam
    ? [sortMap[sortBy] || { createdAt: sortOrder }, { id: "desc" }]
    : [{ position: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }, { id: "desc" }];

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
  const rl = await rateLimitAsync({
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
  const { name, description, owner, ownerIds, teamId, quarter, year, startWeek, endWeek, overallStatus, importedFromOpsp } = parsed.data;

  // Resolve the owner list. Zod's refine guarantees at least one of
  // `owner`/`ownerIds` is present. Dedupe so an accidental repeat selection in
  // the multi-owner picker doesn't create duplicate rows for the same person.
  const resolvedOwners = Array.from(
    new Set((ownerIds && ownerIds.length > 0) ? ownerIds : (owner ? [owner] : [])),
  );

  // Deterministic duplicate guard for the manual "Add New Priority" form: an
  // exact match on name + owner + team + period (quarter/year) + start week is a
  // duplicate. With multi-owner fan-out we check EACH owner independently and
  // SKIP the ones that already have an identical priority, creating the rest —
  // one existing dup for a single owner shouldn't block the whole batch. If
  // every selected owner is a duplicate we return 409 (nothing to create).
  // The OPSP "Export → Priority" flow (importedFromOpsp) has its own
  // AI-advisory + Replace handling, so it's intentionally exempt.
  let ownersToCreate = resolvedOwners;
  let skippedOwners: string[] = [];
  if (!importedFromOpsp) {
    const checks = await Promise.all(
      resolvedOwners.map(async (o) => ({
        owner: o,
        dup: await findPriorityDuplicate(db, orgId, {
          name,
          owner: o,
          teamId: teamId ?? null,
          quarter,
          year,
          startWeek: startWeek ?? null,
        }),
      })),
    );
    ownersToCreate = checks.filter((c) => !c.dup).map((c) => c.owner);
    skippedOwners = checks.filter((c) => c.dup).map((c) => c.owner);
    if (ownersToCreate.length === 0) {
      return NextResponse.json(
        { success: false, error: priorityDuplicateMessage() },
        { status: 409 },
      );
    }
  }

  // Fan out: one Priority row per owner, atomically. Each row is identical
  // except for `owner`, mirroring the WWW "one row = one assignee" shape so
  // each owner independently tracks their own weekly status + notes.
  const createdRows = await db.$transaction(
    ownersToCreate.map((o) =>
      db.priority.create({
        data: {
          orgId,
          name,
          description: description ?? null,
          owner: o,
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
      }),
    ),
  );

  // Seed weekly statuses across [startWeek..endWeek] for every created row:
  //   week <  currentWeek  → "not-yet-started"  (past)
  //   week >= currentWeek  → "not-applicable"   (current + future)
  // Only seed when both bounds are set; otherwise leave the priority bare so
  // existing list/detail flows behave unchanged.
  let priorities = createdRows;
  if (startWeek != null && endWeek != null && startWeek <= endWeek) {
    const currentWeek = await getCurrentFiscalWeekFromDB(orgId, year, quarter);
    const seeds = [];
    for (const row of createdRows) {
      for (let w = startWeek; w <= endWeek; w++) {
        seeds.push({
          priorityId: row.id,
          weekNumber: w,
          status: w < currentWeek ? "not-yet-started" : "not-applicable",
          updatedBy: userId,
        });
      }
    }
    if (seeds.length) {
      await db.priorityWeeklyStatus.createMany({ data: seeds, skipDuplicates: true });
      priorities = await Promise.all(
        createdRows.map(async (row) => {
          const refreshed = await db.priority.findUnique({
            where: { id: row.id },
            select: PRIORITY_SELECT,
          });
          return refreshed ?? row;
        }),
      );
    }
  }

  // One audit event per created row (legacy + centralized dual-write). Both
  // helpers swallow their own errors and the response doesn't depend on their
  // completion order, so they run in parallel.
  const ctx = requestContext(req);
  await Promise.all(
    priorities.map(async (priority) => {
      await writeAuditLog({
        orgId,
        actorId: userId,
        action: "CREATE",
        entityType: "Priority",
        entityId: priority.id,
        newValues: priority,
      });
      // ── Centralized audit (dual-write) ── one CREATE event with the full
      // post-state snapshot (incl. seeded weekly statuses) so the Change
      // History Create card renders the complete spec + week-status breakdown.
      await audit.log({
        entityType: "PRIORITY",
        entityId: priority.id,
        action: "CREATE",
        actor: { userId, orgId, teamId: priority.teamId },
        snapshot: priority,
        ...ctx,
      });
    }),
  );

  // One assignment notification per owner, scoped to their own row.
  for (const priority of priorities) {
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
    // QuikFlow: emit priority.created (fire-and-forget, flag-gated).
    emitPriorityCreated({
      orgId,
      priorityId: priority.id,
      name: priority.name,
      owner: priority.owner,
      teamId: priority.teamId,
      quarter: priority.quarter,
      year: priority.year,
      status: priority.overallStatus,
    });
  }

  // Return the first row in the existing single-item envelope so the useCreate
  // hook keeps working; `meta` carries the fan-out counts so the client can
  // report how many were created and how many were skipped as duplicates.
  const primary = priorities[0]!;
  return NextResponse.json(
    {
      success: true,
      data: primary,
      meta: {
        created: priorities.length,
        requested: resolvedOwners.length,
        skipped: skippedOwners.length,
      },
      message: priorities.length > 1
        ? `Created ${priorities.length} priorities`
        : "Priority created",
    },
    { status: 201 },
  );
});
