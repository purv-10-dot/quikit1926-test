import { prisma } from "@/lib/prisma";

/** Calendar days between two dates (fractional) — used where sub-day precision matters (e.g. "just paused an hour ago"). */
export function daysBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / 86_400_000);
}

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Whole business days strictly between `a` and `b` — weekends and org
 * holidays excluded. A hold/SLA/TAT clock measured this way doesn't
 * penalize a recruiter for a Saturday or a declared holiday.
 */
export function countBusinessDays(a: Date, b: Date, holidayDates: Set<string>): number {
  if (b <= a) return 0;
  let count = 0;
  const cur = new Date(a);
  cur.setUTCHours(0, 0, 0, 0);
  const end = new Date(b);
  end.setUTCHours(0, 0, 0, 0);
  while (cur < end) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    if (!isWeekend(cur) && !holidayDates.has(cur.toISOString().slice(0, 10))) count++;
  }
  return count;
}

/** Org holiday dates (as "YYYY-MM-DD" strings) in [from, to], for business-day exclusion. */
export async function getHolidayDateSet(orgId: string, from: Date, to: Date): Promise<Set<string>> {
  if (to <= from) return new Set();
  const rows = await prisma.companyHoliday.findMany({
    where: { orgId, deletedAt: null, date: { gte: from, lte: to } },
    select: { date: true },
  });
  return new Set(rows.map((r) => r.date.toISOString().slice(0, 10)));
}

// ─── Multi-Stage TAT (Turn-Around-Time) ─────────────────────────────────
// Replaces the old single-clock Green/Amber/Red requisition SLA with the
// org's Multi-Stage TAT formula: a separate clock per stage transition
// (Position Assigned → Offer Release, Sourced → Interview), plus an overall
// Deadline TAT (target-joining-date based, with original-vs-revised
// tracking). Calendar days, as specified — no business-day/holiday
// adjustment (unlike the Time-to-Fill/Time-to-Hire metrics above).

export type TatStatus = "IN_TAT" | "AT_RISK" | "MISSED";
export type DeadlineStatus = "ON_TRACK" | "AT_RISK" | "DEADLINE_MISSED";

export interface StageTatResult {
  status: TatStatus | null; // null = not rated (no SLA configured for this level/stage)
  actualTat: number | null; // set once the stage actually completed
  aging: number; // days elapsed so far (== actualTat once completed)
}

/**
 * One stage's TAT — e.g. Position Assigned → Offer Release, or
 * Sourced → Interview. `actualDate` is null while the stage hasn't
 * completed yet (offer not yet sent / no interview yet), in which case the
 * status is projected from how much of the SLA window has elapsed.
 *
 *   completed:      actualTat = actualDate - assignedDate
 *                   actualTat <= slaDays        → IN_TAT
 *                   else                        → MISSED
 *   not completed:  aging = now - assignedDate
 *                   aging <= slaDays * 0.75     → IN_TAT
 *                   aging <  slaDays            → AT_RISK
 *                   else                        → MISSED
 */
export function computeStageTat(
  assignedDate: Date | null,
  actualDate: Date | null,
  slaDays: number | null | undefined,
  now: Date,
): StageTatResult {
  if (!assignedDate || slaDays == null) return { status: null, actualTat: null, aging: 0 };
  if (actualDate) {
    const actualTat = Math.round(daysBetween(assignedDate, actualDate));
    return { status: actualTat <= slaDays ? "IN_TAT" : "MISSED", actualTat, aging: actualTat };
  }
  const aging = Math.round(daysBetween(assignedDate, now));
  const status: TatStatus = aging <= slaDays * 0.75 ? "IN_TAT" : aging < slaDays ? "AT_RISK" : "MISSED";
  return { status, actualTat: null, aging };
}

function dateOnly(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Overall requisition Deadline TAT — compares today against the ACTIVE
 * deadline (the live/current targetJoiningDate + etaToFillDays; if HR has
 * revised it since creation, this is the revised one — see
 * `originalTargetJoiningDate`/`originalEtaToFillDays`, which stay frozen).
 *
 *   today > deadline                        → DEADLINE_MISSED
 *   today == deadline                       → AT_RISK
 *   (deadline - today) <= activeSlaDays*25%  → AT_RISK
 *   else                                     → ON_TRACK
 */
export function computeDeadlineStatus(activeDeadline: Date, activeSlaDays: number, now: Date): DeadlineStatus {
  const today = dateOnly(now);
  const deadline = dateOnly(activeDeadline);
  if (today > deadline) return "DEADLINE_MISSED";
  if (today === deadline) return "AT_RISK";
  const daysLeft = Math.round((deadline - today) / 86_400_000);
  if (activeSlaDays > 0 && daysLeft <= activeSlaDays * 0.25) return "AT_RISK";
  return "ON_TRACK";
}

/** Was the ORIGINAL (never-revised) commitment also missed, independent of any later revision? */
export function computeOriginalDeadlineStatus(originalDeadline: Date, now: Date): "ON_TRACK" | "MISSED" {
  return dateOnly(now) > dateOnly(originalDeadline) ? "MISSED" : "ON_TRACK";
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
}
