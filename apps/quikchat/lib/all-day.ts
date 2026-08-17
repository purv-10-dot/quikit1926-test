/**
 * All-day meeting date handling. THE ONLY PLACE the exclusive↔inclusive
 * conversion lives — both directions, used by every read and every write.
 *
 * ── WHY ALL-DAY IS NOT AN INSTANT ──────────────────────────────────────────
 * A timed meeting is a moment: "14 Aug 10:00 IST" and "14 Aug 04:30 UTC" are
 * the same event, and rendering it in the viewer's local zone is correct. An
 * all-day meeting is a CALENDAR DATE: "14 August" is the 14th for everyone, and
 * converting it to the viewer's zone is what breaks it.
 *
 * Store all-day as midnight UTC of the chosen date. Two failures follow if you
 * only do half of that, and the second is the one that survives a naive fix:
 *
 *   1. Microsoft Graph rejects `isAllDay: true` unless start/end are exactly
 *      T00:00:00 in the supplied timeZone. An organiser in IST picking "14 Aug"
 *      would otherwise send 2026-08-13T18:30:00Z — not midnight, so Graph errors.
 *
 *   2. Even stored correctly at 2026-08-14T00:00:00Z, rendering it with
 *      `toLocaleDateString` shows **13 Aug, 7:00 PM** to a viewer at UTC−5. The
 *      database is right and the screen is wrong. All-day dates must be
 *      rendered from their UTC parts — see `formatAllDayRange`.
 *
 * ── EXCLUSIVE ON THE WIRE, INCLUSIVE IN THE DTO ────────────────────────────
 * Graph and Google both treat an all-day `end` as EXCLUSIVE: a one-day event on
 * the 14th runs 14th 00:00 → 15th 00:00. We store that, because it is what the
 * providers want and what makes the midnight alignment work.
 *
 * `MeetingDto.end` is INCLUSIVE — the last day the meeting covers. That is a
 * deliberate divergence: the DTO is our contract, not Graph's. Exposing the
 * exclusive end would make every current and future renderer responsible for
 * knowing the convention, and the failure is silent — a calendar view added
 * later draws a one-day event across two days and nobody connects it to a
 * decision made here.
 *
 * The risk (b) trades for is DOUBLE CONVERSION. Guard against it by never
 * hand-rolling the ±1 day: every write goes through `exclusiveEndFor`, every
 * read through `inclusiveEndFor`, and neither is applied twice.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` (calendar date, no zone) → midnight-UTC ISO instant. */
export function allDayStartIso(date: string): string {
  return `${date}T00:00:00.000Z`;
}

/**
 * WRITE side. Inclusive last day (`YYYY-MM-DD`) → the EXCLUSIVE end instant we
 * store and send to providers. A single-day event on the 14th yields the 15th
 * at 00:00Z.
 */
export function exclusiveEndFor(inclusiveEndDate: string): string {
  const t = Date.parse(`${inclusiveEndDate}T00:00:00.000Z`);
  return new Date(t + DAY_MS).toISOString();
}

/**
 * READ side. Stored EXCLUSIVE end instant → the INCLUSIVE end the DTO exposes.
 * The exact inverse of `exclusiveEndFor`; apply once, at serialization.
 */
export function inclusiveEndFor(exclusiveEndIso: string): string {
  return new Date(Date.parse(exclusiveEndIso) - DAY_MS).toISOString();
}

/** The calendar date (`YYYY-MM-DD`) an all-day instant denotes, read in UTC. */
export function allDayDatePart(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * Is this instant midnight UTC? Graph's precondition for `isAllDay`, asserted
 * server-side so a malformed client can't produce an event the provider will
 * reject (or, worse, silently place at the wrong time).
 */
export function isMidnightUtc(iso: string): boolean {
  const d = new Date(iso);
  return (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}

/**
 * Render an all-day range from its UTC parts.
 *
 * `timeZone: "UTC"` is not a default that happens to work — it is the whole
 * point. Formatting these with the viewer's local zone is failure 2 above, and
 * it is invisible to anyone developing on UTC.
 *
 * Takes the INCLUSIVE end (what the DTO carries), so a one-day event renders as
 * a single date rather than a range.
 */
export function formatAllDayRange(startIso: string, inclusiveEndIso: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  };
  const start = new Date(startIso);
  const end = new Date(inclusiveEndIso);
  const startTxt = start.toLocaleDateString(undefined, opts);
  if (allDayDatePart(startIso) === allDayDatePart(inclusiveEndIso)) {
    return `${startTxt} · All day`;
  }
  return `${startTxt} – ${end.toLocaleDateString(undefined, opts)} · All day`;
}
