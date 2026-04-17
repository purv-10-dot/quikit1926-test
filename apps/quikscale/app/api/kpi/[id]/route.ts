import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateKPISchema } from "@/lib/schemas/kpiSchema";
import { ApiResponse } from "@/lib/services/kpiService";
import { canManageTeamKPI } from "@/lib/api/teamKPIPermissions";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("kpi");
import { getPastWeekFlags, getCurrentFiscalWeekFromDB } from "@/lib/utils/featureFlags";


export const GET = withTenantAuth<{ id: string }>(async ({ tenantId }, req, { params }) => {
  const kpi = await db.kPI.findUnique({
    where: { id: params.id },
    select: {
      id: true, tenantId: true, name: true, description: true, kpiLevel: true, owner: true,
      ownerIds: true, ownerContributions: true,
      teamId: true, parentKPIId: true, quarter: true, year: true,
      measurementUnit: true, target: true, quarterlyGoal: true, qtdGoal: true,
      qtdAchieved: true, currentWeekValue: true, progressPercent: true,
      status: true, healthStatus: true, lastNotes: true, lastNotesAt: true,
      divisionType: true, weeklyTargets: true, weeklyOwnerTargets: true,
      currency: true, targetScale: true, reverseColor: true,
      createdAt: true, updatedAt: true, createdBy: true, updatedBy: true,
      owner_user: { select: { id: true, firstName: true, lastName: true } },
      weeklyValues: { select: { weekNumber: true, value: true, notes: true }, orderBy: { weekNumber: "asc" } },
    },
  });

  if (!kpi) return NextResponse.json({ success: false, error: "KPI not found" }, { status: 404 });
  if (kpi.tenantId !== tenantId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

  return NextResponse.json({ success: true, data: kpi });
}, { fallbackErrorMessage: "Failed to fetch KPI" });

export const PUT = withTenantAuth<{ id: string }>(async ({ tenantId, userId }, req, { params }) => {
  const existingKPI = await db.kPI.findUnique({ where: { id: params.id } });
  if (!existingKPI) return NextResponse.json({ success: false, error: "KPI not found" }, { status: 404 });
  if (existingKPI.tenantId !== tenantId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

  const body = await req.json();
  const validated = updateKPISchema.parse(body);
  const oldValue = JSON.stringify(existingKPI);

  // Determine the effective kpiLevel after the update
  const effectiveLevel: "individual" | "team" =
    (validated.kpiLevel as "individual" | "team" | undefined) ??
    (existingKPI.kpiLevel as "individual" | "team");

  // Team KPI permission gate — required when the row is (or is becoming) team-level
  if (effectiveLevel === "team") {
    const effectiveTeamId = validated.teamId ?? existingKPI.teamId;
    if (!effectiveTeamId) {
      return NextResponse.json({ success: false, error: "teamId is required for team KPIs" }, { status: 400 });
    }
    const allowed = await canManageTeamKPI(userId, tenantId, effectiveTeamId);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "You must be a team head or admin to edit KPIs for this team." },
        { status: 403 }
      );
    }

    // If ownerIds or contributions are being changed, validate team membership + sum=100
    if (validated.ownerIds !== undefined || validated.ownerContributions !== undefined) {
      const ownerIds = validated.ownerIds ?? (existingKPI.ownerIds as string[] | null) ?? [];
      if (ownerIds.length === 0) {
        return NextResponse.json({ success: false, error: "At least one KPI owner is required for team KPIs" }, { status: 400 });
      }
      const memberships = await db.membership.findMany({
        where: { tenantId, teamId: effectiveTeamId, userId: { in: ownerIds }, status: "active" },
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

      const contribs = (validated.ownerContributions ?? (existingKPI.ownerContributions as Record<string, number> | null) ?? {}) as Record<string, number>;
      const keys = Object.keys(contribs);
      if (keys.length !== ownerIds.length || ownerIds.some((id) => !(id in contribs))) {
        return NextResponse.json(
          { success: false, error: "Owner contributions must be provided for every owner" },
          { status: 400 }
        );
      }
      const sum = Object.values(contribs).reduce((s, v) => s + v, 0);
      if (Math.abs(sum - 100) > 0.5) {
        return NextResponse.json(
          { success: false, error: `Owner contributions must sum to 100% (got ${sum.toFixed(1)}%)` },
          { status: 400 }
        );
      }
    }
  }

  // ── Past-week edit enforcement (weekly target breakdown) ──
  // When edit_past_week_data is disabled, reject changes to past-week targets
  if (validated.weeklyTargets && existingKPI.quarter && existingKPI.year) {
    const { canEditPastWeek } = await getPastWeekFlags(tenantId);
    if (!canEditPastWeek) {
      const currentWeek = await getCurrentFiscalWeekFromDB(tenantId, existingKPI.year, existingKPI.quarter);
      const oldTargets = (existingKPI.weeklyTargets as Record<string, number> | null) || {};
      const newTargets = validated.weeklyTargets as Record<string, number>;
      for (const [weekStr, newVal] of Object.entries(newTargets)) {
        const week = parseInt(weekStr, 10);
        if (week < currentWeek) {
          const oldVal = oldTargets[weekStr] ?? 0;
          if ((newVal ?? 0) !== (oldVal ?? 0)) {
            return NextResponse.json(
              {
                success: false,
                error: `Editing past week targets is disabled. Week ${week} is before the current week (${currentWeek}). Enable it in Settings > Configurations.`,
              },
              { status: 403 }
            );
          }
        }
      }
    }
  }

  const updatedKPI = await db.kPI.update({
    where: { id: params.id },
    data: {
      name: validated.name,
      description: validated.description,
      kpiLevel: effectiveLevel,
      // When the row is team-level, owner is forced to null regardless of payload
      owner: effectiveLevel === "team" ? null : (validated.owner ?? existingKPI.owner),
      ownerIds: effectiveLevel === "team"
        ? (validated.ownerIds ?? (existingKPI.ownerIds as string[] | null) ?? [])
        : [],
      ownerContributions: effectiveLevel === "team"
        ? (validated.ownerContributions ?? (existingKPI.ownerContributions as any) ?? undefined)
        : undefined,
      teamId: validated.teamId ?? existingKPI.teamId,
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
      weeklyOwnerTargets: effectiveLevel === "team"
        ? ((validated.weeklyOwnerTargets ?? undefined) as any)
        : undefined,
      currency: validated.currency ?? null,
      targetScale: validated.targetScale ?? null,
      reverseColor: validated.reverseColor ?? undefined,
      updatedBy: userId,
    },
    select: {
      id: true, name: true, description: true, kpiLevel: true, owner: true,
      ownerIds: true, ownerContributions: true, teamId: true,
      parentKPIId: true, quarter: true, year: true, measurementUnit: true,
      target: true, quarterlyGoal: true, qtdGoal: true, qtdAchieved: true,
      progressPercent: true, status: true, healthStatus: true,
      divisionType: true, weeklyTargets: true, currency: true, targetScale: true, reverseColor: true,
      createdAt: true, updatedAt: true, createdBy: true,
      owner_user: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  await db.kPILog.create({
    data: { tenantId, kpiId: params.id, action: "UPDATE", oldValue, newValue: JSON.stringify(updatedKPI), changedBy: userId },
  });

  return NextResponse.json({ success: true, data: updatedKPI, message: "KPI updated successfully" });
}, { fallbackErrorMessage: "Failed to update KPI" });

export const DELETE = withTenantAuth<{ id: string }>(async ({ tenantId, userId }, req, { params }) => {
  const kpi = await db.kPI.findUnique({ where: { id: params.id } });
  if (!kpi) return NextResponse.json({ success: false, error: "KPI not found" }, { status: 404 });
  if (kpi.tenantId !== tenantId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

  // Team KPI permission gate
  if (kpi.kpiLevel === "team" && kpi.teamId) {
    const allowed = await canManageTeamKPI(userId, tenantId, kpi.teamId);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "You must be a team head or admin to delete KPIs for this team." },
        { status: 403 }
      );
    }
  }

  const oldValue = JSON.stringify(kpi);
  await db.kPI.update({ where: { id: params.id }, data: { deletedAt: new Date() } });

  await db.kPILog.create({ data: { tenantId, kpiId: params.id, action: "DELETE", oldValue, changedBy: userId } });

  return NextResponse.json({ success: true, message: "KPI deleted successfully" });
}, { fallbackErrorMessage: "Failed to delete KPI" });
