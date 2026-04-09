import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { updateKPISchema } from "@/lib/schemas/kpiSchema";
import { ApiResponse } from "@/lib/services/kpiService";
import { getTenantId } from "@/lib/api/getTenantId";


export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId) return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const kpi = await db.kPI.findUnique({
      where: { id: params.id, deletedAt: null },
      select: {
        id: true, tenantId: true, name: true, description: true, owner: true,
        teamId: true, parentKPIId: true, quarter: true, year: true,
        measurementUnit: true, target: true, quarterlyGoal: true, qtdGoal: true,
        qtdAchieved: true, currentWeekValue: true, progressPercent: true,
        status: true, healthStatus: true, lastNotes: true, lastNotesAt: true,
        divisionType: true, weeklyTargets: true, currency: true, targetScale: true,
        createdAt: true, updatedAt: true, createdBy: true, updatedBy: true,
        owner_user: { select: { id: true, firstName: true, lastName: true } },
        weeklyValues: { select: { weekNumber: true, value: true, notes: true }, orderBy: { weekNumber: "asc" } },
      },
    });

    if (!kpi) return NextResponse.json({ success: false, error: "KPI not found" }, { status: 404 });
    if (kpi.tenantId !== tenantId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

    return NextResponse.json({ success: true, data: kpi });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed to fetch KPI" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId) return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const existingKPI = await db.kPI.findUnique({ where: { id: params.id, deletedAt: null } });
    if (!existingKPI) return NextResponse.json({ success: false, error: "KPI not found" }, { status: 404 });
    if (existingKPI.tenantId !== tenantId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

    const body = await request.json();
    const validated = updateKPISchema.parse(body);
    const oldValue = JSON.stringify(existingKPI);

    const updatedKPI = await db.kPI.update({
      where: { id: params.id },
      data: {
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
        status: validated.status,
        divisionType: validated.divisionType,
        weeklyTargets: validated.weeklyTargets ?? undefined,
        currency: validated.currency ?? null,
        targetScale: validated.targetScale ?? null,
        updatedBy: session.user.id,
      },
      select: {
        id: true, name: true, description: true, owner: true, teamId: true,
        parentKPIId: true, quarter: true, year: true, measurementUnit: true,
        target: true, quarterlyGoal: true, qtdGoal: true, qtdAchieved: true,
        progressPercent: true, status: true, healthStatus: true,
        divisionType: true, weeklyTargets: true, currency: true, targetScale: true,
        createdAt: true, updatedAt: true, createdBy: true,
        owner_user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await db.kPILog.create({
      data: { tenantId, kpiId: params.id, action: "UPDATE", oldValue, newValue: JSON.stringify(updatedKPI), changedBy: session.user.id },
    });

    return NextResponse.json({ success: true, data: updatedKPI, message: "KPI updated successfully" });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed to update KPI" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId) return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const kpi = await db.kPI.findUnique({ where: { id: params.id, deletedAt: null } });
    if (!kpi) return NextResponse.json({ success: false, error: "KPI not found" }, { status: 404 });
    if (kpi.tenantId !== tenantId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

    const oldValue = JSON.stringify(kpi);
    await db.kPI.update({ where: { id: params.id }, data: { deletedAt: new Date() } });

    await db.kPILog.create({ data: { tenantId, kpiId: params.id, action: "DELETE", oldValue, changedBy: session.user.id } });

    return NextResponse.json({ success: true, message: "KPI deleted successfully" });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed to delete KPI" }, { status: 500 });
  }
}
