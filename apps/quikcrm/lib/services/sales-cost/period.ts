/**
 * Period math for Sales Cost Management.
 *
 * A "period" is one calendar month, identified by the string `YYYY-MM` on the
 * wire (e.g. "2026-08"). Every cost row in this module is effective-dated with
 * `effectiveFrom` INCLUSIVE and `effectiveTo` EXCLUSIVE, both normalised to the
 * first instant of a month in UTC. Normalising to UTC month boundaries is what
 * makes "was this cost active in August 2026?" a plain date comparison with no
 * timezone ambiguity — a salary is a monthly figure, so nothing here needs
 * sub-month or local-time precision.
 *
 * Half-open ranges are used throughout: a cost active for August only is
 * [2026-08-01, 2026-09-01). Overlap is therefore `aStart < bEnd && bStart < aEnd`
 * with no off-by-one at the boundary, and a null `effectiveTo` means "open
 * ended" rather than a sentinel date.
 */

/** Billing intervals a tool can be invoiced on. */
export const BILLING_FREQUENCIES = [
  "monthly",
  "quarterly",
  "annual",
  "one_time",
] as const;

export type BillingFrequency = (typeof BILLING_FREQUENCIES)[number];

export function isBillingFrequency(v: unknown): v is BillingFrequency {
  return typeof v === "string" && (BILLING_FREQUENCIES as readonly string[]).includes(v);
}

/** A resolved month window, half-open: [start, end). */
export interface Period {
  /** `YYYY-MM`. */
  key: string;
  /** First instant of the month, UTC. Inclusive. */
  start: Date;
  /** First instant of the NEXT month, UTC. Exclusive. */
  end: Date;
}

const PERIOD_RE = /^(\d{4})-(\d{2})$/;

/**
 * Parse a `YYYY-MM` key into a half-open UTC month window.
 * Returns null on anything malformed — callers surface that as a 400 rather
 * than silently falling back to the current month, so a typo in a report URL
 * can't be mistaken for real data.
 */
export function parsePeriod(key: unknown): Period | null {
  if (typeof key !== "string") return null;
  const m = PERIOD_RE.exec(key.trim());
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12
  if (month < 1 || month > 12) return null;
  // Guard against years that would overflow the Date range or be nonsensical
  // for a cost report.
  if (year < 2000 || year > 2100) return null;

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { key: `${m[1]}-${m[2]}`, start, end };
}

/** The `YYYY-MM` key for a Date, read in UTC. */
export function periodKeyOf(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** The current month's period, in UTC. */
export function currentPeriod(): Period {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { key: periodKeyOf(start), start, end };
}

/**
 * Snap an arbitrary date to the first instant of its month in UTC. Applied to
 * every `effectiveFrom` / `effectiveTo` on write so stored ranges always align
 * to month boundaries and the overlap checks stay exact.
 */
export function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** The first instant of the month AFTER the given date, UTC. */
export function startOfNextMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

/**
 * Does an effective-dated row overlap `period`?
 *
 * `from` is inclusive, `to` is exclusive and null means open-ended. Standard
 * half-open overlap test: the row covers part of the month iff it starts before
 * the month ends and ends after the month starts.
 */
export function overlapsPeriod(
  from: Date,
  to: Date | null | undefined,
  period: Period,
): boolean {
  if (from >= period.end) return false;
  if (to && to <= period.start) return false;
  return true;
}

/**
 * Do two effective-dated ranges overlap each other? Used to reject a new
 * salary row that would collide with an existing one, and to sum allocation
 * percentages only against rows that actually coexist.
 */
export function rangesOverlap(
  aFrom: Date,
  aTo: Date | null | undefined,
  bFrom: Date,
  bTo: Date | null | undefined,
): boolean {
  if (aTo && bFrom >= aTo) return false;
  if (bTo && aFrom >= bTo) return false;
  return true;
}

/** The shape every effective-dated row shares. */
export interface EffectiveDated {
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  /**
   * Insertion time, used only to break a tie between two versions with the same
   * `effectiveFrom`. Optional because pure-arithmetic callers pass literals
   * without it; the DB rows always have it.
   */
  createdAt?: Date;
}

/**
 * Pick the version of an effective-dated series that was in force during
 * `period`, or null when none covers it.
 *
 * Shared by salary and tool-price resolution so both answer "what did this cost
 * in August 2026?" identically. The version starting latest within the month
 * wins, matching the SQL `orderBy: { effectiveFrom: "desc" }, take: 1` used for
 * salaries. A tie on `effectiveFrom` is broken by the later `createdAt` — the
 * unique constraints make that case rare, but resolving it explicitly keeps the
 * result independent of the order rows come back in.
 *
 * Because a version's range is never edited in place — a price change closes the
 * old row and opens a new one — this function returns the same answer for a past
 * month no matter how many changes happened afterwards. That is the whole
 * historical-correctness guarantee.
 */
export function resolveVersionForPeriod<T extends EffectiveDated>(
  versions: readonly T[],
  period: Period,
): T | null {
  let best: T | null = null;
  for (const v of versions) {
    if (!overlapsPeriod(v.effectiveFrom, v.effectiveTo, period)) continue;
    if (!best) {
      best = v;
      continue;
    }
    if (v.effectiveFrom > best.effectiveFrom) {
      best = v;
    } else if (v.effectiveFrom.getTime() === best.effectiveFrom.getTime()) {
      // Same start month: prefer the row written later, treating a missing
      // createdAt as "oldest" so an explicit timestamp always wins.
      const vAt = v.createdAt?.getTime() ?? 0;
      const bestAt = best.createdAt?.getTime() ?? 0;
      if (vAt >= bestAt) best = v;
    }
  }
  return best;
}

/**
 * Convert a tool's invoice amount into a monthly figure.
 *
 * Annual and quarterly costs are amortised (/12, /3) so a yearly seat and a
 * monthly seat are comparable in one total. `one_time` returns 0: a one-off
 * purchase is not a recurring monthly cost, and spreading it across arbitrary
 * months would make cost-per-lead depend on an amortisation window nobody
 * chose. Such tools are still listed in the UI with their real cost, they just
 * don't inflate the monthly total.
 */
export function monthlyCostOf(cost: number, frequency: string): number {
  switch (frequency) {
    case "monthly":
      return cost;
    case "quarterly":
      return cost / 3;
    case "annual":
      return cost / 12;
    case "one_time":
      return 0;
    default:
      // Unknown frequency: treat as monthly rather than dropping the cost
      // silently. Validation rejects unknown values on write, so this only
      // guards rows written before a frequency was retired.
      return cost;
  }
}

/** Human label for a billing frequency, for the tools table. */
export const BILLING_FREQUENCY_LABEL: Record<BillingFrequency, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
  one_time: "One time",
};

/**
 * A rolling list of period options for the month picker: the current month and
 * the previous `count - 1` months, newest first.
 */
export function recentPeriods(count = 18): Array<{ key: string; label: string }> {
  const now = new Date();
  const out: Array<{ key: string; label: string }> = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({ key: periodKeyOf(d), label: formatPeriodLabel(d) });
  }
  return out;
}

/** "August 2026" for a month-start Date. */
export function formatPeriodLabel(d: Date): string {
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "August 2026" for a `YYYY-MM` key; falls back to the raw key if malformed. */
export function formatPeriodKey(key: string): string {
  const p = parsePeriod(key);
  return p ? formatPeriodLabel(p.start) : key;
}
