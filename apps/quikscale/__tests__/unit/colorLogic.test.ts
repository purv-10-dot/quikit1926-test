import { describe, it, expect } from "vitest";
import {
  resolveColorByPercentage,
  resolveReversedColorByPercentage,
  getColorByPercentage,
  type ColorResult,
} from "../../lib/utils/colorLogic";

// Helper constants matching the module's internal color objects
const BLUE: ColorResult = {
  bg: "bg-blue-600",
  text: "text-white",
  className: "bg-blue-600 text-white font-bold",
};
const GREEN: ColorResult = {
  bg: "bg-green-600",
  text: "text-white",
  className: "bg-green-600 text-white font-bold",
};
const YELLOW: ColorResult = {
  bg: "bg-yellow-500",
  text: "text-white",
  className: "bg-yellow-500 text-white font-bold",
};
const RED: ColorResult = {
  bg: "bg-red-600",
  text: "text-white",
  className: "bg-red-600 text-white font-bold",
};
const NEUTRAL: ColorResult = {
  bg: "",
  text: "text-gray-300",
  className: "text-gray-300",
};

describe("resolveColorByPercentage (forward / higher is better)", () => {
  it("returns BLUE when percentage >= 120", () => {
    expect(resolveColorByPercentage(120, 100, 120, true)).toEqual(BLUE);
    expect(resolveColorByPercentage(150, 100, 150, true)).toEqual(BLUE);
  });

  it("returns BLUE when target <= 0 and value > 0", () => {
    expect(resolveColorByPercentage(0, 0, 5, true)).toEqual(BLUE);
    expect(resolveColorByPercentage(0, -10, 5, true)).toEqual(BLUE);
  });

  it("returns GREEN when percentage >= 100 and < 120", () => {
    expect(resolveColorByPercentage(100, 100, 100, true)).toEqual(GREEN);
    expect(resolveColorByPercentage(119, 100, 119, true)).toEqual(GREEN);
  });

  it("returns YELLOW when percentage >= 80 and < 100", () => {
    expect(resolveColorByPercentage(80, 100, 80, true)).toEqual(YELLOW);
    expect(resolveColorByPercentage(99, 100, 99, true)).toEqual(YELLOW);
  });

  it("returns RED when percentage < 80 and isUpdated is true", () => {
    expect(resolveColorByPercentage(79, 100, 79, true)).toEqual(RED);
    expect(resolveColorByPercentage(0, 100, 0, true)).toEqual(RED);
    expect(resolveColorByPercentage(50, 100, 50, true)).toEqual(RED);
  });

  it("returns NEUTRAL when percentage < 80 and isUpdated is false", () => {
    expect(resolveColorByPercentage(79, 100, 79, false)).toEqual(NEUTRAL);
    expect(resolveColorByPercentage(0, 100, 0, false)).toEqual(NEUTRAL);
  });
});

describe("resolveReversedColorByPercentage (reverse / lower is better)", () => {
  it("returns BLUE when percentage <= 80", () => {
    expect(resolveReversedColorByPercentage(80, 100, 80, true)).toEqual(BLUE);
    expect(resolveReversedColorByPercentage(50, 100, 50, true)).toEqual(BLUE);
    expect(resolveReversedColorByPercentage(0, 100, 0, true)).toEqual(BLUE);
  });

  it("returns BLUE when target <= 0 and value === 0", () => {
    expect(resolveReversedColorByPercentage(0, 0, 0, true)).toEqual(BLUE);
    expect(resolveReversedColorByPercentage(0, -5, 0, true)).toEqual(BLUE);
  });

  it("returns GREEN when percentage > 80 and <= 100", () => {
    expect(resolveReversedColorByPercentage(81, 100, 81, true)).toEqual(GREEN);
    expect(resolveReversedColorByPercentage(100, 100, 100, true)).toEqual(GREEN);
  });

  it("returns YELLOW when percentage > 100 and <= 120", () => {
    expect(resolveReversedColorByPercentage(101, 100, 101, true)).toEqual(YELLOW);
    expect(resolveReversedColorByPercentage(120, 100, 120, true)).toEqual(YELLOW);
  });

  it("returns RED when percentage > 120 and isUpdated is true", () => {
    expect(resolveReversedColorByPercentage(121, 100, 121, true)).toEqual(RED);
    expect(resolveReversedColorByPercentage(200, 100, 200, true)).toEqual(RED);
  });

  it("returns NEUTRAL when percentage > 120 and isUpdated is false", () => {
    expect(resolveReversedColorByPercentage(121, 100, 121, false)).toEqual(NEUTRAL);
    expect(resolveReversedColorByPercentage(200, 100, 200, false)).toEqual(NEUTRAL);
  });

  // Regression: previously the reverse resolver returned BLUE for any
  // unentered cell because percentage=0 satisfied `pct <= 80`. isUpdated
  // must gate ALL color branches in reverse mode, not just RED.
  it("returns NEUTRAL when no value entered (isUpdated=false), regardless of bucket", () => {
    expect(resolveReversedColorByPercentage(0, 100, 0, false)).toEqual(NEUTRAL);   // would-be BLUE
    expect(resolveReversedColorByPercentage(50, 100, 50, false)).toEqual(NEUTRAL); // would-be BLUE
    expect(resolveReversedColorByPercentage(90, 100, 90, false)).toEqual(NEUTRAL); // would-be GREEN
    expect(resolveReversedColorByPercentage(110, 100, 110, false)).toEqual(NEUTRAL); // would-be YELLOW
  });

  // Regression: target=0 ("zero-tolerance") in reverse mode must return RED
  // when the user logs any positive value — not BLUE via the percentage=0 fallback.
  it("returns RED when target <= 0 and value > 0 (zero-tolerance violated)", () => {
    expect(resolveReversedColorByPercentage(0, 0, 1, true)).toEqual(RED);
    expect(resolveReversedColorByPercentage(0, 0, 100, true)).toEqual(RED);
    expect(resolveReversedColorByPercentage(0, -5, 3, true)).toEqual(RED);
  });

  it("returns NEUTRAL when target <= 0 and no value entered", () => {
    expect(resolveReversedColorByPercentage(0, 0, 0, false)).toEqual(NEUTRAL);
    expect(resolveReversedColorByPercentage(0, -5, 0, false)).toEqual(NEUTRAL);
  });
});

describe("getColorByPercentage (unified entry point)", () => {
  describe("forward mode (default)", () => {
    it("computes percentage and returns BLUE for exceeded target", () => {
      // 120/100 = 120%
      expect(getColorByPercentage(120, 100, true)).toEqual(BLUE);
    });

    it("computes percentage and returns GREEN for achieved target", () => {
      // 100/100 = 100%
      expect(getColorByPercentage(100, 100, true)).toEqual(GREEN);
    });

    it("computes percentage and returns YELLOW for near target", () => {
      // 85/100 = 85%
      expect(getColorByPercentage(85, 100, true)).toEqual(YELLOW);
    });

    it("computes percentage and returns RED for below target when updated", () => {
      // 50/100 = 50%
      expect(getColorByPercentage(50, 100, true)).toEqual(RED);
    });

    it("returns NEUTRAL for below target when not updated", () => {
      expect(getColorByPercentage(50, 100, false)).toEqual(NEUTRAL);
    });

    it("handles target of 0 with positive value", () => {
      // percentage = 0 (target <= 0), but value > 0 triggers BLUE in forward
      expect(getColorByPercentage(10, 0, true)).toEqual(BLUE);
    });

    it("handles both value and target as 0 when not updated", () => {
      // percentage = 0, isUpdated = false -> NEUTRAL
      expect(getColorByPercentage(0, 0, false)).toEqual(NEUTRAL);
    });
  });

  describe("reverse mode", () => {
    it("returns BLUE for significantly below target (lower is better)", () => {
      // 40/100 = 40%
      expect(getColorByPercentage(40, 100, true, true)).toEqual(BLUE);
    });

    it("returns GREEN for at or near target", () => {
      // 90/100 = 90%
      expect(getColorByPercentage(90, 100, true, true)).toEqual(GREEN);
    });

    it("returns YELLOW for slightly over target", () => {
      // 110/100 = 110%
      expect(getColorByPercentage(110, 100, true, true)).toEqual(YELLOW);
    });

    it("returns RED for well over target when updated", () => {
      // 150/100 = 150%
      expect(getColorByPercentage(150, 100, true, true)).toEqual(RED);
    });

    it("returns NEUTRAL for well over target when not updated", () => {
      expect(getColorByPercentage(150, 100, false, true)).toEqual(NEUTRAL);
    });

    it("handles target of 0 with value of 0 (reverse)", () => {
      // percentage = 0, target <= 0, value === 0 -> BLUE in reverse
      expect(getColorByPercentage(0, 0, true, true)).toEqual(BLUE);
    });

    // Matches the real-world Team KPI bug: creating a reverse KPI before
    // any weekly values are logged used to paint every week cell BLUE.
    it("reverse-mode unentered cells render NEUTRAL (bug regression)", () => {
      // isUpdated=false, typical empty-cell inputs produced by weekCellColors
      expect(getColorByPercentage(0, 10, false, true)).toEqual(NEUTRAL);
      expect(getColorByPercentage(0, 100, false, true)).toEqual(NEUTRAL);
    });
  });

  describe("edge cases", () => {
    it("handles exact boundary at 120% forward", () => {
      expect(getColorByPercentage(120, 100, true, false)).toEqual(BLUE);
    });

    it("handles exact boundary at 100% forward", () => {
      expect(getColorByPercentage(100, 100, true, false)).toEqual(GREEN);
    });

    it("handles exact boundary at 80% forward", () => {
      expect(getColorByPercentage(80, 100, true, false)).toEqual(YELLOW);
    });

    it("handles exact boundary at 80% reverse", () => {
      expect(getColorByPercentage(80, 100, true, true)).toEqual(BLUE);
    });

    it("handles exact boundary at 100% reverse", () => {
      expect(getColorByPercentage(100, 100, true, true)).toEqual(GREEN);
    });

    it("handles exact boundary at 120% reverse", () => {
      expect(getColorByPercentage(120, 100, true, true)).toEqual(YELLOW);
    });

    it("handles fractional values", () => {
      // 99.5/100 = 99.5% -> YELLOW (forward)
      expect(getColorByPercentage(99.5, 100, true, false)).toEqual(YELLOW);
    });

    it("handles large target values", () => {
      // 1200000/1000000 = 120% -> BLUE
      expect(getColorByPercentage(1200000, 1000000, true)).toEqual(BLUE);
    });

    it("handles negative target with positive value (forward)", () => {
      // percentage = 0 (target <= 0), value > 0 -> BLUE
      expect(getColorByPercentage(5, -10, true, false)).toEqual(BLUE);
    });
  });
});
