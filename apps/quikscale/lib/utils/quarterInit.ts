/**
 * Pure derivation of the "Initialize Quarters" modal defaults.
 *
 * Extracted from QuarterSettingsPage's GenerateModal so the FY / start-date
 * resolution is unit-testable in isolation. This is what decides:
 *   - which fiscal year the modal pre-fills (`nextFY`)
 *   - the default + minimum FY start date the date input offers
 *
 * Regression context (Quarter Settings reload bug): when ALL quarters are
 * deleted, the page must pass `existingYears: []` and `latestEndDate: null`
 * here — otherwise `nextFY` jumps to the *following* FY and `minStart` locks
 * the date input past the just-deleted year, making it impossible to recreate
 * (e.g. delete FY 2026-27 → modal wrongly defaults to FY 2027-28). With fresh
 * post-delete inputs this resolves back to the current FY with no `minStart`.
 */
export interface QuarterInitDefaults {
  /** Fiscal year the modal pre-selects (lowest FY not already created). */
  nextFY: number;
  /** Default value for the FY-start date input (YYYY-MM-DD). */
  defaultStart: string;
  /** Earliest allowed start (YYYY-MM-DD) — contiguous with the latest existing FY; undefined when none exist. */
  minStart?: string;
  /** True when `nextFY` is beyond the current fiscal year (gates the future-FY feature flag). */
  isFutureFY: boolean;
}

/** Day after an ISO date, as YYYY-MM-DD (UTC) — mirrors the server contiguity rule. */
function dayAfter(iso: string): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function resolveQuarterInitDefaults(opts: {
  existingYears: number[];
  futureYearAvailable: number | null;
  latestEndDate: string | null;
  /** Injectable for tests; defaults to now. */
  now?: Date;
}): QuarterInitDefaults {
  const { existingYears, futureYearAvailable, latestEndDate, now = new Date() } = opts;

  // The phantom future-year placeholder (injected by the API when the
  // enable_future_quarters flag is on) has no DB rows yet — strip it so we
  // don't treat the year the user is here to create as "already done".
  const trulyExistingYears =
    futureYearAvailable != null
      ? existingYears.filter((y) => y !== futureYearAvailable)
      : existingYears;

  // Current FY by April-start convention (month index 3 = April).
  const currentFY = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

  let nextFY = currentFY;
  while (trulyExistingYears.includes(nextFY)) nextFY++;

  const isFutureFY = nextFY > currentFY;

  // With existing quarters, the new FY must start the day after the latest
  // quarter's end (contiguous). With none, fall back to April 1 of nextFY.
  const defaultStart = latestEndDate ? dayAfter(latestEndDate) : `${nextFY}-04-01`;
  const minStart = latestEndDate ? dayAfter(latestEndDate) : undefined;

  return { nextFY, defaultStart, minStart, isFutureFY };
}
