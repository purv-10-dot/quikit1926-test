import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("priority");
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { createPrioritySchema } from "@/lib/schemas/prioritySchema";
import { writeAuditLog } from "@/lib/api/auditLog";
import { rateLimit, LIMITS } from "@/lib/api/rateLimit";
import { getCurrentFiscalWeekFromDB } from "@/lib/utils/featureFlags";

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
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  owner_user: { select: { id: true, firstName: true, lastName: true } },
  team: { select: { id: true, name: true } },
  weeklyStatuses: {
    select: { id: true, priorityId: true, weekNumber: true, status: true, notes: true },
    orderBy: { weekNumber: "asc" as const },
  },
};

// GET /api/priority — list priorities filtered by year + quarter
export const GET = withTenantAuth(async ({ tenantId }, req) => {
  const searchParams = req.nextUrl.searchParams;
  const year = searchParams.get("year") ? parseInt(searchParams.get("year")!) : undefined;
  const quarter = searchParams.get("quarter") || undefined;
  const sortBy = searchParams.get("sortBy") || "createdAt";
  const sortOrder = (searchParams.get("sortOrder") || "asc") as "asc" | "desc";
  const { page, limit, skip, take } = parsePagination(req);

  const includeDeleted = searchParams.get("includeDeleted") === "true";
  const where: Record<string, unknown> = { tenantId };
  where.deletedAt = includeDeleted ? { not: null } : null;
  if (year) where.year = year;
  if (quarter) where.quarter = quarter;

  // Allowed sort fields
  const sortMap: Record<string, Record<string, "asc" | "desc">> = {
    team: { team: { name: sortOrder } as any },
    priorityName: { name: sortOrder },
    owner: { owner_user: { firstName: sortOrder } as any },
    createdAt: { createdAt: sortOrder },
  };
  const orderBy = sortMap[sortBy] || { createdAt: sortOrder };

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

  return NextResponse.json(paginatedResponse(priorities, total, page, limit));
});

// POST /api/priority — create a priority
export const POST = withTenantAuth(async ({ tenantId, userId }, req) => {
  const rl = rateLimit({
    routeKey: "priority:create",
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
  const parsed = createPrioritySchema.safeParse(body);
  if (!parsed.success) {
    const error = parsed.error.errors[0]?.message ?? "Invalid input";
    return NextResponse.json({ success: false, error }, { status: 400 });
  }
  const { name, description, owner, teamId, quarter, year, startWeek, endWeek, overallStatus } = parsed.data;

  const created = await db.priority.create({
    data: {
      tenantId,
      name,
      description: description ?? null,
      owner,
      teamId: teamId ?? null,
      quarter,
      year,
      startWeek: startWeek ?? null,
      endWeek: endWeek ?? null,
      overallStatus: overallStatus ?? "not-yet-started",
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
    const currentWeek = await getCurrentFiscalWeekFromDB(tenantId, year, quarter);
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
    tenantId,
    actorId: userId,
    action: "CREATE",
    entityType: "Priority",
    entityId: priority.id,
    newValues: priority,
  });

  return NextResponse.json({ success: true, data: priority }, { status: 201 });
});
