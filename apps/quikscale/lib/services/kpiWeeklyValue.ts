import { db } from "@/lib/db";

/**
 * Shared KPI weekly-value write + recompute. Extracted from
 * `app/api/kpi/[id]/weekly/route.ts` so the user-facing route AND the
 * service-to-service automation endpoint
 * (`app/api/internal/actions/enter-kpi-value`) run the EXACT same aggregation
 * — a weekly value entered by an automation impacts the KPI identically to one
 * a human enters (no drift in progress % / RAG).
 *
 * IMPORTANT: `healthStatus` / `progressPercent` / `qtdAchieved` are DERIVED here
 * from the summed weekly values — automation must never write them directly.
 */

/** Traffic-light health bucket from progress + lifecycle status. */
export function calcHealthStatus(progress: number, status: string): string {
  if (status === "completed") return "complete";
  if (progress >= 100) return "on-track";
  if (progress >= 80) return "behind-schedule";
  return "critical";
}

/**
 * Upsert a (kpiId, userId, weekNumber) weekly row + recompute that KPI's
 * aggregate progress. Used both for the primary write and for the linked
 * sync write (Team ↔ child Individual). No permission/log side-effects —
 * those run only on the primary path.
 */
export async function upsertAndRecalc(opts: {
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
