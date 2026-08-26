/**
 * Human duration parsing for the case Estimate field.
 *
 * The spec writes estimates as `"30m"` / `"1h30m"` (TestRail's convention), but
 * the column is `estimateMs`. These convert between the two so the UI can accept
 * what a tester naturally types while the DB keeps something summable — run and
 * section forecasts are just an addition over milliseconds.
 *
 * Pure functions, no dependencies, so the rounding rules are unit-testable.
 */

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Matches one `<number><unit>` pair, e.g. `90m`, `1.5h`, `2d`. */
const PART = /(\d+(?:\.\d+)?)\s*(d|h|m|s)/gi;

const UNIT_MS: Record<string, number> = {
  d: MS_PER_DAY,
  h: MS_PER_HOUR,
  m: MS_PER_MINUTE,
  s: MS_PER_SECOND,
};

/**
 * Parses `"1h30m"`, `"90m"`, `"2d 4h"`, `"45"` (bare number = minutes).
 *
 * Returns null for empty input, and null — not 0 — for unparseable input, so a
 * caller can tell "cleared" from "typed nonsense" and refuse to save the latter
 * silently as zero.
 */
export function parseEstimate(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;

  // A bare number is minutes: "30" is far more likely to mean 30 minutes than
  // 30 milliseconds, and matches how the field reads in the reference UI.
  if (/^\d+(\.\d+)?$/.test(text)) {
    return Math.round(Number(text) * MS_PER_MINUTE);
  }

  let total = 0;
  let matched = false;
  // Reset lastIndex: PART is module-level with the /g flag, so a previous call
  // would otherwise resume mid-string.
  PART.lastIndex = 0;
  for (let m = PART.exec(text); m !== null; m = PART.exec(text)) {
    matched = true;
    total += Number(m[1]) * UNIT_MS[m[2]];
  }
  if (!matched) return null;

  // Reject trailing junk like "30m banana" rather than silently accepting the
  // part that happened to parse.
  const consumed = text.replace(PART, "").replace(/[\s,]/g, "");
  PART.lastIndex = 0;
  if (consumed.length > 0) return null;

  return Math.round(total);
}

/**
 * Renders ms back to the short form, e.g. `5400000` → `"1h 30m"`.
 * Drops zero components so `"2h"` never renders as `"2h 0m"`.
 */
export function formatEstimate(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return "";

  const days = Math.floor(ms / MS_PER_DAY);
  const hours = Math.floor((ms % MS_PER_DAY) / MS_PER_HOUR);
  const minutes = Math.floor((ms % MS_PER_HOUR) / MS_PER_MINUTE);
  const seconds = Math.floor((ms % MS_PER_MINUTE) / MS_PER_SECOND);

  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  // Only show seconds when they are the whole story — "1h 30m 12s" is noise on
  // a planning estimate, but "45s" is a legitimate value.
  if (seconds && !days && !hours && !minutes) parts.push(`${seconds}s`);

  return parts.join(" ");
}

/**
 * Forecast for a set of cases (QUIKTR-335).
 *
 * TestRail's forecast is not a stored field — it is the planning estimate for a
 * selection, and cases with no estimate of their own are filled in with the
 * AVERAGE of the ones that have one. That is the only part worth stating
 * plainly, because it means a forecast over a mostly-unestimated suite is
 * extrapolation, not measurement:
 *
 *   forecast = Σ(known estimates) + (count without an estimate × mean known)
 *
 * Returns `estimated: false` when NOT ONE case carries an estimate — there is
 * nothing to extrapolate from, and reporting 0 would read as "this suite takes
 * no time" rather than "we don't know". Callers should show a dash, not a zero.
 */
export function forecastMs(estimates: Array<number | null | undefined>): {
  totalMs: number;
  knownCount: number;
  unknownCount: number;
  /** True when at least one value was extrapolated from the mean. */
  extrapolated: boolean;
  /** False when nothing is known at all, so `totalMs` is meaningless. */
  estimated: boolean;
} {
  const known = estimates.filter(
    (v): v is number => typeof v === "number" && v > 0,
  );
  const unknownCount = estimates.length - known.length;
  const knownTotal = known.reduce((sum, v) => sum + v, 0);

  if (known.length === 0) {
    return {
      totalMs: 0,
      knownCount: 0,
      unknownCount,
      extrapolated: false,
      estimated: false,
    };
  }

  const mean = knownTotal / known.length;
  return {
    totalMs: Math.round(knownTotal + unknownCount * mean),
    knownCount: known.length,
    unknownCount,
    extrapolated: unknownCount > 0,
    estimated: true,
  };
}
