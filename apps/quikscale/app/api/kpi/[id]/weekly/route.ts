import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { weeklyValueSchema } from "@/lib/schemas/kpiSchema";
import { getTenantId } from "@/lib/api/getTenantId";


function calcHealthStatus(progress: number, status: string): string {
  if (status === "completed") return "complete";
  if (progress >= 100) return "on-track";
  if (progress >= 80) return "behind-schedule";
  return "critical";
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId) return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const kpi = await db.kPI.findUnique({ where: { id: params.id, deletedAt: null }, select: { tenantId: true } });
    if (!kpi) return NextResponse.json({ success: false, error: "KPI not found" }, { status: 404 });
    if (kpi.tenantId !== tenantId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

    const weeklyValues = await db.kPIWeeklyValue.findMany({
      where: { kpiId: params.id },
      select: { id: true, weekNumber: true, value: true, notes: true, createdAt: true, updatedAt: true },
      orderBy: { weekNumber: "asc" },
    });

    return NextResponse.json({ success: true, data: weeklyValues });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed to fetch weekly values" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId) return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const kpi = await db.kPI.findUnique({
      where: { id: params.id },
      select: { tenantId: true, qtdGoal: true, target: true, status: true },
    });
    if (!kpi) return NextResponse.json({ success: false, error: "KPI not found" }, { status: 404 });
    if (kpi.tenantId !== tenantId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

    const body = await request.json();
    const validated = weeklyValueSchema.parse(body);

    const weeklyValue = await db.kPIWeeklyValue.upsert({
      where: { kpiId_weekNumber: { kpiId: params.id, weekNumber: validated.weekNumber } },
      update: { value: validated.value, notes: validated.notes, updatedBy: session.user.id },
      create: { kpiId: params.id, tenantId, weekNumber: validated.weekNumber, value: validated.value, notes: validated.notes, createdBy: session.user.id },
      select: { id: true, kpiId: true, weekNumber: true, value: true, notes: true, createdAt: true, updatedAt: true },
    });

    // Recalculate progress
    const allWeekly = await db.kPIWeeklyValue.findMany({ where: { kpiId: params.id }, select: { value: true } });
    const totalAchieved = allWeekly.reduce((s, w) => s + (w.value || 0), 0);
    const goal = kpi.qtdGoal ?? kpi.target ?? 0;
    const progressPercent = goal ? (totalAchieved / goal) * 100 : 0;

    await db.kPI.update({
      where: { id: params.id },
      data: { qtdAchieved: totalAchieved, progressPercent, healthStatus: calcHealthStatus(progressPercent, kpi.status), currentWeekValue: validated.value },
    });

    await db.kPILog.create({
      data: { tenantId, kpiId: params.id, action: "UPDATE_WEEKLY", newValue: JSON.stringify(weeklyValue), changedBy: session.user.id },
    });

    return NextResponse.json({ success: true, data: weeklyValue });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed to save weekly value" }, { status: 500 });
  }
}
