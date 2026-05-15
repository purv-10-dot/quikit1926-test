import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateKPISchema } from "@/lib/schemas/kpiSchema";
import { ApiResponse } from "@/lib/services/kpiService";
import { canEditKPI } from "@/lib/api/kpiPermissions";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
const auth = withOrgAuthForResource("kpi", "KPI");
import { getPastWeekFlags, getCurrentFiscalWeekFromDB } from "@/lib/utils/featureFlags";

/**
 * Push target / weekly-target changes from a Team KPI down to every child
 * Individual KPI it created. Each child's `target` is `team.target × pct/100`
 * and each child's `weeklyTargets` come from `weeklyOwnerTargets[owner]`
 * (or scaled `weeklyTargets`).
 */
async function syncTeamTargetToChildren(teamKpiId: string) {
  const team = await db.kPI.findUnique({
    where: { id: teamKpiId },
    select: {
      target: true, ownerIds: true, ownerContributions: true,
      weeklyTargets: true, weeklyOwnerTargets: true,
    },
  });
  if (!team) return;
  const ownerIds = (team.ownerIds ?? []) as string[];
  if (ownerIds.length === 0) return;
  const contribs = (team.ownerContributions as Record<string, number> | null) ?? {};
  const ownerWeekly = (team.weeklyOwnerTargets as Record<string, Record<string, number>> | null) ?? null;
  const teamWeekly = (team.weeklyTargets as Record<string, number> | null) ?? null;
  const teamTarget = team.target ?? 0;

  for (const ownerId of ownerIds) {
    const child = await db.kPI.findFirst({
      where: { parentKPIId: teamKpiId, owner: ownerId, deletedAt: null },
      select: { id: true },
    });
    if (!child) continue;

    const pct = contribs[ownerId] ?? (100 / ownerIds.length);
    const childTarget = (teamTarget * pct) / 100;
    const childWeekly: Record<string, number> = (() => {
      if (ownerWeekly?.[ownerId]) return ownerWeekly[ownerId];
      if (teamWeekly) {
        const out: Record<string, number> = {};
        for (const [w, v] of Object.entries(teamWeekly)) out[w] = (v * pct) / 100;
        return out;
      }
      return {};
    })();

    await db.kPI.update({
      where: { id: child.id },
      data: {
        target: childTarget,
        weeklyTargets: childWeekly as any,
      },
    });
  }
}

/**
 * Push target / weekly-target changes from a child Individual KPI up to its
 * parent Team KPI. The team's `target` becomes the sum of all children's
 * targets; `ownerContributions` are recomputed proportionally; per-owner
 * weekly maps are updated from each child's `weeklyTargets`.
 */
async function syncChildTargetToParent(parentKpiId: string) {
  const parent = await db.kPI.findUnique({
    where: { id: parentKpiId },
    select: { ownerIds: true, weeklyTargets: true },
  });
  if (!parent) return;
  const ownerIds = (parent.ownerIds ?? []) as string[];
  if (ownerIds.length === 0) return;

  const children = await db.kPI.findMany({
    where: { parentKPIId: parentKpiId, deletedAt: null },
    select: { id: true, owner: true, target: true, weeklyTargets: true },
  });
  if (children.length === 0) return;

  const totalTarget = children.reduce((s, c) => s + (c.target ?? 0), 0);
  const newOwnerContributions: Record<string, number> = {};
  const newOwnerWeekly: Record<string, Record<string, number>> = {};
  const aggregatedWeekly: Record<string, number> = {};
  for (const c of children) {
    if (!c.owner) continue;
    newOwnerContributions[c.owner] = totalTarget > 0 ? ((c.target ?? 0) / totalTarget) * 100 : 0;
    const cw = (c.weeklyTargets as Record<string, number> | null) ?? {};
    newOwnerWeekly[c.owner] = cw;
    for (const [w, v] of Object.entries(cw)) {
      aggregatedWeekly[w] = (aggregatedWeekly[w] ?? 0) + v;
    }
  }

  await db.kPI.update({
    where: { id: parentKpiId },
    data: {
      target: totalTarget,
      ownerContributions: newOwnerContributions as any,
      weeklyTargets: aggregatedWeekly as any,
      weeklyOwnerTargets: newOwnerWeekly as any,
    },
  });
}


export const GET = auth.view<{ id: string }>(async ({ orgId }, req, { params }) => {
  const kpi = await db.kPI.findUnique({
    where: { id: params.id },
    select: {
      id: true, orgId: true, name: true, description: true, kpiLevel: true, owner: true,
      ownerIds: true, ownerContributions: true,
      teamId: true, parentKPIId: true, quarter: true, year: true,
      measurementUnit: true, target: true, quarterlyGoal: true, qtdGoal: true,
      qtdAchieved: true, currentWeekValue: true, progressPercent: true,
      status: true, healthStatus: true, lastNotes: true, lastNotesAt: true,
      divisionType: true, weeklyTargets: true, weeklyOwnerTargets: true,
      currency: true, targetScale: true, reverseColor: true, frequency: true,
      createdAt: true, updatedAt: true, createdBy: true, updatedBy: true,
      owner_user: { select: { id: true, firstName: true, lastName: true } },
      weeklyValues: { select: { weekNumber: true, value: true, notes: true }, orderBy: { weekNumber: "asc" } },
    },
  });

  if (!kpi) return NextResponse.json({ success: false, error: "KPI not found" }, { status: 404 });
  if (kpi.orgId !== orgId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

  return NextResponse.json({ success: true, data: kpi });
}, { fallbackErrorMessage: "Failed to fetch KPI" });

export const PUT = auth.update<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const existingKPI = await db.kPI.findUnique({ where: { id: params.id } });
  if (!existingKPI) return NextResponse.json({ success: false, error: "KPI not found" }, { status: 404 });
  if (existingKPI.orgId !== orgId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

  // Edit permission: creator, owner/assignee, team head, admin, or super-admin
  const canEdit = await canEditKPI(userId, orgId, {
    kpiLevel: existingKPI.kpiLevel,
    createdBy: existingKPI.createdBy,
    owner: existingKPI.owner,
    ownerIds: existingKPI.ownerIds as string[] | null,
    teamId: existingKPI.teamId,
  });
  if (!canEdit) {
    return NextResponse.json(
      { success: false, error: "Only the creator, assignee, team head, or an admin can edit this KPI." },
      { status: 403 },
    );
  }

  const body = await req.json();
  const validated = updateKPISchema.parse(body);
  const oldValue = JSON.stringify(existingKPI);

  // Determine the effective kpiLevel after the update
  const effectiveLevel: "individual" | "team" =
    (validated.kpiLevel as "individual" | "team" | undefined) ??
    (existingKPI.kpiLevel as "individual" | "team");

  // Team-KPI ownership/membership validation still runs — the edit permission
  // above is necessary but not sufficient for shape validation.
  if (effectiveLevel === "team") {
    const effectiveTeamId = validated.teamId ?? existingKPI.teamId;
    if (!effectiveTeamId) {
      return NextResponse.json({ success: false, error: "teamId is required for team KPIs" }, { status: 400 });
    }

    // If ownerIds or contributions are being changed, validate team membership + sum=100
    if (validated.ownerIds !== undefined || validated.ownerContributions !== undefined) {
      const ownerIds = validated.ownerIds ?? (existingKPI.ownerIds as string[] | null) ?? [];
      if (ownerIds.length === 0) {
        return NextResponse.json({ success: false, error: "At least one KPI owner is required for team KPIs" }, { status: 400 });
      }
      const memberships = await db.orgMember.findMany({
        where: { orgId, teamId: effectiveTeamId, userId: { in: ownerIds }, status: "active" },
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
    const { canEditPastWeek } = await getPastWeekFlags(orgId);
    if (!canEditPastWeek) {
      const currentWeek = await getCurrentFiscalWeekFromDB(orgId, existingKPI.year, existingKPI.quarter);
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

  // When qtdGoal or target changes, recompute progressPercent from existing qtdAchieved
  // so the header badge and stats display don't show stale data after save.
  const newQtdGoal = validated.qtdGoal !== undefined
    ? validated.qtdGoal
    : (validated.target !== undefined ? validated.target : null);
  const recomputedProgress = newQtdGoal != null && newQtdGoal > 0
    ? ((existingKPI.qtdAchieved ?? 0) / newQtdGoal) * 100
    : null;
  const recomputedHealth = recomputedProgress != null
    ? ((validated.status ?? existingKPI.status) === "completed"
        ? "complete"
        : recomputedProgress >= 100 ? "on-track"
        : recomputedProgress >= 80 ? "behind-schedule"
        : "critical")
    : undefined;

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
      frequency: validated.frequency ?? undefined,
      updatedBy: userId,
      ...(recomputedProgress != null && { progressPercent: recomputedProgress }),
      ...(recomputedHealth !== undefined && { healthStatus: recomputedHealth }),
    },
    select: {
      id: true, name: true, description: true, kpiLevel: true, owner: true,
      ownerIds: true, ownerContributions: true, teamId: true,
      parentKPIId: true, quarter: true, year: true, measurementUnit: true,
      target: true, quarterlyGoal: true, qtdGoal: true, qtdAchieved: true,
      progressPercent: true, status: true, healthStatus: true,
      divisionType: true, weeklyTargets: true, currency: true, targetScale: true, reverseColor: true, frequency: true,
      createdAt: true, updatedAt: true, createdBy: true,
      owner_user: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  // ── Target sync between Team KPI ↔ child Individual KPIs ──
  // (a) Team edit  → push target/weeklyTargets/contributions to children
  // (b) Child edit → recompute parent.target from sum of children
  const targetMaybeChanged =
    validated.target !== undefined ||
    validated.weeklyTargets !== undefined ||
    validated.weeklyOwnerTargets !== undefined ||
    validated.ownerContributions !== undefined;
  if (targetMaybeChanged) {
    if (effectiveLevel === "team") {
      await syncTeamTargetToChildren(params.id).catch((e) =>
        console.error("[kpi PUT] syncTeamTargetToChildren failed", e),
      );
    } else if (existingKPI.parentKPIId) {
      await syncChildTargetToParent(existingKPI.parentKPIId).catch((e) =>
        console.error("[kpi PUT] syncChildTargetToParent failed", e),
      );
    }
  }

  // ── Per-owner child rename ──
  // When the Team KPI form sends `ownerKpiNames`, rename each child Individual
  // KPI to match. Empty / missing entries are ignored (child keeps its name).
  if (effectiveLevel === "team" && validated.ownerKpiNames) {
    const ownerNames = validated.ownerKpiNames as Record<string, string>;
    for (const [ownerId, rawName] of Object.entries(ownerNames)) {
      const newName = rawName?.trim();
      if (!newName) continue;
      const child = await db.kPI.findFirst({
        where: { parentKPIId: params.id, owner: ownerId, deletedAt: null },
        select: { id: true, name: true },
      });
      if (!child || child.name === newName) continue;
      await db.kPI.update({
        where: { id: child.id },
        data: { name: newName, updatedBy: userId },
      });
    }
  }

  await db.kPILog.create({
    data: { orgId, kpiId: params.id, action: "UPDATE", oldValue, newValue: JSON.stringify(updatedKPI), changedBy: userId },
  });

  return NextResponse.json({ success: true, data: updatedKPI, message: "KPI updated successfully" });
}, { fallbackErrorMessage: "Failed to update KPI" });

export const DELETE = auth.delete<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const kpi = await db.kPI.findUnique({ where: { id: params.id } });
  if (!kpi) return NextResponse.json({ success: false, error: "KPI not found" }, { status: 404 });
  if (kpi.orgId !== orgId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

  // Edit permission: creator, owner/assignee, team head, admin, or super-admin
  const canEdit = await canEditKPI(userId, orgId, {
    kpiLevel: kpi.kpiLevel,
    createdBy: kpi.createdBy,
    owner: kpi.owner,
    ownerIds: kpi.ownerIds as string[] | null,
    teamId: kpi.teamId,
  });
  if (!canEdit) {
    return NextResponse.json(
      { success: false, error: "Only the creator, assignee, team head, or an admin can delete this KPI." },
      { status: 403 },
    );
  }

  const oldValue = JSON.stringify(kpi);
  const now = new Date();
  await db.kPI.update({ where: { id: params.id }, data: { deletedAt: now } });

  // ── Linked-KPI cleanup ──
  // Team KPI deleted → soft-delete every child Individual KPI.
  // Child Individual KPI deleted → recompute parent target/contributions.
  if (kpi.kpiLevel === "team") {
    const children = await db.kPI.findMany({
      where: { parentKPIId: params.id, deletedAt: null },
      select: { id: true },
    });
    if (children.length > 0) {
      await db.kPI.updateMany({
        where: { id: { in: children.map((c) => c.id) } },
        data: { deletedAt: now },
      });
      for (const c of children) {
        await db.kPILog.create({
          data: { orgId, kpiId: c.id, action: "DELETE", oldValue: JSON.stringify({ cascadedFromTeamKPI: params.id }), changedBy: userId },
        });
      }
    }
  } else if (kpi.parentKPIId) {
    await syncChildTargetToParent(kpi.parentKPIId).catch((e) =>
      console.error("[kpi DELETE] syncChildTargetToParent failed", e),
    );
  }

  await db.kPILog.create({ data: { orgId, kpiId: params.id, action: "DELETE", oldValue, changedBy: userId } });

  return NextResponse.json({ success: true, message: "KPI deleted successfully" });
}, { fallbackErrorMessage: "Failed to delete KPI" });
