import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { createKPISchema, kpiListParamsSchema } from "@/lib/schemas/kpiSchema";
import { ApiResponse } from "@/lib/services/kpiService";
import { getTenantId } from "@/lib/api/getTenantId";


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
        owner: true,
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
        currency: true,
        targetScale: true,
        createdAt: true,
        updatedAt: true,
        createdBy: true,
        owner_user: { select: { id: true, firstName: true, lastName: true } },
        weeklyValues: { select: { weekNumber: true, value: true, notes: true }, orderBy: { weekNumber: "asc" } },
      },
      orderBy,
      skip: (validated.page - 1) * validated.pageSize,
      take: validated.pageSize,
    });

    const response: ApiResponse<any> = {
      success: true,
      data: { kpis, total, page: validated.page, pageSize: validated.pageSize },
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
        owner: validated.owner,
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
        createdBy: session.user.id,
      },
      select: {
        id: true,
        name: true,
        description: true,
        owner: true,
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
