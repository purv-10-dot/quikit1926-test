/**
 * Range → query translation for the Global Export feature.
 *
 * Each module has a different "interval" axis (see the plan in
 * docs/global-export.md):
 *   - week        → KPI / Team KPI / Priority: the interval selects a sub-range
 *                   of WEEK COLUMNS (W_from..W_to). It does NOT filter rows —
 *                   every KPI/Priority in the quarter is still exported; only
 *                   which weekly columns appear is trimmed.
 *   - date        → WWW / Daily Huddle / Weekly Meeting: the interval is a
 *                   From/To range applied to a DateTime field (a Prisma where
 *                   fragment `{ [field]: { gte, lte } }`).
 *   - createdDate → Client Master / Client Members: an optional created-at
 *                   range (or "all time" → no fragment).
 *   - none        → no interval control.
 *
 * These helpers are pure so they can be unit-tested without a DB or React.
 */

/** Inclusive list of week numbers for a [fromWeek, toWeek] selection, clamped
 *  to [1, weekCount]. Tolerates a reversed range (from > to) by swapping. */
export function weekRangeToNumbers(
  fromWeek: number,
  toWeek: number,
  weekCount: number,
): number[] {
  const max = Number.isFinite(weekCount) && weekCount > 0 ? Math.floor(weekCount) : 0;
  if (max <= 0) return [];
  const a = clampInt(fromWeek, 1, max);
  const b = clampInt(toWeek, 1, max);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const out: number[] = [];
  for (let w = lo; w <= hi; w++) out.push(w);
  return out;
}

/** A Prisma DateTime where fragment for a From/To range on `field`.
 *
 *  - `from` becomes start-of-day UTC (00:00:00.000).
 *  - `to`   becomes end-of-day   UTC (23:59:59.999) so the whole "to" day is
 *    included.
 *  - Missing endpoints are simply omitted (open-ended range).
 *  - Both missing → `{}` ("all time"), so callers can spread it into a where
 *    unconditionally.
 *  - A reversed range (from > to) is swapped so it still returns rows.
 *
 *  Invalid date strings are treated as absent.
 */
export function dateRangeToWhere(
  field: string,
  from?: string | null,
  to?: string | null,
): Record<string, { gte?: Date; lte?: Date }> {
  let start = parseDayStart(from);
  let end = parseDayEnd(to);
  if (start && end && start.getTime() > end.getTime()) {
    // Swap so a reversed selection still yields the intended span.
    const s = parseDayStart(to);
    const e = parseDayEnd(from);
    start = s;
    end = e;
  }
  const bounds: { gte?: Date; lte?: Date } = {};
  if (start) bounds.gte = start;
  if (end) bounds.lte = end;
  if (bounds.gte === undefined && bounds.lte === undefined) return {};
  return { [field]: bounds };
}

function clampInt(v: number, lo: number, hi: number): number {
  const n = Number.isFinite(v) ? Math.round(v) : lo;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function parseDayStart(s?: string | null): Date | undefined {
  const d = parseYmd(s);
  if (!d) return undefined;
  return new Date(Date.UTC(d.y, d.m - 1, d.d, 0, 0, 0, 0));
}

function parseDayEnd(s?: string | null): Date | undefined {
  const d = parseYmd(s);
  if (!d) return undefined;
  return new Date(Date.UTC(d.y, d.m - 1, d.d, 23, 59, 59, 999));
}

/** Parse a "YYYY-MM-DD" (or leading-that ISO) string. Returns undefined for
 *  empty / malformed input so callers treat it as an open endpoint. */
function parseYmd(s?: string | null): { y: number; m: number; d: number } | undefined {
  if (!s) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (!match) return undefined;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  return { y, m, d };
}
