/**
 * Digest reporting windows. Two shapes live here:
 *
 *   - previousIstCalendarDayUtc — used by the DAILY digest: the previous IST
 *     calendar day, [prev 00:00 IST, today 00:00 IST). Fires 10:00 IST. See its
 *     own docblock below.
 *   - rollingWindowUtc / rolling24hRangeUtc — used by the WEEKLY summary
 *     (days=7). Rolling semantics, described below.
 *
 * ROLLING 24-HOUR window: [now − 24h, now).
 *
 * Stateless. At a 20:30 IST cron this = [yesterday 20:30 IST, today 20:30 IST) —
 * back-to-back daily windows with no gap or overlap, so an activity logged after
 * one run rolls into the next run's window.
 *
 * NO timezone math: `from`/`to` are plain UTC instants (now and now−24h), and
 * CrmActivity.occurredAt is stored UTC, so the window is timezone-INDEPENDENT.
 * IST anchors only the cron TIME (when it runs, set in vercel.json), NOT the
 * window math — which is why this is simpler than the prior calendar-day helper
 * (no IST midnight / 18:30-UTC boundary; that whole class of day-boundary bug is
 * gone). Half-open [from, to): the windowed query uses gte from, lt to.
 *
 * `now` is injected so callers/tests are deterministic; digest-run passes new Date().
 *
 * KNOWN LIMITATION (deferred): a MISSED cron run loses that day — the next run
 * only reaches back 24h, so the gap between a skipped slot and (next run − 24h) is
 * never covered. Since-last-successful-run catch-up is deferred; add only if
 * misses become real. See ACTIVITY-FEATURE-DECISIONS.md.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Rolling window of `days` days ending now: [now − days*DAY, now). Pure UTC
 * instants, timezone-independent (same rationale as the 24h window — IST anchors
 * only the cron time, not the math). The daily digest passes days=1; the weekly
 * Friday summary passes days=7.
 */
export function rollingWindowUtc(now: Date, days: number): { from: Date; to: Date } {
  return {
    from: new Date(now.getTime() - days * DAY_MS),
    to: now,
  };
}

/** The daily digest's 24h window — thin alias of rollingWindowUtc(now, 1). */
export function rolling24hRangeUtc(now: Date): { from: Date; to: Date } {
  return rollingWindowUtc(now, 1);
}

/** IST is UTC+05:30 — a fixed offset (India observes no DST), so plain arithmetic
 *  is exact here; no Intl/zone database needed. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * PREVIOUS IST CALENDAR DAY: [prev-day 00:00 IST, today 00:00 IST) as UTC instants.
 *
 * Used by the daily digest so the 10:00 IST run reports one COMPLETE, already-closed
 * calendar day — the 19 Aug 10:00 IST email covers 18 Aug 00:00:00.000–23:59:59.999 IST
 * and nothing from 19 Aug. Half-open [from, to), matching the windowed queries
 * (gte from, lt to), so consecutive days neither gap nor overlap.
 *
 * Mechanics: shift `now` into IST-local, floor to that day's midnight, step back one
 * day, then shift both bounds back to UTC. IST midnight = 18:30 UTC the prior day,
 * so 18 Aug IST resolves to [2026-08-17T18:30Z, 2026-08-18T18:30Z).
 *
 * `now` is injected for deterministic tests, same as rollingWindowUtc. Any run time
 * after IST midnight yields the same window, so a delayed or manually re-fired run
 * still reports the identical day (unlike the rolling window, which drifts with the
 * fire instant). The weekly summary keeps using rollingWindowUtc — unchanged.
 */
export function previousIstCalendarDayUtc(now: Date): { from: Date; to: Date } {
  const istNow = now.getTime() + IST_OFFSET_MS;
  const istMidnightToday = Math.floor(istNow / DAY_MS) * DAY_MS;
  return {
    from: new Date(istMidnightToday - DAY_MS - IST_OFFSET_MS),
    to: new Date(istMidnightToday - IST_OFFSET_MS),
  };
}
