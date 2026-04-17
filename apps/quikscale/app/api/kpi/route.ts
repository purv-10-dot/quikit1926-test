import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("kpi");
import { createKPISchema, kpiListParamsSchema } from "@/lib/schemas/kpiSchema";
import { ApiResponse } from "@/lib/services/kpiService";
import {
  validateTeamKPICreate,
  validateIndividualKPICreate,
  validateParentKPI,
} from "@/lib/api/kpiCreateValidation";
import { getPastWeekFlags, getCurrentFiscalWeekFromDB } from "@/lib/utils/featureFlags";
import { rateLimit, LIMITS } from "@/lib/api/rateLimit";


// GET /api/kpi - List KPIs with filters and pagination
export const GET = withTenantAuth(async ({ tenantId }, req) => {
  const searchParams = req.nextUrl.searchParams;
  const params = {
    page: parseInt(searchParams.get("page") || "1"),
    pageSize: parseInt(searchParams.get("pageSize") || "20"),
    status: searchParams.get("status") || undefined,
    kpiLevel: searchParams.get("kpiLevel") || undefined,
    owner: searchParams.get("owner") || undefined,
    teamId: searchParams.get("teamId") || undefined,
    quarter: searchParams.get("quarter") || undefined,
    year: searchParams.get("year") ? parseInt(searchParams.get("year")!) : undefined,
    search: searchParams.get("search") || undefined,
    sortBy: searchParams.get("sortBy") || "createdAt",
    sortOrder: (searchParams.get("sortOrder") || "desc") as "asc" | "desc",
  };

  const validated = kpiListParamsSchema.parse(params);

  const where: any = { tenantId };
  if (validated.status) where.status = validated.status;
  if (validated.kpiLevel) where.kpiLevel = validated.kpiLevel;
  if (validated.owner) where.owner = validated.owner;
  if (validated.teamId) where.teamId = validated.teamId;
  if (validated.quarter) where.quarter = validated.quarter;
  if (validated.year) where.year = validated.year;
  if (validated.search) {
    where.OR = [
      { name: { contains: validated.search, mode: "insensitive" } },
      { description: { contains: validated.search, mode: "insensitive" } },
    ];
  }

  const orderBy: any = {};
  orderBy[validated.sortBy] = validated.sortOrder;

  const total = await db.kPI.count({ where });

  const kpis = await db.kPI.findMany({
    where,
    select: {
      id: true,
      name: true,
      description: true,
      kpiLevel: true,
      owner: true,
      ownerIds: true,
      ownerContributions: true,
      teamId: true,
      parentKPIId: true,
      quarter: true,
      year: true,
      measurementUnit: true,
      target: true,
      quarterlyGoal: true,
      qtdGoal: true,
      qtdAchieved: true,
      currentWeekValue: true,
      progressPercent: true,
      status: true,
      healthStatus: true,
      lastNotes: true,
      lastNotesAt: true,
      divisionType: true,
      weeklyTargets: true,
      weeklyOwnerTargets: true,
      currency: true,
      targetScale: true,
      reverseColor: true,
      createdAt: true,
      updatedAt: true,
      createdBy: true,
      owner_user: { select: { id: true, firstName: true, lastName: true } },
      team: { select: { id: true, name: true, color: true, headId: true } },
      weeklyValues: { select: { userId: true, weekNumber: true, value: true, notes: true }, orderBy: [{ weekNumber: "asc" }, { userId: "asc" }] },
    },
    orderBy,
    skip: (validated.page - 1) * validated.pageSize,
    take: validated.pageSize,
  });

  // Enrich: batch-fetch users for all team heads + flattened ownerIds so we
  // can attach team.head and owners[] arrays on each KPI without N+1 queries.
  const userIdsToFetch = new Set<string>();
  for (const k of kpis) {
    if (k.team?.headId) userIdsToFetch.add(k.team.headId);
    const ids = (k.ownerIds as string[] | null) ?? [];
    for (const id of ids) userIdsToFetch.add(id);
  }
  const usersMap = userIdsToFetch.size > 0
    ? new Map(
        (await db.user.findMany({
          where: { id: { in: [...userIdsToFetch] } },
          select: { id: true, firstName: true, lastName: true },
        })).map((u) => [u.id, u])
      )
    : new Map();

  const enriched = kpis.map((k) => {
    const ownerIds = (k.ownerIds as string[] | null) ?? [];
    const rawWeekly = (k.weeklyValues ?? []) as Array<{
      userId: string | null;
      weekNumber: number;
      value: number | null;
      notes: string | null;
    }>;

    // For team KPIs, aggregate per-owner rows into a single weekly total row per week
    // (the existing KPITable cell display reads a flat [{weekNumber, value, notes}] array).
    // Also expose the raw per-owner breakdown as `weeklyOwnerValues` for the tooltip.
    let weeklyValues = rawWeekly.map(({ weekNumber, value, notes }) => ({ weekNumber, value, notes }));
    let weeklyOwnerValues: Record<string, Array<{ weekNumber: number; value: number | null; notes: string | null }>> | undefined;

    if (k.kpiLevel === "team") {
      // Group by weekNumber and sum
      const byWeek: Record<number, { value: number; notes: string | null }> = {};
      const byOwner: Record<string, Array<{ weekNumber: number; value: number | null; notes: string | null }>> = {};
      for (const row of rawWeekly) {
        const v = row.value ?? 0;
        if (!byWeek[row.weekNumber]) byWeek[row.weekNumber] = { value: 0, notes: null };
        byWeek[row.weekNumber].value += v;
        // Concatenate notes across owners for the aggregate row
        if (row.notes) {
          byWeek[row.weekNumber].notes = byWeek[row.weekNumber].notes
            ? `${byWeek[row.weekNumber].notes}\n${row.notes}`
            : row.notes;
        }
        if (row.userId) {
          if (!byOwner[row.userId]) byOwner[row.userId] = [];
          byOwner[row.userId].push({ weekNumber: row.weekNumber, value: row.value, notes: row.notes });
        }
      }
      weeklyValues = Object.entries(byWeek).map(([weekStr, agg]) => ({
        weekNumber: parseInt(weekStr, 10),
        value: agg.value,
        notes: agg.notes,
      })).sort((a, b) => a.weekNumber - b.weekNumber);
      weeklyOwnerValues = byOwner;
    }

    return {
      ...k,
      weeklyValues,
      weeklyOwnerValues,
      team: k.team
        ? { ...k.team, head: k.team.headId ? (usersMap.get(k.team.headId) ?? null) : null }
        : null,
      owners: ownerIds.map((id) => usersMap.get(id)).filter(Boolean),
    };
  });

  const response: ApiResponse<any> = {
    success: true,
    data: { kpis: enriched, total, page: validated.page, pageSize: validated.pageSize },
  };

  return NextResponse.json(response);
});

// POST /api/kpi - Create KPI
export const POST = withTenantAuth(async ({ tenantId, userId }, req) => {
  // Rate limit: 30 KPI writes / minute per user (prevents bulk-insert abuse)
  const rl = rateLimit({
    routeKey: "kpi:create",
    clientKey: `${tenantId}:${userId}`,
    limit: LIMITS.kpiWrite.limit,
    windowMs: LIMITS.kpiWrite.windowMs,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const body = await req.json();
  const validated = createKPISchema.parse(body);

  // ── Past-week add enforcement ──
  // When add_past_week_data is disabled, reject non-zero targets for weeks before current week
  const { canAddPastWeek } = await getPastWeekFlags(tenantId);
  if (!canAddPastWeek && validated.weeklyTargets && validated.quarter && validated.year) {
    const currentWeek = await getCurrentFiscalWeekFromDB(tenantId, validated.year, validated.quarter);
    for (const [weekStr, val] of Object.entries(validated.weeklyTargets)) {
      const week = parseInt(weekStr, 10);
      if (week < currentWeek && val && val !== 0) {
        return NextResponse.json(
          {
            success: false,
            error: `Adding past week data is disabled. Week ${week} is before the current week (${currentWeek}). Enable it in Settings > Configurations.`,
          },
          { status: 403 }
        );
      }
    }
  }

  const isTeamLevel = validated.kpiLevel === "team";

  // Cross-row validation — extracted to @/lib/api/kpiCreateValidation
  if (isTeamLevel) {
    const err = await validateTeamKPICreate({
      tenantId,
      actorUserId: userId,
      teamId: validated.teamId,
      ownerIds: validated.ownerIds,
      ownerContributions: validated.ownerContributions as Record<string, number> | null | undefined,
    });
    if (err) return err;
  } else {
    const err = await validateIndividualKPICreate({
      tenantId,
      owner: validated.owner,
      teamId: validated.teamId,
    });
    if (err) return err;
  }

  const parentErr = await validateParentKPI(validated.parentKPIId, tenantId);
  if (parentErr) return parentErr;

  const kpi = await db.kPI.create({
    data: {
      tenantId,
      name: validated.name,
      description: validated.description,
      kpiLevel: isTeamLevel ? "team" : "individual",
      owner: isTeamLevel ? null : validated.owner!,
      ownerIds: isTeamLevel ? (validated.ownerIds ?? []) : [],
      ownerContributions: isTeamLevel
        ? ((validated.ownerContributions ?? undefined) as any)
        : undefined,
      teamId: validated.teamId,
      parentKPIId: validated.parentKPIId,
      quarter: validated.quarter,
      year: validated.year,
      measurementUnit: validated.measurementUnit,
      target: validated.target,
      quarterlyGoal: validated.quarterlyGoal,
      qtdGoal: validated.qtdGoal,
      progressPercent: 0,
      status: validated.status || "active",
      healthStatus: "on-track",
      divisionType: validated.divisionType ?? "Cumulative",
      weeklyTargets: (validated.weeklyTargets ?? undefined) as any,
      weeklyOwnerTargets: isTeamLevel
        ? ((validated.weeklyOwnerTargets ?? undefined) as any)
        : undefined,
      currency: validated.currency ?? null,
      targetScale: validated.targetScale ?? null,
      reverseColor: validated.reverseColor ?? false,
      createdBy: userId,
    },
    select: {
      id: true,
      name: true,
      description: true,
      kpiLevel: true,
      owner: true,
      teamId: true,
      quarter: true,
      year: true,
      measurementUnit: true,
      target: true,
      quarterlyGoal: true,
      qtdGoal: true,
      qtdAchieved: true,
      progressPercent: true,
      status: true,
      healthStatus: true,
      reverseColor: true,
      createdAt: true,
      updatedAt: true,
      createdBy: true,
      owner_user: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  await db.kPILog.create({
    data: { tenantId, kpiId: kpi.id, action: "CREATE", newValue: JSON.stringify(kpi), changedBy: userId },
  });

  return NextResponse.json({ success: true, data: kpi, message: "KPI created successfully" }, { status: 201 });
});
