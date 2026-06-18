import { describe, it, expect } from "vitest";
import { formatHoursAsClock, parseClockToHours } from "@/lib/utils/timesheetPeriod";

describe("formatHoursAsClock()", () => {
  it("renders whole hours as HH:00", () => {
    expect(formatHoursAsClock(1)).toBe("01:00");
    expect(formatHoursAsClock(8)).toBe("08:00");
  });

  it("renders fractional hours as minutes", () => {
    expect(formatHoursAsClock(1.5)).toBe("01:30");
    expect(formatHoursAsClock(0.25)).toBe("00:15");
  });

  it("does not truncate hours past two digits", () => {
    expect(formatHoursAsClock(120)).toBe("120:00");
  });

  it("renders zero / invalid as 00:00", () => {
    expect(formatHoursAsClock(0)).toBe("00:00");
    expect(formatHoursAsClock(-3)).toBe("00:00");
    expect(formatHoursAsClock(NaN)).toBe("00:00");
  });
});

describe("parseClockToHours()", () => {
  it("treats a bare integer as whole hours", () => {
    expect(parseClockToHours("1")).toBe(1);
  });

  it("treats a decimal as fractional hours", () => {
    expect(parseClockToHours("1.5")).toBe(1.5);
  });

  it("parses HH:MM and H:MM into hours", () => {
    expect(parseClockToHours("01:00")).toBe(1);
    expect(parseClockToHours("1:30")).toBe(1.5);
    expect(parseClockToHours("00:15")).toBe(0.25);
  });

  it("round-trips with formatHoursAsClock", () => {
    expect(formatHoursAsClock(parseClockToHours("1")!)).toBe("01:00");
    expect(formatHoursAsClock(parseClockToHours("1.5")!)).toBe("01:30");
    expect(formatHoursAsClock(parseClockToHours("01:00")!)).toBe("01:00");
  });

  it("returns null for empty or unparseable input", () => {
    expect(parseClockToHours("")).toBeNull();
    expect(parseClockToHours("   ")).toBeNull();
    expect(parseClockToHours("abc")).toBeNull();
    expect(parseClockToHours("1:99")).toBeNull();
  });
});
