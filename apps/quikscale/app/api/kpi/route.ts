import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { createKPISchema, kpiListParamsSchema } from "@/lib/schemas/kpiSchema";
import { ApiResponse } from "@/lib/services/kpiService";
import { getTenantId } from "@/lib/api/getTenantId";
import { canManageTeamKPI } from "@/lib/api/teamKPIPermissions";
import { getPastWeekFlags, getCurrentFiscalWeekFromDB } from "@/lib/utils/featureFlags";


// GET /api/kpi - List KPIs with filters and pagination
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId) {
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
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

    const where: any = { tenantId, deletedAt: null };
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
  } catch (error: any) {
    console.error("GET /api/kpi error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to fetch KPIs" }, { status: 500 });
  }
}

// POST /api/kpi - Create KPI
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId) {
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });
    }

    const body = await request.json();
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

    // Team KPI: verify team exists in tenant + permission check + owners must be team members
    if (isTeamLevel) {
      if (!validated.teamId) {
        return NextResponse.json({ success: false, error: "teamId is required for team KPIs" }, { status: 400 });
      }
      const team = await db.team.findUnique({ where: { id: validated.teamId } });
      if (!team || team.tenantId !== tenantId) {
        return NextResponse.json({ success: false, error: "Team not found" }, { status: 404 });
      }
      const allowed = await canManageTeamKPI(session.user.id, tenantId, validated.teamId);
      if (!allowed) {
        return NextResponse.json(
          { success: false, error: "You must be a team head or admin to create KPIs for this team." },
          { status: 403 }
        );
      }

      // Validate owners are members of this team via Membership.teamId
      const ownerIds = validated.ownerIds ?? [];
      if (ownerIds.length === 0) {
        return NextResponse.json({ success: false, error: "At least one KPI owner is required for team KPIs" }, { status: 400 });
      }
      const memberships = await db.membership.findMany({
        where: {
          tenantId,
          teamId: validated.teamId,
          userId: { in: ownerIds },
          status: "active",
        },
        select: { userId: true },
      });
      const validIds = new Set(memberships.map((m) => m.userId));
      const invalid = ownerIds.filter((id) => !validIds.has(id));
      if (invalid.length > 0) {
        return NextResponse.json(
          { success: false, error: `Some selected owners are not active members of this team: ${invalid.length} user(s)` },
          { status: 400 }
        );
      }

      // Validate ownerContributions sum to 100 and match ownerIds
      const contributions = (validated.ownerContributions ?? {}) as Record<string, number>;
      const contribKeys = Object.keys(contributions);
      if (contribKeys.length !== ownerIds.length || ownerIds.some((id) => !(id in contributions))) {
        return NextResponse.json(
          { success: false, error: "Owner contributions must be provided for every owner" },
          { status: 400 }
        );
      }
      const sum = Object.values(contributions).reduce((s, v) => s + v, 0);
      if (Math.abs(sum - 100) > 0.5) {
        return NextResponse.json(
          { success: false, error: `Owner contributions must sum to 100% (got ${sum.toFixed(1)}%)` },
          { status: 400 }
        );
      }
    } else {
      // Individual KPI: owner is required and must exist
      if (!validated.owner) {
        return NextResponse.json({ success: false, error: "Owner is required for individual KPIs" }, { status: 400 });
      }
      const owner = await db.user.findUnique({ where: { id: validated.owner } });
      if (!owner) {
        return NextResponse.json({ success: false, error: "Owner user not found" }, { status: 404 });
      }

      if (validated.teamId) {
        const team = await db.team.findUnique({ where: { id: validated.teamId } });
        if (!team || team.tenantId !== tenantId) {
          return NextResponse.json({ success: false, error: "Team not found" }, { status: 404 });
        }
      }
    }

    if (validated.parentKPIId) {
      const parentKPI = await db.kPI.findUnique({ where: { id: validated.parentKPIId } });
      if (!parentKPI || parentKPI.tenantId !== tenantId) {
        return NextResponse.json({ success: false, error: "Parent KPI not found" }, { status: 404 });
      }
    }

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
        createdBy: session.user.id,
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
      data: { tenantId, kpiId: kpi.id, action: "CREATE", newValue: JSON.stringify(kpi), changedBy: session.user.id },
    });

    return NextResponse.json({ success: true, data: kpi, message: "KPI created successfully" }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/kpi error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to create KPI" }, { status: 500 });
  }
}
