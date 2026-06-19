import { describe, it, expect } from "vitest";
import {
  fmt,
  fmtCompact,
  progressColor,
  weekCellColors,
} from "@/lib/utils/kpiHelpers";

describe("fmt", () => {
  it("strips floating-point noise", () => {
    expect(fmt(97.521999)).toBe("97.52");
  });

  it("strips trailing zeros", () => {
    expect(fmt(4.0)).toBe("4");
    expect(fmt(1.5)).toBe("1.5");
    expect(fmt(100)).toBe("100");
  });

  it("returns em-dash for null/undefined", () => {
    expect(fmt(null)).toBe("—");
    expect(fmt(undefined)).toBe("—");
  });

  it("respects maxDecimals override", () => {
    expect(fmt(1.23456, 3)).toBe("1.235");
    expect(fmt(1.23456, 0)).toBe("1");
  });

  it("handles zero", () => {
    expect(fmt(0)).toBe("0");
  });

  it("handles negatives", () => {
    expect(fmt(-42.5)).toBe("-42.5");
  });
});

describe("fmtCompact", () => {
  it("leaves small numbers alone", () => {
    expect(fmtCompact(999)).toBe("999");
    expect(fmtCompact(97.52)).toBe("97.52");
  });

  it("abbreviates thousands", () => {
    expect(fmtCompact(1000)).toBe("1K");
    expect(fmtCompact(127_802.8)).toBe("127.8K");
  });

  it("abbreviates millions", () => {
    expect(fmtCompact(1_000_000)).toBe("1M");
    expect(fmtCompact(1_234_567)).toBe("1.23M");
  });

  it("handles negatives with sign", () => {
    expect(fmtCompact(-1500)).toBe("-1.5K");
    expect(fmtCompact(-2_000_000)).toBe("-2M");
  });

  it("returns em-dash for null/undefined", () => {
    expect(fmtCompact(null)).toBe("—");
    expect(fmtCompact(undefined)).toBe("—");
  });
});

describe("progressColor", () => {
  it("is blue at 120%+ (forward)", () => {
    expect(progressColor(120).bar).toBe("bg-blue-600");
    expect(progressColor(200).bar).toBe("bg-blue-600");
  });

  it("is green at 100-119% (forward)", () => {
    expect(progressColor(100).bar).toBe("bg-green-600");
    expect(progressColor(119).bar).toBe("bg-green-600");
  });

  it("is yellow at 80-99% (forward)", () => {
    expect(progressColor(80).bar).toBe("bg-yellow-500");
    expect(progressColor(99).bar).toBe("bg-yellow-500");
  });

  it("is red below 80% (forward)", () => {
    expect(progressColor(79).bar).toBe("bg-red-600");
    expect(progressColor(0).bar).toBe("bg-red-600");
  });

  it("reverses labels when reverse=true", () => {
    expect(progressColor(100, true).label).toBe("On Track");
    // In reverse mode, low % = value is far below target = "Much Better"
    expect(progressColor(79, true).label).toBe("Much Better");
    // High % in reverse = far above target = "Poor"
    expect(progressColor(150, true).label).toBe("Poor");
  });
});

describe("weekCellColors", () => {
  // weeklyTarget = qtdGoal / 13.
  // For qtdGoal=130 → weeklyTarget=10 → 100%: val=10, 80%: val=8, 120%: val=12

  it("returns green at exactly on-target", () => {
    expect(weekCellColors(10, 130).bg).toBe("bg-green-600");
  });

  it("returns blue at 120% of target", () => {
    expect(weekCellColors(12, 130).bg).toBe("bg-blue-600");
  });

  it("returns yellow at 80% of target", () => {
    expect(weekCellColors(8, 130).bg).toBe("bg-yellow-500");
  });

  it("returns red below 80% when value is entered", () => {
    expect(weekCellColors(5, 130).bg).toBe("bg-red-600");
  });

  it("returns neutral gray text when value is null (no update)", () => {
    const r = weekCellColors(null, 130);
    expect(r.bg).toBe("");
    expect(r.text).toBe("text-gray-300");
  });

  it("falls back to fallbackTarget when qtdGoal is null", () => {
    expect(weekCellColors(10, null, 130).bg).toBe("bg-green-600");
  });

  it("reverse mode: lower is better → 5 on a 10/week target is blue", () => {
    // reverse: val=5, weeklyTarget=10 → pct=50 → blue
    expect(weekCellColors(5, 130, null, true).bg).toBe("bg-blue-600");
  });

  it("reverse mode: exceeding target is red", () => {
    // reverse: val=15, weeklyTarget=10 → pct=150 → red
    expect(weekCellColors(15, 130, null, true).bg).toBe("bg-red-600");
  });
});
