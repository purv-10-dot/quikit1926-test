/**
 * Digest reporting window — "yesterday, IST" as UTC bounds.
 *
 * The daily digest reports the prior IST calendar day. CrmActivity.occurredAt is
 * stored UTC and the windowed query uses a half-open [from, to) (gte from, lt to),
 * so we return UTC Date bounds for exactly one IST day.
 *
 * IST = UTC+5:30, NO DST (fixed offset). IST midnight = UTC 18:30 of the previous
 * calendar day — that 18:30-UTC boundary is where day-boundary bugs hide.
 *
 *   yesterday IST = [IST yesterday 00:00, IST today 00:00)
 *                 = [UTC (yesterday−1) 18:30, UTC yesterday 18:30)
 *
 * `now` is injected so callers/tests are deterministic; digest-run passes new Date().
 * (Hardcoded IST for now — a configurable per-org timezone is a later want.)
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000; // +5:30

export function yesterdayIstRangeUtc(now: Date): { from: Date; to: Date } {
  // Shift the UTC instant into IST wall-clock: reading getUTC* on this shifted
  // value yields IST calendar fields.
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);

  // IST midnight of TODAY, as a shifted-epoch (IST wall-clock midnight).
  const istTodayMidnight = Date.UTC(
    istNow.getUTCFullYear(),
    istNow.getUTCMonth(),
    istNow.getUTCDate(),
    0, 0, 0, 0,
  );

  // Yesterday IST window in IST wall-clock, half-open [−24h, today-midnight).
  const istFrom = istTodayMidnight - 24 * 60 * 60_000;
  const istTo = istTodayMidnight;

  // Convert IST wall-clock back to true UTC by removing the offset.
  return {
    from: new Date(istFrom - IST_OFFSET_MS),
    to: new Date(istTo - IST_OFFSET_MS),
  };
}
