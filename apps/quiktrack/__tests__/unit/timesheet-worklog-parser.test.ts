import { describe, it, expect } from "vitest";
import { parseWorklogTimeSpent } from "@/lib/utils/timesheetPeriod";

describe("parseWorklogTimeSpent", () => {
  it("parses '0m' to 0 seconds", () => {
    expect(parseWorklogTimeSpent("0m")).toBe(0);
  });

  it("parses '1d 2h' as 10 hours (1d = 8h) in seconds", () => {
    expect(parseWorklogTimeSpent("1d 2h")).toBe(10 * 3600);
  });

  it("parses '90m' to 5400 seconds", () => {
    expect(parseWorklogTimeSpent("90m")).toBe(90 * 60);
  });

  it("parses '45m' to 2700 seconds", () => {
    expect(parseWorklogTimeSpent("45m")).toBe(2700);
  });

  it("accepts a raw number as seconds directly", () => {
    expect(parseWorklogTimeSpent(120)).toBe(120);
  });

  it("rejects a negative raw number", () => {
    expect(parseWorklogTimeSpent(-300)).toBeNull();
  });

  it("rejects an unparseable string", () => {
    expect(parseWorklogTimeSpent("not a duration")).toBeNull();
  });
});
