/**
 * Window helper — rolling24hRangeUtc (RED→GREEN).
 *
 * The digest reports a ROLLING 24-HOUR window: [now − 24h, now), stateless.
 * At the 20:30 IST cron this = [yesterday 20:30 IST, today 20:30 IST) — back-to-
 * back daily windows, no gap/overlap.
 *
 * NO IST / calendar math: from/to are plain UTC instants (now and now−24h), and
 * CrmActivity.occurredAt is UTC, so the window is timezone-INDEPENDENT. IST only
 * anchors the cron TIME (when it runs), not the window math. This replaces the
 * earlier yesterdayIstRangeUtc (calendar-day) helper, which is removed.
 *
 * `now` is injected for determinism. Half-open [from, to): gte from, lt to.
 */
import { describe, it, expect } from "vitest";
import { rolling24hRangeUtc, rollingWindowUtc } from "@/lib/services/notifications/digest-window";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("rolling24hRangeUtc — [now − 24h, now), pure UTC", () => {
  it("to === now exactly; from === now − 24h exactly", () => {
    const now = new Date("2026-06-25T15:00:00.000Z");
    const { from, to } = rolling24hRangeUtc(now);
    expect(to.getTime()).toBe(now.getTime());
    expect(from.getTime()).toBe(now.getTime() - DAY_MS);
  });

  it("window is exactly 24h wide", () => {
    const { from, to } = rolling24hRangeUtc(new Date("2026-06-25T15:00:00.000Z"));
    expect(to.getTime() - from.getTime()).toBe(DAY_MS);
  });

  it("BOUNDARY: activity 23h ago is INSIDE", () => {
    const now = new Date("2026-06-25T15:00:00.000Z");
    const { from, to } = rolling24hRangeUtc(now);
    const act = now.getTime() - 23 * 60 * 60 * 1000;
    expect(act >= from.getTime() && act < to.getTime()).toBe(true);
  });

  it("BOUNDARY: activity 25h ago is OUTSIDE (< from)", () => {
    const now = new Date("2026-06-25T15:00:00.000Z");
    const { from } = rolling24hRangeUtc(now);
    const act = now.getTime() - 25 * 60 * 60 * 1000;
    expect(act < from.getTime()).toBe(true);
  });

  it("EDGE: activity at exactly now − 24h is INSIDE (from is inclusive, gte)", () => {
    const now = new Date("2026-06-25T15:00:00.000Z");
    const { from } = rolling24hRangeUtc(now);
    expect((now.getTime() - DAY_MS)).toBe(from.getTime()); // == from → gte includes it
  });

  it("EDGE: activity at exactly now is OUTSIDE (to is exclusive, lt)", () => {
    const now = new Date("2026-06-25T15:00:00.000Z");
    const { to } = rolling24hRangeUtc(now);
    // an activity at exactly `to` (=now) is NOT < to → excluded
    expect(now.getTime() < to.getTime()).toBe(false);
  });

  it("NO IST ARTIFACT: from/to are exactly now and now−24h regardless of wall-clock date", () => {
    // Two very different instants — neither snaps to any calendar/IST boundary;
    // each yields a pure [now−24h, now).
    for (const iso of ["2026-01-01T00:00:00.000Z", "2026-06-25T20:30:45.123Z", "2026-12-31T18:30:00.000Z"]) {
      const now = new Date(iso);
      const { from, to } = rolling24hRangeUtc(now);
      expect(to.toISOString()).toBe(now.toISOString());            // to is exactly now (no rounding)
      expect(from.getTime()).toBe(now.getTime() - DAY_MS);         // from is exactly now−24h (no IST snap)
    }
  });
});

describe("rollingWindowUtc(now, days) — parameterized window (weekly summary)", () => {
  it("days=1 is byte-identical to the existing 24h behavior (re-pin: daily unchanged)", () => {
    const now = new Date("2026-06-25T15:00:00.000Z");
    const param = rollingWindowUtc(now, 1);
    const legacy = rolling24hRangeUtc(now);
    expect(param.from.getTime()).toBe(legacy.from.getTime());
    expect(param.to.getTime()).toBe(legacy.to.getTime());
    expect(param.to.getTime() - param.from.getTime()).toBe(DAY_MS);
  });

  it("days=7 → [now − 7*DAY, now); to===now, from===now−7d, exactly 7 days wide", () => {
    const now = new Date("2026-06-25T15:00:00.000Z");
    const { from, to } = rollingWindowUtc(now, 7);
    expect(to.getTime()).toBe(now.getTime());
    expect(from.getTime()).toBe(now.getTime() - 7 * DAY_MS);
    expect(to.getTime() - from.getTime()).toBe(7 * DAY_MS);
  });

  it("rolling24hRangeUtc is the days=1 alias (delegates to rollingWindowUtc)", () => {
    const now = new Date("2026-06-25T20:30:45.123Z");
    expect(rolling24hRangeUtc(now)).toEqual(rollingWindowUtc(now, 1));
  });
});
