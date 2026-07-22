import { describe, expect, it } from "vitest";
import { dndValid, formatUntil, isActive, untilIso } from "./notif-settings";

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
