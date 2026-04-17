import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { weeklyValueSchema } from "@/lib/schemas/kpiSchema";
import { canEditKPIOwnerWeekly } from "@/lib/api/kpiWeeklyPermissions";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("kpi");
import { getPastWeekFlags, getCurrentFiscalWeekFromDB } from "@/lib/utils/featureFlags";


function calcHealthStatus(progress: number, status: string): string {
  if (status === "completed") return "complete";
  if (progress >= 100) return "on-track";
  if (progress >= 80) return "behind-schedule";
  return "critical";
}

/**
 * GET /api/kpi/[id]/weekly
 *
 * For individual KPIs: returns each weekly row as-is (one per week, already aggregated).
 * For team KPIs: returns per-owner weekly rows (each owner's row per week) — the caller
 * is expected to aggregate by weekNumber if they want the total.
 *
 * The GET /api/kpi (list) endpoint handles aggregation automatically for table display.
 */
export const GET = withTenantAuth<{ id: string }>(async ({ tenantId }, req, { params }) => {
  const kpi = await db.kPI.findUnique({ where: { id: params.id }, select: { tenantId: true } });
  if (!kpi) return NextResponse.json({ success: false, error: "KPI not found" }, { status: 404 });
  if (kpi.tenantId !== tenantId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

  const weeklyValues = await db.kPIWeeklyValue.findMany({
    where: { kpiId: params.id },
    select: { id: true, userId: true, weekNumber: true, value: true, notes: true, createdAt: true, updatedAt: true },
    orderBy: [{ weekNumber: "asc" }, { userId: "asc" }],
  });

  return NextResponse.json({ success: true, data: weeklyValues });
}, { fallbackErrorMessage: "Failed to fetch weekly values" });

/**
 * POST /api/kpi/[id]/weekly
 *
 * Upserts a weekly value for a specific (kpiId, userId, weekNumber) triple.
 *
 * Body: { weekNumber, value, notes, userId? }
 *
 * userId handling:
 *   - Individual KPI: userId is inferred from kpi.owner if omitted
 *   - Team KPI: userId is required (must be one of kpi.ownerIds)
 *
 * Permissions (via canEditKPIOwnerWeekly):
 *   - Admins/executives/super_admins can write any owner's row
 *   - Team heads can write any row on their team's KPIs
 *   - Owners can write their own row (self-edit)
 *
 * On success, re-aggregates qtdAchieved as the SUM of all weekly values for the KPI
 * and recomputes progressPercent + healthStatus.
 */
export const POST = withTenantAuth<{ id: string }>(async ({ tenantId, userId }, req, { params }) => {
  const kpi = await db.kPI.findUnique({
    where: { id: params.id },
    select: {
      tenantId: true, qtdGoal: true, target: true, status: true,
      quarter: true, year: true,
      kpiLevel: true, owner: true, ownerIds: true,
    },
  });
  if (!kpi) return NextResponse.json({ success: false, error: "KPI not found" }, { status: 404 });
  if (kpi.tenantId !== tenantId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

  const body = await req.json();
  const validated = weeklyValueSchema.parse(body);

  // Resolve target userId: for individual KPIs, default to kpi.owner if omitted.
  // For team KPIs, userId is required and must be one of ownerIds.
  const targetUserId = validated.userId ?? (kpi.kpiLevel === "individual" ? kpi.owner : null);
  if (!targetUserId) {
    return NextResponse.json(
      { success: false, error: "userId is required for team KPI weekly values" },
      { status: 400 }
    );
  }
  if (kpi.kpiLevel === "team") {
    const ownerIds = (kpi.ownerIds ?? []) as string[];
    if (!ownerIds.includes(targetUserId)) {
      return NextResponse.json(
        { success: false, error: "targetUserId is not an owner of this team KPI" },
        { status: 400 }
      );
    }
  }

  // Permission check
  const allowed = await canEditKPIOwnerWeekly(userId, tenantId, params.id, targetUserId);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "You do not have permission to edit this weekly value." },
      { status: 403 }
    );
  }

  // ── Past-week edit enforcement ──
  const { canEditPastWeek } = await getPastWeekFlags(tenantId);
  if (!canEditPastWeek && kpi.quarter && kpi.year) {
    const currentWeek = await getCurrentFiscalWeekFromDB(tenantId, kpi.year, kpi.quarter);
    if (validated.weekNumber < currentWeek) {
      return NextResponse.json(
        {
          success: false,
          error: `Editing past weeks is disabled. Week ${validated.weekNumber} is before the current week (${currentWeek}). Enable it in Settings > Configurations.`,
        },
        { status: 403 }
      );
    }
  }

  // Upsert via findFirst + update/create because the compound unique key includes a nullable userId
  const existing = await db.kPIWeeklyValue.findFirst({
    where: { kpiId: params.id, userId: targetUserId, weekNumber: validated.weekNumber },
    select: { id: true },
  });
  let weeklyValue;
  if (existing) {
    weeklyValue = await db.kPIWeeklyValue.update({
      where: { id: existing.id },
      data: { value: validated.value, notes: validated.notes, updatedBy: userId },
      select: { id: true, kpiId: true, userId: true, weekNumber: true, value: true, notes: true, createdAt: true, updatedAt: true },
    });
  } else {
    weeklyValue = await db.kPIWeeklyValue.create({
      data: {
        kpiId: params.id,
        tenantId,
        userId: targetUserId,
        weekNumber: validated.weekNumber,
        value: validated.value,
        notes: validated.notes,
        createdBy: userId,
      },
      select: { id: true, kpiId: true, userId: true, weekNumber: true, value: true, notes: true, createdAt: true, updatedAt: true },
    });
  }

  // Recalculate aggregate progress (sum of ALL weekly rows across owners)
  const allWeekly = await db.kPIWeeklyValue.findMany({
    where: { kpiId: params.id },
    select: { value: true },
  });
  const totalAchieved = allWeekly.reduce((s, w) => s + (w.value || 0), 0);
  const goal = kpi.qtdGoal ?? kpi.target ?? 0;
  const progressPercent = goal ? (totalAchieved / goal) * 100 : 0;

  await db.kPI.update({
    where: { id: params.id },
    data: {
      qtdAchieved: totalAchieved,
      progressPercent,
      healthStatus: calcHealthStatus(progressPercent, kpi.status),
      currentWeekValue: validated.value,
    },
  });

  await db.kPILog.create({
    data: {
      tenantId,
      kpiId: params.id,
      action: "UPDATE_WEEKLY",
      newValue: JSON.stringify(weeklyValue),
      changedBy: userId,
    },
  });

  return NextResponse.json({ success: true, data: weeklyValue });
}, { fallbackErrorMessage: "Failed to save weekly value" });
