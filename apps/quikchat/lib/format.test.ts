import { describe, expect, it } from "vitest";
import { dateDividerLabel, formatChannelTime, sameCalendarDay } from "./format";

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

describe("formatChannelTime", () => {
  it("returns empty for missing values", () => {
    expect(formatChannelTime(null)).toBe("");
    expect(formatChannelTime(undefined)).toBe("");
  });
  it("labels yesterday explicitly", () => {
    expect(formatChannelTime(daysAgo(1))).toBe("Yesterday");
  });
  it("uses a time for today (not 'Yesterday')", () => {
    const out = formatChannelTime(new Date());
    expect(out).not.toBe("Yesterday");
    expect(out.length).toBeGreaterThan(0);
  });
  it("uses 'MMM d' for older dates", () => {
    expect(formatChannelTime(daysAgo(10))).toMatch(/^[A-Z][a-z]{2}\s\d{1,2}$/);
  });
});

describe("dateDividerLabel", () => {
  it("Today / Yesterday", () => {
    expect(dateDividerLabel(new Date())).toBe("Today");
    expect(dateDividerLabel(daysAgo(1))).toBe("Yesterday");
  });
  it("weekday within the last week", () => {
    const label = dateDividerLabel(daysAgo(3));
    expect(["Today", "Yesterday"]).not.toContain(label);
    expect(label).toMatch(/^[A-Z][a-z]+$/);
  });
  it("full date for older", () => {
    expect(dateDividerLabel(daysAgo(30))).toMatch(/\d{4}$/);
  });
});

describe("sameCalendarDay", () => {
  it("true for two times on the same day, false across days", () => {
    const a = new Date(2026, 4, 8, 9, 0, 0); // local time
    const b = new Date(2026, 4, 8, 23, 0, 0);
    const c = new Date(2026, 4, 9, 1, 0, 0);
    expect(sameCalendarDay(a, b)).toBe(true);
    expect(sameCalendarDay(a, c)).toBe(false);
    expect(sameCalendarDay(null, b)).toBe(false);
  });
});
