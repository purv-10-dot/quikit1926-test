import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { weeklyValueBatchSchema } from "@/lib/schemas/kpiSchema";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
const withOrgAuth = withOrgAuthForModule("kpi");
import { getPastWeekFlags, getWeekGateFromDB } from "@/lib/utils/featureFlags";
import { weekEditState, earliestEditableWeek } from "@/lib/utils/weekLock";
import { audit, requestContext } from "@/lib/audit";
import { weeklyTargetForWeek } from "@/lib/utils/kpiHelpers";
import { withTxRetry } from "@/lib/api/withTxRetry";

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
  // Atomic upsert on the @@unique([kpiId, userId, weekNumber]) constraint.
  // Replaces a findFirst-then-create that raced to a P2002 on concurrent /
  // double-click saves (two requests both see "no row" and both INSERT).
  // `orgId` isn't part of the unique key so Prisma won't accept it in `where`;
  // tenant isolation is already enforced by the KPI-ownership check in the
  // handler, and `orgId` is still written on insert via `create`.
  await db.kPIWeeklyValue.upsert({
    where: {
      kpiId_userId_weekNumber: {
        kpiId: opts.kpiId,
        userId: opts.userId,
        weekNumber: opts.weekNumber,
      },
    },
    update: { value, notes: opts.notes ?? null, updatedBy: opts.changedBy },
    create: {
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
      weeklyTargets: true,
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
  const { currentWeek, quarterPosition } = kpi.quarter && kpi.year
    ? await getWeekGateFromDB(orgId, kpi.year, kpi.quarter)
    : { currentWeek: 1, quarterPosition: "current" as const };

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

    // Quarter-aware past/future gate — org-level config, not a role check.
    // Future quarters/weeks are always rejected; a past quarter is rejected
    // unless edit-past is on; in the current quarter, weeks before the editable
    // window (current week minus the grace) are rejected — the grace keeps the
    // immediately-previous week editable.
    const gate = weekEditState({ quarterPosition, week: input.weekNumber, currentWeek, canEditPastWeek, flagsLoaded: true });
    if (gate.locked) {
      const reason = gate.isFuture
        ? `Week ${input.weekNumber} is in the future and can't be updated yet.`
        : quarterPosition === "past"
          ? `Editing past quarters is disabled. Enable it in Settings > Configurations.`
          : `Editing past weeks is disabled. Week ${input.weekNumber} is before the earliest editable week (${earliestEditableWeek(currentWeek, canEditPastWeek)}). Enable it in Settings > Configurations.`;
      results.push({ weekNumber: input.weekNumber, userId: targetUserId, ok: false, error: reason });
      continue;
    }

    // No instance-level role check here — RBAC v2 `KPI:update` / `TeamKPI:update`
    // (enforced by the route wrapper) is the sole authorization gate.

    // Primary upsert — retried on a deadlock victim (idempotent upsert). A
    // non-deadlock failure still falls through to the per-input error report
    // below, preserving the batch's partial-success contract.
    try {
      await withTxRetry(() =>
        upsertRow({
          kpiId: params.id,
          orgId,
          userId: targetUserId,
          weekNumber: input.weekNumber,
          value: input.value,
          notes: input.notes,
          changedBy: userId,
        }),
      );
    } catch (e: unknown) {
      results.push({ weekNumber: input.weekNumber, userId: targetUserId, ok: false, error: e instanceof Error ? e.message : "Upsert failed" });
      continue;
    }

    // Team ↔ Individual sync (mirror the single-week route's logic).
    // The primary write above already succeeded, so a failure syncing the
    // linked partner KPI must NOT abort the batch or 500 the whole save — it's
    // surfaced as a per-input error instead, preserving the partial-success
    // contract. (Previously this ran unwrapped and a partner failure escaped
    // to the route's outer catch as a 500.)
    let partnerSyncError: string | null = null;
    try {
      if (kpi.kpiLevel === "team") {
        const child = await db.kPI.findFirst({
          where: { parentKPIId: params.id, owner: targetUserId, deletedAt: null },
          select: { id: true, orgId: true },
        });
        if (child) {
          await withTxRetry(() =>
            upsertRow({
              kpiId: child.id,
              orgId: child.orgId,
              userId: targetUserId,
              weekNumber: input.weekNumber,
              value: input.value,
              notes: input.notes,
              changedBy: userId,
            }),
          );
          touchedKpiIds.add(child.id);
        }
      } else if (kpi.parentKPIId) {
        const parentKpiId = kpi.parentKPIId; // capture: narrowing is lost inside the closure
        await withTxRetry(() =>
          upsertRow({
            kpiId: parentKpiId,
            orgId,
            userId: targetUserId,
            weekNumber: input.weekNumber,
            value: input.value,
            notes: input.notes,
            changedBy: userId,
          }),
        );
        touchedKpiIds.add(kpi.parentKPIId);
      }
    } catch (e: unknown) {
      partnerSyncError = e instanceof Error ? e.message : "Linked KPI sync failed";
    }

    appliedChanges.push({
      weekNumber: input.weekNumber,
      userId: targetUserId,
      oldValue: oldValueMap.get(`${targetUserId}:${input.weekNumber}`) ?? null,
      newValue: input.value ?? null,
      note: input.notes ?? null,
    });
    // Primary write landed → this input is applied. Any linked-sync failure is
    // reported as an additional (non-fatal) error row so it stays visible.
    results.push({ weekNumber: input.weekNumber, userId: targetUserId, ok: true });
    if (partnerSyncError) {
      results.push({
        weekNumber: input.weekNumber,
        userId: targetUserId,
        ok: false,
        error: `Linked KPI sync failed: ${partnerSyncError}`,
      });
    }
  }

  // Recompute aggregates for each touched KPI (primary + linked partners).
  // Sort the ids so concurrent batches touching the same shared parent KPI
  // acquire locks in a consistent order, and retry each recompute (idempotent —
  // it recomputes from the full weekly set) if killed as a deadlock victim.
  for (const id of [...touchedKpiIds].sort()) {
    await withTxRetry(() => recalcKPI(id));
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

  // ── Centralized audit (dual-write) ──
  // Classify by how many DISTINCT weeks changed in this single save:
  //   • ≥ 3 weeks → one BULK_UPDATE event (purple "Bulk weekly update" card)
  //   • < 3 weeks → one WEEKLY_UPDATE event PER changed (week, owner) row, so a
  //     1- or 2-week save renders as amber "Weekly update · Week N" card(s)
  //     instead of a misleading Bulk card. The WEEKLY snapshot mirrors the
  //     single-week route exactly so both produce identical cards.
  const WEEKLY_BULK_THRESHOLD = 3;
  if (applied > 0) {
    const sortedWeeks = [...new Set(appliedChanges.map((c) => c.weekNumber))].sort(
      (a, b) => a - b,
    );

    if (sortedWeeks.length >= WEEKLY_BULK_THRESHOLD) {
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
        snapshot: {
          applied,
          failed,
          weeks: sortedWeeks,
          // Per-row target (explicit weeklyTargets[week] ?? flat qtdGoal/13) so
          // the Bulk card shows the same Target column as the Weekly card.
          rows: appliedChanges.map((c) => ({
            ...c,
            target: weeklyTargetForWeek(
              { weeklyTargets: kpi.weeklyTargets as Record<string, number> | null, qtdGoal: kpi.qtdGoal, target: kpi.target },
              c.weekNumber,
            ),
          })),
        },
        ...requestContext(req),
      });
    } else {
      // Fetch the prior-week value for each changed row (for the card's
      // "Δ from prior" display), mirroring the single-week route. One query
      // for the at-most-two prior weeks across the touched owners.
      const priorWeeks = [...new Set(appliedChanges.map((c) => c.weekNumber - 1))];
      const priorUserIds = [...new Set(appliedChanges.map((c) => c.userId))];
      const priorRows = await db.kPIWeeklyValue.findMany({
        where: { kpiId: params.id, weekNumber: { in: priorWeeks }, userId: { in: priorUserIds } },
        select: { userId: true, weekNumber: true, value: true },
      });
      const priorMap = new Map<string, number | null>(
        priorRows.map((r) => [`${r.userId ?? ""}:${r.weekNumber}`, r.value ?? null]),
      );

      for (const c of appliedChanges) {
        await audit.log({
          entityType: "KPI",
          entityId: params.id,
          action: "WEEKLY_UPDATE",
          actor: { userId, orgId, teamId: kpi.teamId },
          changes:
            c.oldValue !== c.newValue
              ? [{ fieldName: `week_${c.weekNumber}`, oldValue: c.oldValue, newValue: c.newValue }]
              : [],
          snapshot: {
            weekNumber: c.weekNumber,
            value: c.newValue,
            notes: c.note,
            userId: c.userId,
            previousValue: c.oldValue,
            priorWeekValue: priorMap.get(`${c.userId}:${c.weekNumber - 1}`) ?? null,
            // Per-week target as shown in the Updates tab: explicit
            // weeklyTargets[week] when configured, else the flat qtdGoal/13.
            weeklyTarget: weeklyTargetForWeek(
              { weeklyTargets: kpi.weeklyTargets as Record<string, number> | null, qtdGoal: kpi.qtdGoal, target: kpi.target },
              c.weekNumber,
            ),
          },
          ...requestContext(req),
        });
      }
    }
  }

  return NextResponse.json({
    success: true,
    data: { applied, failed, results },
  });
}, { fallbackErrorMessage: "Failed to batch-save weekly values" });
