/**
 * Go-live Stage — yesterdayIstRangeUtc (RED→GREEN). Target 1.
 *
 * Yesterday in IST (UTC+5:30, no DST), half-open [from, to) in UTC, because
 * CrmActivity.occurredAt is stored UTC and the windowed where uses gte:from / lt:to.
 *
 * The 18:30-UTC boundary is where day-boundary bugs hide:
 *   IST midnight = UTC 18:30 of the previous calendar day.
 *   yesterday IST = [IST yesterday 00:00, IST today 00:00)
 *                 = [UTC (day-before-yesterday) 18:30, UTC yesterday 18:30).
 *
 * `now` is injected so the bounds are deterministic (no Date.now flakiness).
 * Module does not exist yet → RED.
 */
import { describe, it, expect } from "vitest";
import { yesterdayIstRangeUtc } from "@/lib/services/notifications/digest-window";

describe("yesterdayIstRangeUtc — IST→UTC half-open yesterday window", () => {
  it("now = 2026-06-25T09:00:00Z (14:30 IST) → [2026-06-23T18:30Z, 2026-06-24T18:30Z)", () => {
    const { from, to } = yesterdayIstRangeUtc(new Date("2026-06-25T09:00:00.000Z"));
    expect(from.toISOString()).toBe("2026-06-23T18:30:00.000Z");
    expect(to.toISOString()).toBe("2026-06-24T18:30:00.000Z");
  });

  it("is HALF-OPEN: to − from === exactly 24h", () => {
    const { from, to } = yesterdayIstRangeUtc(new Date("2026-06-25T09:00:00.000Z"));
    expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("BOUNDARY: activity at 23:00 IST yesterday is INSIDE the window", () => {
    const { from, to } = yesterdayIstRangeUtc(new Date("2026-06-25T09:00:00.000Z"));
    // 23:00 IST on Jun 24 = 17:30:00 UTC Jun 24
    const act = new Date("2026-06-24T17:30:00.000Z").getTime();
    expect(act >= from.getTime() && act < to.getTime()).toBe(true);
  });

  it("BOUNDARY: activity at 00:30 IST today is OUTSIDE (>= to)", () => {
    const { from, to } = yesterdayIstRangeUtc(new Date("2026-06-25T09:00:00.000Z"));
    // 00:30 IST on Jun 25 = 19:00:00 UTC Jun 24 → today IST, not yesterday
    const act = new Date("2026-06-24T19:00:00.000Z").getTime();
    expect(act >= to.getTime()).toBe(true);
    void from;
  });

  it("BOUNDARY: activity at exactly yesterday 00:00 IST is INSIDE (from is inclusive)", () => {
    const { from } = yesterdayIstRangeUtc(new Date("2026-06-25T09:00:00.000Z"));
    // 00:00 IST Jun 24 = 18:30:00 UTC Jun 23 = exactly `from`
    expect(new Date("2026-06-23T18:30:00.000Z").getTime()).toBe(from.getTime());
  });

  it("when UTC clock is still 'yesterday' but IST has rolled over: now = 2026-06-25T20:00Z (01:30 IST Jun 26) → yesterday IST = Jun 25", () => {
    // 20:00 UTC Jun 25 = 01:30 IST Jun 26 → today IST is Jun 26 → yesterday IST = Jun 25
    // = [Jun 24 18:30Z, Jun 25 18:30Z)
    const { from, to } = yesterdayIstRangeUtc(new Date("2026-06-25T20:00:00.000Z"));
    expect(from.toISOString()).toBe("2026-06-24T18:30:00.000Z");
    expect(to.toISOString()).toBe("2026-06-25T18:30:00.000Z");
  });
});
