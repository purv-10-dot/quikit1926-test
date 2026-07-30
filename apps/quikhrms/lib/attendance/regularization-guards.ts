import { prisma } from "@/lib/prisma";
import { attendanceDayStart } from "@/lib/attendance/day";

/** How far back a day may be regularized (in calendar days). */
export const MAX_REGULARIZE_BACKDATE_DAYS = 30;

/**
 * Extra guards for regularizing a past attendance day:
 *   • max backdate window — can't regularize very old days
 *   • payroll lock — a finalized (Approved/Paid) pay run covering the day locks it
 *
 * Returns a human-readable blocking reason, or null when the day may be regularized.
 * `day` must be the IST-bucketed day (attendanceDayStart of the date).
 */
export async function regularizationBlockReason(orgId: string, day: Date): Promise<string | null> {
  const today = attendanceDayStart();
  const oldest = new Date(today);
  oldest.setUTCDate(today.getUTCDate() - MAX_REGULARIZE_BACKDATE_DAYS);
  if (day < oldest) {
    return `Regularization is allowed only for the last ${MAX_REGULARIZE_BACKDATE_DAYS} days.`;
  }

  const lockedRun = await prisma.payRun.findFirst({
    where: {
      orgId,
      deletedAt: null,
      status: { in: ["Approved", "Paid"] },
      periodStart: { lte: day },
      periodEnd: { gte: day },
    },
    select: { id: true },
  });
  if (lockedRun) {
    return "Payroll for this period is already finalized — this day can no longer be regularized.";
  }

  return null;
}
