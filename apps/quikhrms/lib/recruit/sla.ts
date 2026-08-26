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

export type SlaLevel = "green" | "amber" | "red";

interface SlaInput {
  createdAt: Date;
  status: string;
  jobLevelId: string | null;
  customSlaDays: number | null;
  slaPausedAt: Date | null;
  slaPausedDays: number;
}

/**
 * Business-day-aware SLA status. Age is measured in business days (weekends
 * + org holidays excluded), frozen at the hold instant while ReqOnHold, minus
 * every completed past hold — a hold is a business decision, not the
 * recruiter's delay, so held time must never count against them.
 */
export function computeRequisitionSla(
  r: SlaInput,
  slaDaysByLevel: Map<string, number>,
  holidayDates: Set<string>,
  now: Date,
): SlaLevel | null {
  const slaDays = r.customSlaDays ?? (r.jobLevelId ? slaDaysByLevel.get(r.jobLevelId) ?? null : null);
  if (!slaDays) return null;
  const effectiveNow = r.status === "ReqOnHold" && r.slaPausedAt ? r.slaPausedAt : now;
  const age = Math.max(0, countBusinessDays(r.createdAt, effectiveNow, holidayDates) - r.slaPausedDays);
  const utilization = age / slaDays;
  return utilization <= 0.66 ? "green" : utilization <= 1 ? "amber" : "red";
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
}
