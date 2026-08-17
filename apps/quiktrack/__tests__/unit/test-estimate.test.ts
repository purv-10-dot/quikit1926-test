import { describe, expect, it } from "vitest";
import { formatEstimate, parseEstimate } from "@/lib/test/estimate";

/**
 * The spec writes estimates as "30m" / "1h30m" while the column is `estimateMs`.
 * These conversions sit between what a tester types and something summable, so
 * the rounding and rejection rules matter: a mis-parse silently corrupts run
 * forecasts, which are just an addition over the stored milliseconds.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("parseEstimate", () => {
  it("parses the spec's example", () => {
    expect(parseEstimate("30m")).toBe(30 * MIN);
  });

  it("parses compound durations", () => {
    expect(parseEstimate("1h30m")).toBe(HOUR + 30 * MIN);
    expect(parseEstimate("2d 4h")).toBe(2 * DAY + 4 * HOUR);
    expect(parseEstimate("1h 30m 15s")).toBe(HOUR + 30 * MIN + 15_000);
  });

  it("treats a bare number as minutes", () => {
    // "30" almost certainly means 30 minutes, not 30 milliseconds.
    expect(parseEstimate("30")).toBe(30 * MIN);
  });

  it("accepts fractional units", () => {
    expect(parseEstimate("1.5h")).toBe(90 * MIN);
  });

  it("is case- and space-insensitive", () => {
    expect(parseEstimate("1H 30M")).toBe(HOUR + 30 * MIN);
  });

  it("returns null for empty input, meaning 'cleared'", () => {
    expect(parseEstimate("")).toBeNull();
    expect(parseEstimate("   ")).toBeNull();
  });

  it("returns null — not 0 — for nonsense, so it is never saved silently", () => {
    expect(parseEstimate("banana")).toBeNull();
    expect(parseEstimate("--")).toBeNull();
  });

  it("rejects trailing junk rather than parsing the good part", () => {
    // Accepting "30m" out of "30m banana" would store a value the user never
    // knowingly entered.
    expect(parseEstimate("30m banana")).toBeNull();
  });

  it("does not leak regex state between calls", () => {
    // The matcher is module-level with /g; a stale lastIndex would corrupt the
    // second call.
    expect(parseEstimate("1h30m")).toBe(HOUR + 30 * MIN);
    expect(parseEstimate("1h30m")).toBe(HOUR + 30 * MIN);
    expect(parseEstimate("45m")).toBe(45 * MIN);
  });
});

describe("formatEstimate", () => {
  it("renders the short form", () => {
    expect(formatEstimate(30 * MIN)).toBe("30m");
    expect(formatEstimate(HOUR + 30 * MIN)).toBe("1h 30m");
    expect(formatEstimate(2 * DAY + 4 * HOUR)).toBe("2d 4h");
  });

  it("drops zero components", () => {
    expect(formatEstimate(2 * HOUR)).toBe("2h");
  });

  it("shows seconds only when they are the whole value", () => {
    expect(formatEstimate(45_000)).toBe("45s");
    expect(formatEstimate(HOUR + 12_000)).toBe("1h");
  });

  it("renders nothing for empty or non-positive values", () => {
    expect(formatEstimate(null)).toBe("");
    expect(formatEstimate(undefined)).toBe("");
    expect(formatEstimate(0)).toBe("");
  });

  it("round-trips with parseEstimate", () => {
    for (const text of ["30m", "1h 30m", "2d 4h", "45s"]) {
      expect(formatEstimate(parseEstimate(text))).toBe(text);
    }
  });
});
