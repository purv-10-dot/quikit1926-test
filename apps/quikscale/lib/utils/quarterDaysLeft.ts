/**
 * Resolve "how many days are left in the active quarter" for the Settings
 * threshold cards. Pure + unit-tested.
 *
 * Why this exists: `QuarterSetting.endDate` is stored at the START of the
 * quarter's final day (midnight). A naive `today <= endDate` check therefore
 * stops matching once the clock passes that midnight — i.e. on the final day
 * itself — so the threshold warning banners silently disappeared on the day the
 * quarter closes (0 days left). This helper treats the whole last day as still
 * in-quarter and reports days-left as a calendar-day count (0 on the last day),
 * matching the server-driven OPSP deadline banner.
 */

interface QuarterLike {
  startDate: string;
  endDate: string;
}

export interface ActiveQuarterDaysLeft {
  /** Whole calendar days from today to the quarter end — 0 on the final day. */
  daysLeft: number;
  /** Formatted end date, e.g. "5 Jul 2026". */
  endLabel: string;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function startOfDay(d: Date): Date {
  const out = new Date(d.getTime());
  out.setHours(0, 0, 0, 0);
  return out;
}

function endOfDay(d: Date): Date {
  const out = new Date(d.getTime());
  out.setHours(23, 59, 59, 999);
  return out;
}

/**
 * Find the quarter that contains `now` (inclusive of the whole final day) and
 * return its days-left + end label. Returns `null` when no configured quarter
 * is active (e.g. a gap between quarters, or none configured).
 */
export function resolveActiveQuarterDaysLeft(
  quarters: QuarterLike[] | null | undefined,
  now: Date,
): ActiveQuarterDaysLeft | null {
  if (!quarters || quarters.length === 0) return null;

  const todayStart = startOfDay(now);

  for (const q of quarters) {
    const start = new Date(q.startDate);
    const end = new Date(q.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

    // The whole last day counts as in-quarter (endDate is stored at midnight).
    if (now >= startOfDay(start) && now <= endOfDay(end)) {
      const daysLeft = Math.max(
        0,
        Math.round((startOfDay(end).getTime() - todayStart.getTime()) / MS_PER_DAY),
      );
      const endLabel = end.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      return { daysLeft, endLabel };
    }
  }

  return null;
}
