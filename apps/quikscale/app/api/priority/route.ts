import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getTenantId } from "@/lib/api/getTenantId";
import { createPrioritySchema } from "@/lib/schemas/prioritySchema";

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
    const year = searchParams.get("year") ? parseInt(searchParams.get("year")!) : undefined;
    const quarter = searchParams.get("quarter") || undefined;

    const where: Record<string, unknown> = { tenantId };
    if (year) where.year = year;
    if (quarter) where.quarter = quarter;

    const priorities = await db.priority.findMany({
      where,
      select: PRIORITY_SELECT,
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, data: priorities });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch priorities";
    console.error("GET /api/priority error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// POST /api/priority — create a priority
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
    const parsed = createPrioritySchema.safeParse(body);
    if (!parsed.success) {
      const error = parsed.error.errors[0]?.message ?? "Invalid input";
      return NextResponse.json({ success: false, error }, { status: 400 });
    }
    const { name, description, owner, teamId, quarter, year, startWeek, endWeek, overallStatus } = parsed.data;

    const priority = await db.priority.create({
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
        createdBy: session.user.id,
      },
      select: PRIORITY_SELECT,
    });

    return NextResponse.json({ success: true, data: priority }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to create priority";
    console.error("POST /api/priority error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
