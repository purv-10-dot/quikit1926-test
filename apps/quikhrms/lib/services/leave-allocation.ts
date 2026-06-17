/**
 * Pro-rata leave allocation for new joiners.
 *
 * Leave year = Jan 1 → Dec 31. An employee joining mid-year gets a
 * proportional share of each LeaveType.maxBalance based on the number of
 * months remaining in the join year. The join month counts as a full month
 * when the join date is on or before the 15th, otherwise it's excluded.
 *
 * Allocation is idempotent: re-running the helper for the same
 * (tenant, employee, leaveType, year) leaves an existing LeaveBalance row
 * untouched. Resulting opening is rounded to the nearest 0.5 day.
 */
import { prisma } from "@/lib/prisma";

/** Months remaining in `year` from `joinDate` (join month counted if day ≤ 15). */
export function proRataMonths(joinDate: Date, year: number): number {
  const joinYear = joinDate.getUTCFullYear();
  if (joinYear < year) return 12;
  if (joinYear > year) return 0;
  const month = joinDate.getUTCMonth();
  const day = joinDate.getUTCDate();
  const startMonth = day <= 15 ? month : month + 1;
  return Math.max(0, 12 - startMonth);
}

/** Pro-rated annual entitlement, rounded to nearest 0.5 day. */
export function proRataLeaveCount(annual: number, joinDate: Date, year: number): number {
  if (annual <= 0) return 0;
  const months = proRataMonths(joinDate, year);
  return Math.round((annual * months / 12) * 2) / 2;
}

export interface AllocateParams {
  orgId: string;
  employeeId: string;
  dateOfJoining: Date;
  userId: string;
  /** Defaults to the join year. */
  year?: number;
}

export interface AllocatedEntry {
  leaveTypeId: string;
  code: string;
  annual: number;
  opening: number;
  created: boolean;
}

export async function allocateProRataLeaveBalances(
  params: AllocateParams,
): Promise<{ year: number; allocated: AllocatedEntry[] }> {
  const { orgId, employeeId, dateOfJoining, userId } = params;
  const year = params.year ?? dateOfJoining.getUTCFullYear();

  const types = await prisma.leaveType.findMany({
    where: { orgId, deletedAt: null },
    select: { id: true, code: true, maxBalance: true },
  });

  const allocated: AllocatedEntry[] = [];
  for (const t of types) {
    const annual = Number(t.maxBalance) || 0;
    if (annual <= 0) continue;
    const opening = proRataLeaveCount(annual, dateOfJoining, year);

    const existing = await prisma.leaveBalance.findUnique({
      where: {
        orgId_employeeId_leaveTypeId_year: {
          orgId, employeeId, leaveTypeId: t.id, year,
        },
      },
      select: { id: true },
    });

    if (existing) {
      allocated.push({ leaveTypeId: t.id, code: t.code, annual, opening, created: false });
      continue;
    }

    await prisma.leaveBalance.create({
      data: {
        orgId, employeeId, leaveTypeId: t.id, year,
        opening, accrued: 0, taken: 0,
        createdBy: userId, updatedBy: userId,
      },
    });
    allocated.push({ leaveTypeId: t.id, code: t.code, annual, opening, created: true });
  }

  return { year, allocated };
}
