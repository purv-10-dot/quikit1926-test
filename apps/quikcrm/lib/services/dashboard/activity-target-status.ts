/**
 * Pure attainment math for the Activity Targets feature — shared by the
 * per-salesperson dashboard indicator and the admin tracker so the
 * green/yellow/red thresholds live in exactly one place.
 *
 * Status (based on completion %):
 *   green  = >= 100%   (target achieved)
 *   yellow = 80–99%
 *   red    = < 80%     (below target)
 *
 * When the target is 0 (feature effectively off for that user) we treat any
 * count as "achieved" so a 0-target user is never flagged red.
 */

export type ActivityTargetStatus = "green" | "yellow" | "red";

export interface ActivityTargetAttainment {
  target: number;
  actual: number;
  remaining: number;
  completionPct: number;
  status: ActivityTargetStatus;
}

export function computeAttainment(target: number, actual: number): ActivityTargetAttainment {
  const safeTarget = Math.max(0, Math.floor(target));
  const safeActual = Math.max(0, Math.floor(actual));

  if (safeTarget === 0) {
    return { target: 0, actual: safeActual, remaining: 0, completionPct: 100, status: "green" };
  }

  const completionPct = Math.round((safeActual / safeTarget) * 100);
  const remaining = Math.max(0, safeTarget - safeActual);
  const status: ActivityTargetStatus =
    completionPct >= 100 ? "green" : completionPct >= 80 ? "yellow" : "red";

  return { target: safeTarget, actual: safeActual, remaining, completionPct, status };
}
