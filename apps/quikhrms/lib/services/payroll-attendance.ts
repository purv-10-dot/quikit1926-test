import { prisma } from "@/lib/prisma";

export interface EffectiveDays {
  workingDays: number;      // days in period (or org-configured working days)
  effectiveDays: number;    // working days adjusted for mid-month join/exit
  lopDays: number;          // loss of pay days from attendance + unpaid leave
  paidDays: number;         // effectiveDays - lopDays, floored at 0
  reason: string;           // audit trail: "Mid-month joining" etc.
}

function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)) + 1);
}

function clampDate(d: Date, min: Date, max: Date): Date {
  if (d.getTime() < min.getTime()) return min;
  if (d.getTime() > max.getTime()) return max;
  return d;
}

/**
 * Count LOP (loss of pay) days per employee across a pay period.
 * Sources:
 *   1) AttendanceRecord with status=Absent and no approved regularization
 *   2) Approved LeaveRequest rows whose leaveType.isPaid=false, clipped to period overlap
 * Returns Map<employeeId, lopDays>.
 */
export async function getEmployeeLopDays(
  orgId: string,
  periodStart: Date,
  periodEnd: Date,
  employeeIds?: string[],
): Promise<Map<string, number>> {
  const lop = new Map<string, number>();
  const add = (empId: string, days: number) => {
    if (days <= 0) return;
    lop.set(empId, (lop.get(empId) ?? 0) + days);
  };

  const empFilter = employeeIds?.length ? { in: employeeIds } : undefined;

  const absentRecords = await prisma.attendanceRecord.findMany({
    where: {
      orgId,
      deletedAt: null,
      date: { gte: periodStart, lte: periodEnd },
      status: "Absent",
      regularizationStatus: { not: "Approved" },
      ...(empFilter ? { employeeId: empFilter } : {}),
    },
    select: { employeeId: true },
  });
  for (const r of absentRecords) add(r.employeeId, 1);

  const unpaidLeaves = await prisma.leaveRequest.findMany({
    where: {
      orgId,
      deletedAt: null,
      status: "Approved",
      startDate: { lte: periodEnd },
      endDate: { gte: periodStart },
      leaveType: { isPaid: false },
      ...(empFilter ? { employeeId: empFilter } : {}),
    },
    select: {
      employeeId: true,
      startDate: true,
      endDate: true,
      duration: true,
    },
  });

  for (const lv of unpaidLeaves) {
    const overlapStart = clampDate(lv.startDate, periodStart, periodEnd);
    const overlapEnd = clampDate(lv.endDate, periodStart, periodEnd);
    const overlapDays = daysBetween(overlapStart, overlapEnd);
    const spanDays = daysBetween(lv.startDate, lv.endDate);
    const duration = Number(lv.duration);

    // Pro-rate duration (handles half-day, partial overlap with period edges)
    const days = spanDays > 0 ? (duration * overlapDays) / spanDays : overlapDays;
    add(lv.employeeId, days);
  }

  return lop;
}

/**
 * Compute the effective paid days for an employee in a period, accounting for:
 *   - mid-month joining (dateOfJoining inside period)
 *   - mid-month exit (lastWorkingDate inside period, or employee.status != Active)
 *   - LOP days from attendance/unpaid leaves
 */
export function computeEffectiveDays(params: {
  periodStart: Date;
  periodEnd: Date;
  workingDays: number; // days for calc — either actual days or org working days
  dateOfJoining?: Date | null;
  lastWorkingDate?: Date | null;
  lopDays: number;
}): EffectiveDays {
  const { periodStart, periodEnd, workingDays, dateOfJoining, lastWorkingDate, lopDays } = params;

  const totalCalendarDays = daysBetween(periodStart, periodEnd);
  let effectiveStart = periodStart;
  let effectiveEnd = periodEnd;
  let reason = "";

  if (dateOfJoining && dateOfJoining > periodStart && dateOfJoining <= periodEnd) {
    effectiveStart = dateOfJoining;
    reason = "Mid-month joining";
  }

  if (lastWorkingDate && lastWorkingDate >= periodStart && lastWorkingDate < periodEnd) {
    effectiveEnd = lastWorkingDate;
    reason = reason ? `${reason} + mid-month exit` : "Mid-month exit";
  }

  const activeDays = daysBetween(effectiveStart, effectiveEnd);
  const ratio = totalCalendarDays > 0 ? activeDays / totalCalendarDays : 0;
  const effectiveDays = Math.round(workingDays * ratio * 100) / 100;
  const paidDays = Math.max(0, Math.round((effectiveDays - lopDays) * 100) / 100);

  return { workingDays, effectiveDays, lopDays, paidDays, reason };
}
