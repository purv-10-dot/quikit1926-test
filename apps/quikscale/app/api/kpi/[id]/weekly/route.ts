import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { weeklyValueSchema } from "@/lib/schemas/kpiSchema";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
const withOrgAuth = withOrgAuthForModule("kpi");
import { getPastWeekFlags, getCurrentFiscalWeekFromDB } from "@/lib/utils/featureFlags";
import { audit, requestContext } from "@/lib/audit";
import { weeklyTargetForWeek } from "@/lib/utils/kpiHelpers";
import { withTxRetry } from "@/lib/api/withTxRetry";
import { publishRealtime } from "@quikit/realtime/server";


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
export const GET = withOrgAuth<{ id: string }>(async ({ orgId }, req, { params }) => {
  const kpi = await db.kPI.findUnique({ where: { id: params.id }, select: { orgId: true } });
  if (!kpi) return NextResponse.json({ success: false, error: "KPI not found" }, { status: 404 });
  if (kpi.orgId !== orgId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

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
 * Authorization: handled exclusively by the RBAC v2 `KPI:update` /
 * `TeamKPI:update` gate enforced by the route wrapper. No in-handler
 * owner/role check.
 *
 * On success, re-aggregates qtdAchieved as the SUM of all weekly values for the KPI
 * and recomputes progressPercent + healthStatus.
 */
/**
 * Upsert a (kpiId, userId, weekNumber) weekly row + recompute that KPI's
 * aggregate progress. Used both for the primary write and for the linked
 * sync write (Team ↔ child Individual). No permission/log side-effects —
 * those run only on the primary path.
 */
async function upsertAndRecalc(opts: {
  kpiId: string;
  orgId: string;
  userId: string;
  weekNumber: number;
  value: number | null | undefined;
  notes: string | null | undefined;
  changedBy: string;
}) {
  // Preserve null so "cleared input" stays distinct from "entered 0".
  // See `weekly/batch/route.ts` for the same fix + rationale.
  const value = opts.value ?? null;
  const existing = await db.kPIWeeklyValue.findFirst({
    where: { kpiId: opts.kpiId, userId: opts.userId, weekNumber: opts.weekNumber },
    select: { id: true },
  });
  if (existing) {
    await db.kPIWeeklyValue.update({
      where: { id: existing.id },
      data: { value, notes: opts.notes ?? null, updatedBy: opts.changedBy },
    });
  } else {
    await db.kPIWeeklyValue.create({
      data: {
        kpiId: opts.kpiId,
        orgId: opts.orgId,
        userId: opts.userId,
        weekNumber: opts.weekNumber,
        value,
        notes: opts.notes ?? null,
        createdBy: opts.changedBy,
      },
    });
  }

  const target = await db.kPI.findUnique({
    where: { id: opts.kpiId },
    select: { qtdGoal: true, target: true, status: true },
  });
  if (!target) return;

  const allWeekly = await db.kPIWeeklyValue.findMany({
    where: { kpiId: opts.kpiId },
    select: { value: true },
  });
  const totalAchieved = allWeekly.reduce((s, w) => s + (w.value || 0), 0);
  const goal = target.qtdGoal ?? target.target ?? 0;
  const progressPercent = goal ? (totalAchieved / goal) * 100 : 0;

  await db.kPI.update({
    where: { id: opts.kpiId },
    data: {
      qtdAchieved: totalAchieved,
      progressPercent,
      healthStatus: calcHealthStatus(progressPercent, target.status),
      currentWeekValue: value,
    },
  });
}

export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const kpi = await db.kPI.findUnique({
    where: { id: params.id },
    select: {
      orgId: true, qtdGoal: true, target: true, status: true,
      quarter: true, year: true, teamId: true,
      kpiLevel: true, owner: true, ownerIds: true, parentKPIId: true,
      weeklyTargets: true,
    },
  });
  if (!kpi) return NextResponse.json({ success: false, error: "KPI not found" }, { status: 404 });
  if (kpi.orgId !== orgId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

  const body = await req.json();
  // safeParse → 400 with friendly message (e.g. long weekly note exceeding
  // the 500-char cap). `.parse()` would throw and surface as opaque 500.
  const parsed = weeklyValueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const validated = parsed.data;

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
        { success: false, error: "The selected user is not a contributor on this Team KPI." },
        { status: 400 }
      );
    }
  }

  // No instance-level role check — RBAC v2 `KPI:update` / `TeamKPI:update`
  // (enforced by the route wrapper) is the sole authorization gate.

  // ── Past-week edit enforcement ──
  const { canEditPastWeek } = await getPastWeekFlags(orgId);
  if (!canEditPastWeek && kpi.quarter && kpi.year) {
    const currentWeek = await getCurrentFiscalWeekFromDB(orgId, kpi.year, kpi.quarter);
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

  // Capture the same-week previous value (for the audit diff) and the prior
  // week's value (for the timeline's "Δ from prior" display) before writing.
  const priorRows = await db.kPIWeeklyValue.findMany({
    where: {
      kpiId: params.id,
      userId: targetUserId,
      weekNumber: { in: [validated.weekNumber, validated.weekNumber - 1] },
    },
    select: { weekNumber: true, value: true },
  });
  const previousValue =
    priorRows.find((r) => r.weekNumber === validated.weekNumber)?.value ?? null;
  const priorWeekValue =
    priorRows.find((r) => r.weekNumber === validated.weekNumber - 1)?.value ?? null;

  // Primary write — upsert + recompute on the KPI the request targets.
  // withTxRetry re-runs the (idempotent) upsert+recompute if Postgres kills it
  // as a deadlock victim under concurrent saves on the same KPI / shared parent.
  await withTxRetry(() =>
    upsertAndRecalc({
      kpiId: params.id,
      orgId,
      userId: targetUserId,
      weekNumber: validated.weekNumber,
      value: validated.value,
      notes: validated.notes,
      changedBy: userId,
    }),
  );

  // ── Bidirectional sync between Team KPI ↔ child Individual KPIs ──
  // (a) Team write  → mirror to that owner's child Individual KPI
  // (b) Child write → mirror to the parent Team KPI's per-owner row
  if (kpi.kpiLevel === "team") {
    const child = await db.kPI.findFirst({
      where: {
        parentKPIId: params.id,
        owner: targetUserId,
        deletedAt: null,
      },
      select: { id: true, orgId: true },
    });
    if (child) {
      await withTxRetry(() =>
        upsertAndRecalc({
          kpiId: child.id,
          orgId: child.orgId,
          userId: targetUserId,
          weekNumber: validated.weekNumber,
          value: validated.value,
          notes: validated.notes,
          changedBy: userId,
        }),
      );
    }
  } else if (kpi.parentKPIId) {
    const parentKpiId = kpi.parentKPIId; // capture: narrowing is lost inside the closure
    await withTxRetry(() =>
      upsertAndRecalc({
        kpiId: parentKpiId,
        orgId,
        userId: targetUserId,
        weekNumber: validated.weekNumber,
        value: validated.value,
        notes: validated.notes,
        changedBy: userId,
      }),
    );
  }

  // Re-read the row we just upserted so the response carries the canonical shape.
  const weeklyValue = await db.kPIWeeklyValue.findFirst({
    where: { kpiId: params.id, userId: targetUserId, weekNumber: validated.weekNumber },
    select: { id: true, kpiId: true, userId: true, weekNumber: true, value: true, notes: true, createdAt: true, updatedAt: true },
  });

  await db.kPILog.create({
    data: {
      orgId,
      kpiId: params.id,
      action: "UPDATE_WEEKLY",
      newValue: JSON.stringify(weeklyValue),
      changedBy: userId,
    },
  });

  // ── Centralized audit (dual-write) ──
  const newWeekValue = validated.value ?? null;
  await audit.log({
    entityType: "KPI",
    entityId: params.id,
    action: "WEEKLY_UPDATE",
    actor: { userId, orgId, teamId: kpi.teamId },
    changes:
      previousValue !== newWeekValue
        ? [{ fieldName: `week_${validated.weekNumber}`, oldValue: previousValue, newValue: newWeekValue }]
        : [],
    snapshot: {
      weekNumber: validated.weekNumber,
      value: newWeekValue,
      notes: validated.notes ?? null,
      userId: targetUserId,
      previousValue,
      priorWeekValue,
      // Per-week target as shown in the Updates tab: explicit weeklyTargets[week]
      // when configured, else the flat qtdGoal/13 distribution.
      weeklyTarget: weeklyTargetForWeek(
        { weeklyTargets: kpi.weeklyTargets as Record<string, number> | null, qtdGoal: kpi.qtdGoal, target: kpi.target },
        validated.weekNumber,
      ),
    },
    ...requestContext(req),
  });

  // Real-time: tell other clients in this org a KPI changed so they refetch.
  await publishRealtime({
    entity: "kpi",
    action: "updated",
    id: params.id,
    orgId,
    teamId: kpi.teamId,
    ownerId: targetUserId,
    year: kpi.year ?? undefined,
    quarter: kpi.quarter ?? undefined,
    actorUserId: userId,
  });

  return NextResponse.json({ success: true, data: weeklyValue });
}, { fallbackErrorMessage: "Failed to save weekly value" });
