/**
 * Shared server-side search helpers for the dashboard list endpoints
 * (KPI / Priority / WWW). Centralizes the cross-cutting match rules so all
 * three modules search the same way:
 *
 *   - User-name match  → resolve User.firstName/lastName ILIKE %q% to ids, then
 *                        the caller ORs `owner|createdBy|updatedBy IN (ids)`.
 *   - Date match       → build Prisma range filters for createdAt/updatedAt that
 *                        understand: a bare year (`2026`), a full date
 *                        (`16/06/2026`, `16-06-2026`), a month+year (`06/2026`),
 *                        a month name (`Jun`, `June`) — and `month year`
 *                        (`Jun 2026`). A bare month name matches that month
 *                        across a rolling window of years (no raw SQL needed).
 *   - Numeric match    → when the term parses to a number, the caller ORs the
 *                        numeric goal columns equal to it.
 *
 * Pure Prisma (no `$queryRaw`) — deliberately, to avoid coupling to physical
 * table/column names on a schema that drifts (see the prisma-drift memory).
 */

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

export interface DateRange {
  gte: Date;
  lt: Date;
}

/**
 * Resolve user ids whose first or last name ILIKE-matches `q`. Used by every
 * list route to turn a name search into `owner|createdBy|updatedBy IN (ids)`.
 */
export async function searchUserIds(
  // Loosely typed so the extended PrismaClient (with its overloaded findMany)
  // is assignable without pulling the generated client types into this helper.
  db: { user: { findMany: (args: any) => Promise<Array<{ id: string }>> } }, // eslint-disable-line @typescript-eslint/no-explicit-any
  q: string,
): Promise<string[]> {
  // Tokenize so a multi-word "First Last" matches across the two columns:
  // each word must hit firstName OR lastName (AND across words). A single word
  // keeps the original single-OR shape. Without this, "Bobby Kohli" matched
  // neither column (firstName="Bobby", lastName="Kohli") and returned nothing.
  // `\s+` also collapses the non-breaking spaces copy-paste sometimes inserts.
  const tokens = q.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const perToken = (t: string) => ({
    OR: [
      { firstName: { contains: t, mode: "insensitive" } },
      { lastName: { contains: t, mode: "insensitive" } },
    ],
  });
  const where = tokens.length === 1 ? perToken(tokens[0]) : { AND: tokens.map(perToken) };

  const users = await db.user.findMany({ where, select: { id: true } });
  return users.map((u) => u.id);
}

/**
 * Build createdAt/updatedAt range filters for a date-ish search term.
 * Returns [] when the term isn't date-shaped, so the caller can skip it.
 *
 * @param refYear anchor year for a bare month-name search window
 *                (defaults to the current UTC year).
 */
export function dateRangesForSearch(q: string, refYear?: number): DateRange[] {
  const term = q.trim().toLowerCase();
  if (!term) return [];
  const anchor = refYear ?? new Date().getUTCFullYear();
  const ranges: DateRange[] = [];

  // Bare year: 2026
  if (/^\d{4}$/.test(term)) {
    const y = Number(term);
    if (y >= 1970 && y <= 9999) {
      ranges.push({ gte: new Date(Date.UTC(y, 0, 1)), lt: new Date(Date.UTC(y + 1, 0, 1)) });
    }
    return ranges;
  }

  // Full date: 16/06/2026 or 16-06-2026 (also single-digit day/month)
  const full = term.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (full) {
    const d = Number(full[1]);
    const m = Number(full[2]) - 1;
    const y = Number(full[3]);
    if (m >= 0 && m < 12 && d >= 1 && d <= 31) {
      const start = new Date(Date.UTC(y, m, d));
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      ranges.push({ gte: start, lt: end });
    }
    return ranges;
  }

  // Month + year numeric: 06/2026
  const my = term.match(/^(\d{1,2})[/-](\d{4})$/);
  if (my) {
    const m = Number(my[1]) - 1;
    const y = Number(my[2]);
    if (m >= 0 && m < 12) {
      ranges.push({ gte: new Date(Date.UTC(y, m, 1)), lt: new Date(Date.UTC(y, m + 1, 1)) });
    }
    return ranges;
  }

  // Month name, optionally followed by a year: "jun", "june", "jun 2026"
  const mn = term.match(/^([a-z]{3,})\s*(\d{4})?$/);
  if (mn) {
    const mi = MONTHS.findIndex((M) => M.startsWith(mn[1]));
    if (mi >= 0) {
      if (mn[2]) {
        const y = Number(mn[2]);
        ranges.push({ gte: new Date(Date.UTC(y, mi, 1)), lt: new Date(Date.UTC(y, mi + 1, 1)) });
      } else {
        for (let y = anchor - 5; y <= anchor + 1; y++) {
          ranges.push({ gte: new Date(Date.UTC(y, mi, 1)), lt: new Date(Date.UTC(y, mi + 1, 1)) });
        }
      }
    }
  }
  return ranges;
}

/**
 * Build `{ OR: [{ field: range }, ...] }` conditions for one or more date
 * columns. Returns [] when the term isn't date-shaped.
 */
export function dateSearchConditions(
  fields: string[],
  q: string,
  refYear?: number,
): Array<Record<string, DateRange>> {
  const ranges = dateRangesForSearch(q, refYear);
  const conds: Array<Record<string, DateRange>> = [];
  for (const f of fields) {
    for (const r of ranges) conds.push({ [f]: r });
  }
  return conds;
}

/**
 * Split a time-ish term into tokens for matching `String` time columns.
 * A range cell like `"10:16 – 10:36"` (en/em dash or hyphen) → `["10:16","10:36"]`;
 * a single time → `["10:16"]`. The caller ORs `{ col: { contains: token } }` for
 * each token across each time column (start/end/segment), so both a single time
 * and a pasted range match.
 */
export function timeSearchTokens(q: string): string[] {
  return q
    .split(/[–—-]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Return the enum values whose normalized label contains the search term.
 * Enums can't be `contains`-matched in Prisma, so we resolve them to concrete
 * values for an `{ in: [...] }` filter. Underscores are treated as spaces, so
 * `"cancelled"` matches `CALL_CANCELLED_BY_CLIENT` and `"holiday"` matches both
 * HOLIDAY_* values. Returns [] when nothing matches (caller skips the column).
 */
export function matchEnumValues<T extends string>(values: readonly T[], q: string): T[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return values.filter((v) => v.toLowerCase().replace(/_/g, " ").includes(s));
}

/**
 * Map a search term to an `isActive` boolean: a term that's a prefix of
 * "inactive" → false, else a prefix of "active" → true, else null (not a
 * status term). Order matters because "active" is a substring of "inactive".
 */
export function activeBooleanFromSearch(q: string): boolean | null {
  const s = q.trim().toLowerCase();
  if (!s) return null;
  if ("inactive".startsWith(s)) return false;
  if ("active".startsWith(s)) return true;
  return null;
}

/**
 * Split a pasted multi-value cell on commas → trimmed tokens. Lets a copied
 * roster like `"Jayaram, Kavin Laxman"` match a row where ANY member name
 * contains one of the tokens. A term with no comma yields a single token (the
 * original whole-term behavior).
 */
export function commaTokens(q: string): string[] {
  return q
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parse a term to a finite number, or null. Used for goal/value equality. */
export function numericSearchValue(q: string): number | null {
  const t = q.trim().replace(/,/g, "");
  if (t === "" || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
