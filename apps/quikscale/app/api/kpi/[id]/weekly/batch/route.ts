import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { weeklyValueBatchSchema } from "@/lib/schemas/kpiSchema";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
const withOrgAuth = withOrgAuthForModule("kpi");
import { getPastWeekFlags, getCurrentFiscalWeekFromDB } from "@/lib/utils/featureFlags";
import { audit, requestContext } from "@/lib/audit";

function calcHealthStatus(progress: number, status: string): string {
  if (status === "completed") return "complete";
  if (progress >= 100) return "on-track";
  if (progress >= 80) return "behind-schedule";
  return "critical";
}

/**
 * Upsert a (kpiId, userId, weekNumber) weekly row WITHOUT recomputing the
 * KPI aggregate. Recompute runs once at end of batch — recomputing per-row
 * would do N reads of the same KPI's weekly values for no reason.
 */
async function upsertRow(opts: {
  kpiId: string;
  orgId: string;
  userId: string;
  weekNumber: number;
  value: number | null | undefined;
  notes: string | null | undefined;
  changedBy: string;
}): Promise<void> {
  // Preserve null so "cleared input" stays distinct from "entered 0".
  // Display + color logic (e.g. `weekCellColors`, dashboard QTD cell) gate
  // RED on `value != null`, so coercing null → 0 here paints unentered
  // weeks red. The KPIWeeklyValue.value column is Float? — nullable.
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
}

/**
 * Recompute aggregate progress + health + currentWeekValue for one KPI based
 * on its full set of KPIWeeklyValue rows. Run ONCE after all batch upserts
 * land.
 */
async function recalcKPI(kpiId: string): Promise<void> {
  const target = await db.kPI.findUnique({
    where: { id: kpiId },
    select: { qtdGoal: true, target: true, status: true },
  });
  if (!target) return;

  const allWeekly = await db.kPIWeeklyValue.findMany({
    where: { kpiId },
    select: { value: true, weekNumber: true },
    orderBy: { weekNumber: "desc" },
  });
  const totalAchieved = allWeekly.reduce((s, w) => s + (w.value || 0), 0);
  const goal = target.qtdGoal ?? target.target ?? 0;
  const progressPercent = goal ? (totalAchieved / goal) * 100 : 0;
  const currentWeekValue = allWeekly[0]?.value ?? 0;

  await db.kPI.update({
    where: { id: kpiId },
    data: {
      qtdAchieved: totalAchieved,
      progressPercent,
      healthStatus: calcHealthStatus(progressPercent, target.status),
      currentWeekValue,
    },
  });
}

type BatchResult = {
  weekNumber: number;
  userId: string;
  ok: boolean;
  error?: string;
};

/**
 * POST /api/kpi/[id]/weekly/batch
 *
 * Body: { inputs: WeeklyValueInput[] }
 *
 * Performs all upserts for (kpiId, userId, weekNumber) triples in a single
 * request. Per-input permission check + past-week gate; failures don't
 * abort the batch — they're reported back per-input. KPI aggregate
 * (progressPercent, healthStatus, currentWeekValue) recomputed ONCE after
 * all upserts.
 *
 * Linked Team ↔ Individual KPI sync mirrors the single-week route: for each
 * applied input, write to both the primary KPI and its linked partner.
 */
export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, req: NextRequest, { params }) => {
  const kpi = await db.kPI.findUnique({
    where: { id: params.id },
    select: {
      orgId: true, qtdGoal: true, target: true, status: true,
      quarter: true, year: true, teamId: true,
      kpiLevel: true, owner: true, ownerIds: true, parentKPIId: true,
    },
  });
  if (!kpi) return NextResponse.json({ success: false, error: "KPI not found" }, { status: 404 });
  if (kpi.orgId !== orgId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

  const body = await req.json();
  // safeParse → 400 with friendly message. The Save Changes button on the
  // KPI Updates tab hits this route — long notes on any week previously
  // surfaced as opaque 500s.
  const parsed = weeklyValueBatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const validated = parsed.data;

  const { canEditPastWeek } = await getPastWeekFlags(orgId);
  const currentWeek = kpi.quarter && kpi.year
    ? await getCurrentFiscalWeekFromDB(orgId, kpi.year, kpi.quarter)
    : 1;

  const ownerIds = (kpi.ownerIds ?? []) as string[];
  const results: BatchResult[] = [];
  const touchedKpiIds = new Set<string>([params.id]);

  // Snapshot the same-week values before writing so the audit captures the
  // per-row old → new diff the Bulk Edit timeline card renders.
  const editedWeeks = [...new Set(validated.inputs.map((i) => i.weekNumber))];
  const existingWeekRows = await db.kPIWeeklyValue.findMany({
    where: { kpiId: params.id, weekNumber: { in: editedWeeks } },
    select: { userId: true, weekNumber: true, value: true },
  });
  const oldValueMap = new Map<string, number | null>(
    existingWeekRows.map((r) => [`${r.userId ?? ""}:${r.weekNumber}`, r.value ?? null]),
  );
  const appliedChanges: Array<{
    weekNumber: number;
    userId: string;
    oldValue: number | null;
    newValue: number | null;
    note: string | null;
  }> = [];

  for (const input of validated.inputs) {
    // Resolve target user (same rules as single-week)
    const targetUserId = input.userId ?? (kpi.kpiLevel === "individual" ? kpi.owner : null);
    if (!targetUserId) {
      results.push({ weekNumber: input.weekNumber, userId: input.userId ?? "", ok: false, error: "userId is required for team KPI weekly values" });
      continue;
    }
    if (kpi.kpiLevel === "team" && !ownerIds.includes(targetUserId)) {
      results.push({ weekNumber: input.weekNumber, userId: targetUserId, ok: false, error: "The selected user is not a contributor on this Team KPI." });
      continue;
    }

    // Past-week gate — org-level config, not a role check.
    if (!canEditPastWeek && input.weekNumber < currentWeek) {
      results.push({ weekNumber: input.weekNumber, userId: targetUserId, ok: false, error: `Editing past weeks is disabled. Week ${input.weekNumber} is before the current week (${currentWeek}). Enable it in Settings > Configurations.` });
      continue;
    }

    // No instance-level role check here — RBAC v2 `KPI:update` / `TeamKPI:update`
    // (enforced by the route wrapper) is the sole authorization gate.

    // Primary upsert
    try {
      await upsertRow({
        kpiId: params.id,
        orgId,
        userId: targetUserId,
        weekNumber: input.weekNumber,
        value: input.value,
        notes: input.notes,
        changedBy: userId,
      });
    } catch (e: unknown) {
      results.push({ weekNumber: input.weekNumber, userId: targetUserId, ok: false, error: e instanceof Error ? e.message : "Upsert failed" });
      continue;
    }

    // Team ↔ Individual sync (mirror the single-week route's logic)
    if (kpi.kpiLevel === "team") {
      const child = await db.kPI.findFirst({
        where: { parentKPIId: params.id, owner: targetUserId, deletedAt: null },
        select: { id: true, orgId: true },
      });
      if (child) {
        await upsertRow({
          kpiId: child.id,
          orgId: child.orgId,
          userId: targetUserId,
          weekNumber: input.weekNumber,
          value: input.value,
          notes: input.notes,
          changedBy: userId,
        });
        touchedKpiIds.add(child.id);
      }
    } else if (kpi.parentKPIId) {
      await upsertRow({
        kpiId: kpi.parentKPIId,
        orgId,
        userId: targetUserId,
        weekNumber: input.weekNumber,
        value: input.value,
        notes: input.notes,
        changedBy: userId,
      });
      touchedKpiIds.add(kpi.parentKPIId);
    }

    appliedChanges.push({
      weekNumber: input.weekNumber,
      userId: targetUserId,
      oldValue: oldValueMap.get(`${targetUserId}:${input.weekNumber}`) ?? null,
      newValue: input.value ?? null,
      note: input.notes ?? null,
    });
    results.push({ weekNumber: input.weekNumber, userId: targetUserId, ok: true });
  }

  // Recompute aggregates for each touched KPI (primary + linked partners)
  for (const id of touchedKpiIds) {
    await recalcKPI(id);
  }

  // Single audit row summarizing the batch
  const applied = results.filter(r => r.ok).length;
  const failed = results.length - applied;
  await db.kPILog.create({
    data: {
      orgId,
      kpiId: params.id,
      action: "UPDATE_WEEKLY_BATCH",
      newValue: JSON.stringify({ applied, failed, results }),
      changedBy: userId,
    },
  });

  // ── Centralized audit (dual-write) ── one BULK_UPDATE event for the batch,
  // with a change row per value-changed week and the full per-row detail in
  // the snapshot (weeks, owners, old→new, notes) for the Bulk Edit card.
  if (applied > 0) {
    const sortedWeeks = [...new Set(appliedChanges.map((c) => c.weekNumber))].sort(
      (a, b) => a - b,
    );
    await audit.log({
      entityType: "KPI",
      entityId: params.id,
      action: "BULK_UPDATE",
      actor: { userId, orgId, teamId: kpi.teamId },
      changes: appliedChanges
        .filter((c) => c.oldValue !== c.newValue)
        .map((c) => ({
          fieldName: `week_${c.weekNumber}`,
          oldValue: c.oldValue,
          newValue: c.newValue,
        })),
      snapshot: { applied, failed, weeks: sortedWeeks, rows: appliedChanges },
      ...requestContext(req),
    });
  }

  return NextResponse.json({
    success: true,
    data: { applied, failed, results },
  });
}, { fallbackErrorMessage: "Failed to batch-save weekly values" });
