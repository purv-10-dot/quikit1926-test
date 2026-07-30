import { describe, expect, it } from "vitest";
import { dndActiveNow, dndValid, formatUntil, isActive, untilIso } from "./notif-settings";

const base = new Date(2026, 5, 18, 12, 0, 0).getTime(); // local noon, 18 Jun 2026

describe("untilIso", () => {
  it("computes fixed offsets", () => {
    expect(Date.parse(untilIso("30m", base)) - base).toBe(30 * 60_000);
    expect(Date.parse(untilIso("1h", base)) - base).toBe(60 * 60_000);
    expect(Date.parse(untilIso("8h", base)) - base).toBe(8 * 60 * 60_000);
  });
  it("computes tomorrow at 08:00 local", () => {
    const d = new Date(untilIso("tomorrow", base));
    expect(d.getHours()).toBe(8);
    expect(d.getMinutes()).toBe(0);
    expect(d.getDate()).toBe(19);
  });
});

describe("isActive", () => {
  it("is true only for a future timestamp", () => {
    expect(isActive(new Date(base + 60_000).toISOString(), base)).toBe(true);
    expect(isActive(new Date(base - 60_000).toISOString(), base)).toBe(false);
    expect(isActive(null, base)).toBe(false);
    expect(isActive("garbage", base)).toBe(false);
  });
});

describe("formatUntil", () => {
  it("renders a same-day time and a future-day date", () => {
    expect(formatUntil(new Date(base + 60 * 60_000).toISOString(), base)).toMatch(/^until /);
    const tomorrow = formatUntil(untilIso("tomorrow", base), base);
    expect(tomorrow).toMatch(/until .*,/); // includes a date for a different day
  });
});

describe("dndValid", () => {
  it("requires both HH:MM bounds when enabled", () => {
    expect(dndValid(true, "22:00", "07:00")).toBe(true);
    expect(dndValid(true, "22:00", null)).toBe(false);
    expect(dndValid(true, "22:00", "")).toBe(false);
    expect(dndValid(true, "bad", "07:00")).toBe(false);
    expect(dndValid(false, null, null)).toBe(true); // disabled → always valid
  });
});

// dndActiveNow is a deliberate client-safe duplicate of the server's
// isInDndWindow (lib/server/notifications.service.ts). These cases MIRROR the
// server's own DND tests one-for-one — if the two implementations ever drift,
// one of the two suites fails. Local-time constructor, so `at()` matches the
// getHours()/getMinutes() the function reads.
const at = (h: number, m = 0) => new Date(2026, 5, 18, h, m, 0);

describe("dndActiveNow", () => {
  it("same-day window is the bounded interval [start,end)", () => {
    expect(dndActiveNow(true, "09:00", "17:00", at(12))).toBe(true);
    expect(dndActiveNow(true, "09:00", "17:00", at(8))).toBe(false);
    expect(dndActiveNow(true, "09:00", "17:00", at(9))).toBe(true); // start inclusive
    expect(dndActiveNow(true, "09:00", "17:00", at(17))).toBe(false); // end exclusive
  });

  it("overnight window wraps past midnight", () => {
    expect(dndActiveNow(true, "22:00", "07:00", at(23))).toBe(true);
    expect(dndActiveNow(true, "22:00", "07:00", at(3))).toBe(true);
    expect(dndActiveNow(true, "22:00", "07:00", at(12))).toBe(false);
    expect(dndActiveNow(true, "22:00", "07:00", at(22))).toBe(true); // start inclusive
    expect(dndActiveNow(true, "22:00", "07:00", at(7))).toBe(false); // end exclusive
  });

  it("start===end and missing bounds are never in-window", () => {
    expect(dndActiveNow(true, "09:00", "09:00", at(9))).toBe(false);
    expect(dndActiveNow(true, null, "07:00", at(1))).toBe(false);
    expect(dndActiveNow(true, "22:00", null, at(23))).toBe(false);
  });

  it("is false whenever DND is switched off, whatever the window says", () => {
    expect(dndActiveNow(false, "22:00", "07:00", at(23))).toBe(false);
  });

  it("respects the minute component at the boundaries", () => {
    expect(dndActiveNow(true, "22:30", "07:15", at(22, 29))).toBe(false);
    expect(dndActiveNow(true, "22:30", "07:15", at(22, 30))).toBe(true);
    expect(dndActiveNow(true, "22:30", "07:15", at(7, 14))).toBe(true);
    expect(dndActiveNow(true, "22:30", "07:15", at(7, 15))).toBe(false);
  });
});
