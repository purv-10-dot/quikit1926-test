import { prisma } from "@/lib/prisma";
import type { Prisma, TdsPeriodStatus } from "@quikit/database";

/**
 * Compute the TDS liability for a single (year, month) period for a tenant by
 * scanning the released payslips whose periodStart falls inside that month.
 *
 * Sums the `IncomeTax` category lines across those payslips.
 *
 * Idempotent — upserts the `TdsLiabilityPeriod` row, recomputes derived status
 * from the matched allocations, and refreshes `lastComputedAt`.
 */
export async function refreshLiabilityForPeriod(
  orgId: string,
  year: number,
  month: number, // 1-12
  natureOfPayment: string = "92B",
): Promise<{ id: string; totalDeducted: number; status: TdsPeriodStatus }> {
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 0)); // last day of the month

  // Pull payslips covering this period — include Released first; fall back to
  // Generated so an in-progress run still shows the right liability number.
  const payslips = await prisma.payslip.findMany({
    where: {
      orgId,
      deletedAt: null,
      status: { in: ["Released", "Generated"] },
      periodStart: { gte: periodStart, lte: periodEnd },
    },
    include: {
      lines: { where: { category: "IncomeTax" } },
    },
  });

  const totalDeducted = payslips.reduce((sum, ps) => {
    const tds = ps.lines.reduce((s, l) => s + Number(l.amount), 0);
    return sum + tds;
  }, 0);
  const employeeCount = payslips.length;
  const payslipIds = payslips.map((p) => p.id);

  // Due date: 7th of (month + 1). For Mar → 30th Apr.
  const dueDate = (() => {
    if (month === 3) return new Date(Date.UTC(year, 3, 30)); // 30 Apr
    const m = month % 12;
    const y = month === 12 ? year + 1 : year;
    return new Date(Date.UTC(y, m, 7));
  })();

  // Upsert period row first (without status — status depends on allocations).
  const upserted = await prisma.tdsLiabilityPeriod.upsert({
    where: {
      orgId_periodYear_periodMonth_natureOfPayment: {
        orgId, periodYear: year, periodMonth: month, natureOfPayment,
      },
    },
    create: {
      orgId,
      periodYear: year,
      periodMonth: month,
      natureOfPayment,
      totalDeducted,
      totalAllocated: 0,
      employeeCount,
      payslipIds: payslipIds as Prisma.InputJsonValue,
      dueDate,
      status: "Pending",
      lastComputedAt: new Date(),
    },
    update: {
      totalDeducted,
      employeeCount,
      payslipIds: payslipIds as Prisma.InputJsonValue,
      dueDate,
      lastComputedAt: new Date(),
    },
  });

  // Re-aggregate allocations so totalAllocated is in sync with reality.
  const allocAgg = await prisma.tdsChallanAllocation.aggregate({
    where: { liabilityPeriodId: upserted.id },
    _sum: { allocatedAmount: true },
  });
  const totalAllocated = Number(allocAgg._sum.allocatedAmount ?? 0);

  // Recompute status.
  const status = computeStatus({ totalDeducted, totalAllocated, dueDate });

  const final = await prisma.tdsLiabilityPeriod.update({
    where: { id: upserted.id },
    data: { totalAllocated, status },
  });

  return {
    id: final.id,
    totalDeducted: Number(final.totalDeducted),
    status: final.status,
  };
}

/** Same as above but inferred from a pay run's periodStart. */
export async function refreshLiabilityForPayRun(orgId: string, payRunId: string): Promise<void> {
  const run = await prisma.payRun.findFirst({
    where: { id: payRunId, orgId, deletedAt: null },
    select: { periodStart: true },
  });
  if (!run) return;
  const d = run.periodStart;
  await refreshLiabilityForPeriod(orgId, d.getUTCFullYear(), d.getUTCMonth() + 1);
}

/**
 * Status derivation:
 *   Pending  — no allocation, due date hasn't passed
 *   Overdue  — no/partial allocation, due date passed
 *   Partial  — allocated > 0 but < deducted
 *   Paid     — allocated >= deducted (within 1 paisa tolerance)
 *   Excess   — allocated > deducted (only flagged if difference > 1 paisa)
 */
function computeStatus(args: {
  totalDeducted: number;
  totalAllocated: number;
  dueDate: Date;
}): TdsPeriodStatus {
  const { totalDeducted, totalAllocated, dueDate } = args;
  const TOL = 0.01;

  if (totalDeducted === 0 && totalAllocated === 0) {
    return Date.now() > dueDate.getTime() ? "Overdue" : "Pending";
  }
  if (totalAllocated > totalDeducted + TOL) return "Excess";
  if (Math.abs(totalAllocated - totalDeducted) <= TOL) return "Paid";
  if (totalAllocated > 0) {
    return Date.now() > dueDate.getTime() ? "Overdue" : "Partial";
  }
  return Date.now() > dueDate.getTime() ? "Overdue" : "Pending";
}

export interface ChallanFunding {
  allocatedAmount: number;
  challanId: string;
  cin: string;
  bsrCode: string;
  depositDate: Date;
  natureOfPayment: string;
}

/**
 * For each requested (year, month) period, return the list of challans that
 * funded it and how much each contributed. Used by the Form 24Q generator to
 * join deductees → challans (one Annexure I row per (deductee, period, challan)
 * tuple, TDS split proportionally across the challans for that period).
 *
 * Key in the returned map: `${year}-${month}-${natureOfPayment}`.
 * Missing key = the period has no allocations yet (deductees in that period
 * appear in 24Q with the "no challan / under-deposited" status).
 */
export async function getChallanFundingForPeriods(
  orgId: string,
  periods: { year: number; month: number; natureOfPayment?: string }[],
): Promise<Map<string, ChallanFunding[]>> {
  if (periods.length === 0) return new Map();

  // Fetch every TdsLiabilityPeriod in one query (one OR clause per period).
  const periodRows = await prisma.tdsLiabilityPeriod.findMany({
    where: {
      orgId,
      OR: periods.map((p) => ({
        periodYear: p.year,
        periodMonth: p.month,
        natureOfPayment: p.natureOfPayment ?? "92B",
      })),
    },
    include: {
      // Each allocation pulls its challan (skip soft-deleted challans).
      allocations: {
        where: { challan: { deletedAt: null } },
        include: {
          challan: {
            select: { id: true, cin: true, bsrCode: true, depositDate: true },
          },
        },
      },
    },
  });

  const out = new Map<string, ChallanFunding[]>();
  for (const p of periodRows) {
    const key = `${p.periodYear}-${p.periodMonth}-${p.natureOfPayment}`;
    out.set(key, p.allocations.map((a) => ({
      allocatedAmount: Number(a.allocatedAmount),
      challanId: a.challan.id,
      cin: a.challan.cin,
      bsrCode: a.challan.bsrCode,
      depositDate: a.challan.depositDate,
      natureOfPayment: p.natureOfPayment,
    })));
  }
  return out;
}

/**
 * Re-fan-out: refresh every liability period that a given challan touches.
 * Call this after creating/editing/deleting allocations on a challan so the
 * dashboard reflects accurate totals.
 */
export async function refreshLiabilityForChallan(orgId: string, challanId: string): Promise<void> {
  const allocs = await prisma.tdsChallanAllocation.findMany({
    where: { challanId },
    include: { period: { select: { periodYear: true, periodMonth: true, natureOfPayment: true } } },
  });
  const unique = new Map<string, { y: number; m: number; nop: string }>();
  for (const a of allocs) {
    const key = `${a.period.periodYear}-${a.period.periodMonth}-${a.period.natureOfPayment}`;
    unique.set(key, { y: a.period.periodYear, m: a.period.periodMonth, nop: a.period.natureOfPayment });
  }
  for (const v of unique.values()) {
    await refreshLiabilityForPeriod(orgId, v.y, v.m, v.nop);
  }
}
