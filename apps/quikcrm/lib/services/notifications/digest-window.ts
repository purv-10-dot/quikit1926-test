/**
 * Digest reporting window — a ROLLING 24-HOUR window: [now − 24h, now).
 *
 * Stateless. At the 20:30 IST cron this = [yesterday 20:30 IST, today 20:30 IST) —
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
