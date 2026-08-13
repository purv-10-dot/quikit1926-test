/**
 * QQL date-value parsing (QUIKTR-117): a plain ISO datetime, or Jira-style
 * relative shorthand "-<N><unit>" (d/w/h/m = days/weeks/hours/minutes ago).
 * Same regex-then-fallback idiom as parseDurationToHours
 * (lib/utils/timesheetPeriod.ts), never throws — returns null on failure so
 * the caller can produce a positioned QqlParseError.
 */
const RELATIVE_RE = /^-(\d+)([dwhm])$/i;

const UNIT_MS: Record<string, number> = {
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  h: 60 * 60 * 1000,
  m: 60 * 1000,
};

export function parseRelativeOrIsoDate(value: string, now: Date = new Date()): Date | null {
  const relative = RELATIVE_RE.exec(value.trim());
  if (relative) {
    const amount = Number(relative[1]);
    const unitMs = UNIT_MS[relative[2]!.toLowerCase()]!;
    return new Date(now.getTime() - amount * unitMs);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
