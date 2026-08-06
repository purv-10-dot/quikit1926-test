/**
 * Leave accrual + year-end carry-forward engine.
 *
 * Two operations, both safe to re-run (idempotent):
 *  • runMonthlyAccrual  — credits one month of leave for every Monthly-accrual
 *    leave type. Skips the join month for late joiners (per the type's
 *    `noAccrualJoinAfterDay` "withhold" rule) and never lets the yearly total
 *    exceed the type's `maxBalance`. Guarded per (balance, month) via
 *    `lastAccrualYm` so running twice in a month is a no-op.
 *  • runYearEndCarryForward — at the turn of the year, rolls each employee's
 *    unused balance into the next year (up to `maxCarryForward` when the type
 *    allows carry-forward, otherwise the remainder lapses). Guarded per row via
 *    `carryProcessed`.
 */
import { prisma } from "@/lib/prisma";

const SYS = "system-accrual";
const ym = (d: Date): number => d.getUTCFullYear() * 100 + (d.getUTCMonth() + 1);

export interface MonthlyAccrualResult { rows: number; creditedDays: number }

export async function runMonthlyAccrual(asOf: Date = new Date()): Promise<MonthlyAccrualResult> {
  const year = asOf.getUTCFullYear();
  const period = ym(asOf);
  let rows = 0;
  let creditedDays = 0;

  const types = await prisma.leaveType.findMany({
    where: { deletedAt: null, accrualType: "Monthly" },
    select: { id: true, orgId: true, maxBalance: true, accrualCount: true, noAccrualJoinAfterDay: true },
  });

  for (const t of types) {
    const perMonth = Number(t.accrualCount) > 0
      ? Number(t.accrualCount)
      : (Number(t.maxBalance) > 0 ? Number(t.maxBalance) / 12 : 0);
    if (perMonth <= 0) continue;
    const annualCap = Number(t.maxBalance) || 0;

    const employees = await prisma.employee.findMany({
      where: { orgId: t.orgId, deletedAt: null, status: "Active", dateOfJoining: { lte: asOf } },
      select: { id: true, dateOfJoining: true },
    });

    for (const e of employees) {
      if (!e.dateOfJoining) continue;
      const joinPeriod = ym(e.dateOfJoining);
      if (joinPeriod > period) continue; // joins in a future month — nothing to accrue yet
      // Withhold: joined THIS month after the cut-off day → no credit for the join month.
      if (joinPeriod === period && t.noAccrualJoinAfterDay != null
        && e.dateOfJoining.getUTCDate() > t.noAccrualJoinAfterDay) continue;

      const bal = await prisma.leaveBalance.upsert({
        where: { orgId_employeeId_leaveTypeId_year: { orgId: t.orgId, employeeId: e.id, leaveTypeId: t.id, year } },
        create: { orgId: t.orgId, employeeId: e.id, leaveTypeId: t.id, year, createdBy: SYS, updatedBy: SYS },
        update: {},
        select: { id: true, opening: true, accrued: true, carriedForward: true, lastAccrualYm: true },
      });
      if (bal.lastAccrualYm != null && bal.lastAccrualYm >= period) continue; // already accrued this month

      const have = Number(bal.opening) + Number(bal.accrued) + Number(bal.carriedForward);
      const room = annualCap > 0 ? Math.max(0, annualCap - have) : perMonth;
      const credit = Math.round(Math.min(perMonth, room) * 100) / 100;

      await prisma.leaveBalance.update({
        where: { id: bal.id },
        data: { accrued: { increment: credit }, lastAccrualYm: period, updatedBy: SYS },
      });
      rows++;
      creditedDays += credit;
    }
  }
  return { rows, creditedDays };
}

export interface CarryForwardResult { processed: number; carried: number; lapsed: number }

export async function runYearEndCarryForward(fromYear: number): Promise<CarryForwardResult> {
  let processed = 0;
  let carried = 0;
  let lapsedTotal = 0;

  const balances = await prisma.leaveBalance.findMany({
    where: { year: fromYear, carryProcessed: false },
    include: { leaveType: { select: { isCarryForward: true, maxCarryForward: true } } },
  });

  for (const b of balances) {
    const available =
      Number(b.opening) + Number(b.accrued) + Number(b.carriedForward) + Number(b.adjusted)
      - Number(b.taken) - Number(b.encashed) - Number(b.lapsed);

    let carry = 0;
    let lapse = 0;
    if (available > 0) {
      if (b.leaveType.isCarryForward) {
        const cap = b.leaveType.maxCarryForward != null ? Number(b.leaveType.maxCarryForward) : available;
        carry = Math.round(Math.min(available, cap) * 100) / 100;
        lapse = Math.round((available - carry) * 100) / 100;
      } else {
        lapse = Math.round(available * 100) / 100;
      }
    }

    await prisma.$transaction([
      prisma.leaveBalance.update({
        where: { id: b.id },
        data: { lapsed: { increment: lapse }, carryProcessed: true, updatedBy: SYS },
      }),
      ...(carry > 0
        ? [prisma.leaveBalance.upsert({
            where: { orgId_employeeId_leaveTypeId_year: { orgId: b.orgId, employeeId: b.employeeId, leaveTypeId: b.leaveTypeId, year: fromYear + 1 } },
            create: { orgId: b.orgId, employeeId: b.employeeId, leaveTypeId: b.leaveTypeId, year: fromYear + 1, carriedForward: carry, createdBy: SYS, updatedBy: SYS },
            update: { carriedForward: { increment: carry }, updatedBy: SYS },
          })]
        : []),
    ]);

    processed++;
    carried += carry;
    lapsedTotal += lapse;
  }
  return { processed, carried, lapsed: lapsedTotal };
}
