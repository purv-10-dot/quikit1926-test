/**
 * OPSP threshold + banner logic — pure helpers used by `/api/opsp/deadline`.
 *
 * Two banners are driven from the same FeatureFlag table:
 *   - `opsp_threshold_days`        → finalize warning (Mode A or Mode B)
 *   - `opsp_review_threshold_days` → review reminder (no cutoff)
 *
 * See OPSP_THRESHOLD_LOGIC.md for the full spec.
 *
 * All math runs in UTC to match the rest of `lib/utils/quarterGen.ts`.
 */

import { addDays, diffDays } from "./quarterGen";

/* ─────────────────── value parsing ─────────────────── */

/**
 * Returns the threshold days for a FeatureFlag row, or `null` if it should be
 * treated as "not explicitly configured" (silence the banner).
 *
 * Strict per spec — only returns a number when:
 *   - the flag exists
 *   - `enabled === true`
 *   - `value` is a non-empty string that parses to a finite number `>= 0`
 *
 * Returns `null` for: missing row, `enabled === false`, null/undefined/empty
 * value, whitespace-only, non-numeric, NaN, Infinity, negative numbers.
 *
 * Zero IS allowed — `0` means "warn immediately". Document this if the UI
 * exposes the field to admins.
 */
export function parseExplicitThresholdDays(
  flag: { enabled: boolean; value: string | null } | null | undefined,
): number | null {
  if (!flag || !flag.enabled) return null;
  const raw = flag.value;
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/* ─────────────────── settings-input validation ─────────────────── */

/**
 * Validate a threshold value typed in the Settings → Configurations cards
 * (OPSP finalize + OPSP review). Pure so it can be unit-tested and shared by
 * both cards.
 *
 * The threshold is a lead-time window measured backwards from the quarter END
 * date, so it can never be larger than the days remaining in the current
 * quarter (otherwise the reminder window would open in the past).
 *
 *   - "" / whitespace        → ok (clears the value; silences the banner)
 *   - non-integer / < 0      → error
 *   - > daysLeft (when known) → error
 *   - daysLeft === null      → no upper cap (no active quarter resolved)
 */
export function validateThresholdInput(
  value: string,
  daysLeft: number | null,
): { ok: boolean; error?: string } {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return { ok: true };

  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 0) {
    return { ok: false, error: "Enter a whole number of days (0 or more)." };
  }
  if (daysLeft !== null && n > daysLeft) {
    return {
      ok: false,
      error: `Can't exceed ${daysLeft} day${daysLeft === 1 ? "" : "s"} — the days left in the current quarter.`,
    };
  }
  return { ok: true };
}

/* ─────────────────── date helpers ─────────────────── */

/** Clone `d` set to `00:00:00.000` UTC. */
export function startOfDayUTC(d: Date): Date {
  const out = new Date(d.getTime());
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

/** Clone `d` set to `23:59:59.999` UTC. */
export function endOfDayUTC(d: Date): Date {
  const out = new Date(d.getTime());
  out.setUTCHours(23, 59, 59, 999);
  return out;
}

/* ─────────────────── synthetic quarter end ─────────────────── */

/**
 * Calendar quarter-end fallback used by the Review reminder when no
 * `QuarterSetting` row matches the OPSP's (year, quarter).
 *
 * Anchored on the OPSP's `year` field — NOT on `getFiscalYear()`. Per spec,
 * this avoids "Mar 31 vs Jul 2" drift on tenants whose fiscal year doesn't
 * align with Jan-Dec.
 *
 * Returns UTC end-of-day for the calendar quarter:
 *   Q1 → Mar 31, Q2 → Jun 30, Q3 → Sep 30, Q4 → Dec 31.
 */
export function getSyntheticCalendarQuarterEnd(
  year: number,
  quarter: string,
): Date {
  // (month index, day) tuples for calendar quarter ends.
  const map: Record<string, [number, number]> = {
    Q1: [2, 31], // Mar
    Q2: [5, 30], // Jun
    Q3: [8, 30], // Sep
    Q4: [11, 31], // Dec
  };
  const [m, d] = map[quarter] ?? map.Q4;
  return new Date(Date.UTC(year, m, d, 23, 59, 59, 999));
}

/* ─────────────────── period label ─────────────────── */

/**
 * Render a human period string for banner copy.
 *
 *   resolvePeriodLabel(2025, "Q1")   → "Q1 2025"
 *   resolvePeriodLabel(null, "Q1")   → "Q1"
 *   resolvePeriodLabel(2025, null)   → "2025"
 *   resolvePeriodLabel(null, null)   → "current OPSP"
 */
export function resolvePeriodLabel(
  year: number | null | undefined,
  quarter: string | null | undefined,
): string {
  const q = (quarter ?? "").trim();
  if (q && year != null) return `${q} ${year}`;
  if (q) return q;
  if (year != null) return String(year);
  return "current OPSP";
}

/* ─────────────────── message builders ─────────────────── */

export interface FinalizeModeBResult {
  show: true;
  /** Negative when overdue (quarter end has passed). */
  daysLeft: number;
  message: string;
}

/**
 * Mode B finalize message — anchored on quarter end.
 *
 * Triggers when Mode A doesn't apply (no `documentCreatedAt`, OR
 * `FinalizeValue` not explicitly set). Uses a default of 5 days when the
 * threshold is missing (legacy compatibility).
 *
 *   warningStart = quarterEnd - daysOrDefault @ 00:00:00 UTC
 *
 * Returns `null` when the warning window hasn't opened yet (`now < warningStart`).
 * Otherwise returns one of two messages:
 *
 *   daysLeft >= 0 → "{period} is not finalized. {daysLeft} days left before
 *                    quarter closes. Please finalize."
 *   daysLeft <  0 → "{period} is overdue and not finalized. Please finalize now."
 *
 * Mode B does NOT auto-finalize. The overdue message stays visible until the
 * user finalizes manually.
 */
export function buildFinalizeMessageModeB(opts: {
  now: Date;
  quarterEnd: Date;
  daysOrDefault: number;
  period: string;
}): FinalizeModeBResult | null {
  const { now, quarterEnd, daysOrDefault, period } = opts;
  const warningStart = startOfDayUTC(addDays(quarterEnd, -daysOrDefault));
  if (now.getTime() < warningStart.getTime()) return null;

  const today = startOfDayUTC(now);
  const qEndStart = startOfDayUTC(quarterEnd);
  const daysLeft = diffDays(today, qEndStart);

  if (daysLeft < 0) {
    return {
      show: true,
      daysLeft,
      message: `${period} is overdue and not finalized. Please finalize now.`,
    };
  }
  return {
    show: true,
    daysLeft,
    message: `${period} is not finalized. ${daysLeft} day${daysLeft === 1 ? "" : "s"} left before quarter closes. Please finalize.`,
  };
}

export interface ReviewReminderResult {
  show: true;
  /** Negative when overdue (quarter has ended). */
  daysUntilQuarterEnd: number;
  isOverdue: boolean;
  message: string;
}

/**
 * Review reminder message — anchored on quarter end.
 *
 *   warningStart = quarterEnd - reviewDays @ 00:00:00 UTC
 *
 * Returns `null` when the warning window hasn't opened. Otherwise returns:
 *
 *   daysUntilQuarterEnd >= 0 →
 *     "OPSP review ({period}): {N} days left until quarter end. Please submit your review."
 *   daysUntilQuarterEnd <  0 →
 *     "OPSP review ({period}): {N} days overdue (quarter ended {date}). Please submit your review now."
 *
 * Unlike the Finalize banner, this banner has NO cutoff — once overdue, it
 * stays visible (with the overdue message) until the user submits the review.
 */
export function buildOpspReviewReminderMessage(opts: {
  now: Date;
  quarterEnd: Date;
  reviewDays: number;
  period: string;
}): ReviewReminderResult | null {
  const { now, quarterEnd, reviewDays, period } = opts;
  const warningStart = startOfDayUTC(addDays(quarterEnd, -reviewDays));
  if (now.getTime() < warningStart.getTime()) return null;

  const today = startOfDayUTC(now);
  const qEndStart = startOfDayUTC(quarterEnd);
  const daysUntilQuarterEnd = diffDays(today, qEndStart);

  if (daysUntilQuarterEnd < 0) {
    const overdueBy = Math.abs(daysUntilQuarterEnd);
    const endStr = quarterEnd.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
    return {
      show: true,
      daysUntilQuarterEnd,
      isOverdue: true,
      message: `OPSP review (${period}): ${overdueBy} day${overdueBy === 1 ? "" : "s"} overdue (quarter ended ${endStr}). Please submit your review now.`,
    };
  }
  return {
    show: true,
    daysUntilQuarterEnd,
    isOverdue: false,
    message: `OPSP review (${period}): ${daysUntilQuarterEnd} day${daysUntilQuarterEnd === 1 ? "" : "s"} left until quarter end. Please submit your review.`,
  };
}
