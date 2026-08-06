import { prisma } from "@/lib/prisma";

export type PayRunStatus = "Draft" | "Processing" | "Approved" | "Paid" | "Cancelled";

const TRANSITIONS: Record<PayRunStatus, PayRunStatus[]> = {
  Draft: ["Processing", "Cancelled"],
  Processing: ["Approved", "Draft", "Cancelled"], // Draft = recompute / reset
  Approved: ["Paid", "Processing", "Cancelled"], // Processing = re-approve path after edit
  Paid: [],
  Cancelled: [],
};

function canTransition(from: PayRunStatus, to: PayRunStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: PayRunStatus, to: PayRunStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid pay run transition: ${from} → ${to}`);
  }
}

/**
 * Ensure minimum payroll setup is done before running payroll.
 * Requires steps 1–6 complete (prior payroll is optional).
 *
 * Uses computeSetupProgress (data-derived) instead of the cached
 * PayrollSettings flags. The flags can lag behind reality (e.g. user
 * filled EPF/ESI/PT but never explicitly marked the step complete).
 * Statutory now requires only EPF + ESI + PT — LWF/Bonus/State Min Wage are optional.
 */
export async function assertPayrollReady(orgId: string): Promise<void> {
  const { computeSetupProgress } = await import("./payroll");
  const progress = await computeSetupProgress(orgId);
  const requiredKeys: Array<{ key: keyof typeof progress.steps; label: string }> = [
    { key: "orgDetails", label: "Organisation Details" },
    { key: "taxDetails", label: "Tax Details" },
    { key: "paySchedule", label: "Pay Schedule" },
    { key: "statutoryComponents", label: "Statutory Components (EPF, ESI, PT)" },
    { key: "salaryComponents", label: "Salary Components" },
    { key: "employees", label: "Employees" },
  ];
  const missing = requiredKeys.filter(({ key }) => !progress.steps[key].completed).map(({ label }) => label);
  if (missing.length > 0) {
    throw new Error(`Complete payroll setup first. Pending: ${missing.join(", ")}`);
  }
}

/**
 * Check for an existing pay run whose period overlaps the given range.
 * Ignores Cancelled runs and soft-deleted runs. Excludes the given run id when provided.
 */
export async function findOverlappingRun(
  orgId: string,
  periodStart: Date,
  periodEnd: Date,
  excludeRunId?: string,
) {
  return prisma.payRun.findFirst({
    where: {
      orgId,
      deletedAt: null,
      status: { not: "Cancelled" },
      ...(excludeRunId ? { id: { not: excludeRunId } } : {}),
      AND: [{ periodStart: { lte: periodEnd } }, { periodEnd: { gte: periodStart } }],
    },
    select: { id: true, periodStart: true, periodEnd: true, status: true },
  });
}

const DAY_MAP: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

function isWorkingDay(date: Date, workWeek: string[]): boolean {
  return workWeek.includes(DAY_MAP[date.getDay()]);
}

/**
 * Auto-suggest pay date from the tenant's PaySchedule config.
 * Shifts backward if target falls on non-working day (avoid paying late).
 */
export async function suggestPayDate(orgId: string, periodEnd: Date): Promise<Date> {
  const schedule = await prisma.paySchedule.findUnique({ where: { orgId } });
  if (!schedule) return periodEnd;

  const year = periodEnd.getFullYear();
  const month = periodEnd.getMonth();
  const workWeek = schedule.workWeek as string[];

  let target: Date;
  if (schedule.payDayType === "LastWorkingDay") {
    target = new Date(year, month + 1, 0); // last day of month
  } else {
    const lastDay = new Date(year, month + 1, 0).getDate();
    const day = Math.min(schedule.payDayOfMonth ?? lastDay, lastDay);
    target = new Date(year, month, day);
  }

  if (workWeek.length > 0) {
    let guard = 0;
    while (!isWorkingDay(target, workWeek) && guard++ < 10) {
      target.setDate(target.getDate() - 1);
    }
  }

  return target;
}
