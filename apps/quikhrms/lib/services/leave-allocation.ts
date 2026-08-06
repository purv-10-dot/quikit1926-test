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
import type { GroupLeaveRules } from "@/lib/services/employee-leave-rules";

/**
 * Months remaining in `year` from `joinDate`. The join month counts only when
 * the join day is on/before `cutoffDay` — this is the "withhold leave for
 * late-month joiners" rule (default cut-off day 15).
 */
function proRataMonths(joinDate: Date, year: number, cutoffDay = 15): number {
  const joinYear = joinDate.getUTCFullYear();
  if (joinYear < year) return 12;
  if (joinYear > year) return 0;
  const month = joinDate.getUTCMonth();
  const day = joinDate.getUTCDate();
  const startMonth = day <= cutoffDay ? month : month + 1;
  return Math.max(0, 12 - startMonth);
}

/** Pro-rated annual entitlement, rounded to nearest 0.5 day. */
function proRataLeaveCount(annual: number, joinDate: Date, year: number, cutoffDay = 15): number {
  if (annual <= 0) return 0;
  const months = proRataMonths(joinDate, year, cutoffDay);
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
    select: { id: true, code: true, maxBalance: true, accrualType: true, noAccrualJoinAfterDay: true },
  });

  const allocated: AllocatedEntry[] = [];
  for (const t of types) {
    const annual = Number(t.maxBalance) || 0;
    if (annual <= 0) continue;
    // Monthly-accrual types start at 0 and build up via the accrual engine;
    // other types get their pro-rated annual entitlement up front. The join
    // month is withheld when the join day is past the type's cut-off.
    const cutoff = t.noAccrualJoinAfterDay ?? 15;
    const opening = t.accrualType === "Monthly" ? 0 : proRataLeaveCount(annual, dateOfJoining, year, cutoff);

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

/**
 * Pro-rata leave allocation driven by a Leave GROUP's rules.
 *
 * Being assigned to a Leave Group used to only create the assignment row —
 * never a LeaveBalance row — so the group's leave types never appeared for
 * the employee (the balances endpoint reads existing LeaveBalance rows, then
 * filters to the group's types; zero rows in ⇒ zero shown). This mirrors
 * `allocateProRataLeaveBalances` but sources the annual entitlement from the
 * GROUP ITEM's rule (`rules.maxBalance` / `rules.accrualType`) instead of the
 * LeaveType column — group quotas commonly live entirely in the rule, with
 * `LeaveType.maxBalance` left at 0. Falls back to the LeaveType column when a
 * rule doesn't override it. Idempotent per (employee, leaveType, year), same
 * as the join-time allocator.
 */
export async function allocateGroupLeaveBalances(params: {
  orgId: string;
  employeeId: string;
  leaveGroupId: string;
  dateOfJoining: Date;
  userId: string;
  year?: number;
}): Promise<{ year: number; allocated: AllocatedEntry[] }> {
  const { orgId, employeeId, leaveGroupId, dateOfJoining, userId } = params;
  const year = params.year ?? new Date().getUTCFullYear();

  const items = await prisma.leaveGroupItem.findMany({
    where: { orgId, leaveGroupId },
    select: {
      leaveTypeId: true,
      rules: true,
      leaveType: { select: { code: true, maxBalance: true, accrualType: true, noAccrualJoinAfterDay: true } },
    },
  });

  const allocated: AllocatedEntry[] = [];
  for (const it of items) {
    const rule = (it.rules && typeof it.rules === "object" ? it.rules : null) as GroupLeaveRules | null;

    const annual = typeof rule?.maxBalance === "number" ? rule.maxBalance : Number(it.leaveType.maxBalance) || 0;
    const accrualType = rule?.accrualType ?? it.leaveType.accrualType;
    const cutoff = rule?.noAccrualJoinAfterDay ?? it.leaveType.noAccrualJoinAfterDay ?? 15;
    // Unlimited / monthly-accrual types start at 0 (no fixed opening to pro-rate).
    const opening = rule?.isUnlimited || accrualType === "Monthly" || annual <= 0
      ? 0
      : proRataLeaveCount(annual, dateOfJoining, year, cutoff);

    const existing = await prisma.leaveBalance.findUnique({
      where: { orgId_employeeId_leaveTypeId_year: { orgId, employeeId, leaveTypeId: it.leaveTypeId, year } },
      select: { id: true },
    });
    if (existing) {
      allocated.push({ leaveTypeId: it.leaveTypeId, code: it.leaveType.code, annual, opening, created: false });
      continue;
    }

    await prisma.leaveBalance.create({
      data: {
        orgId, employeeId, leaveTypeId: it.leaveTypeId, year,
        opening, accrued: 0, taken: 0,
        createdBy: userId, updatedBy: userId,
      },
    });
    allocated.push({ leaveTypeId: it.leaveTypeId, code: it.leaveType.code, annual, opening, created: true });
  }

  return { year, allocated };
}
