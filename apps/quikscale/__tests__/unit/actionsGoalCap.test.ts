import { describe, it, expect, beforeAll } from "vitest";
import {
  goalProjectedCap,
  exceedsGoalProjected,
} from "@/app/(dashboard)/opsp/components/modals";
import { populateCatCache } from "@/app/(dashboard)/opsp/components/category";
import type { GoalRow } from "@/app/(dashboard)/opsp/types";

/**
 * Regression coverage for the ACTIONS (QTR) → Goal (1 YR) hard cap.
 *
 * A quarter's Projected may never exceed the matching annual Goal's Projected.
 * Both the ACTIONS (QTR) modal and the inline ActionsSection reject an edit
 * outright when `exceedsGoalProjected` returns true, so an over-goal value
 * never enters form state (and therefore never autosaves).
 */
const goal = (category: string, projected: string): GoalRow => ({
  category,
  projected,
  q1: "",
  q2: "",
  q3: "",
  q4: "",
});

describe("goalProjectedCap", () => {
  const rows = [goal("profit", "80")];

  it("resolves the matching goal's projected by category name", () => {
    expect(goalProjectedCap("profit", rows)).toBe(80);
  });

  it("returns null when no goal row matches the category", () => {
    expect(goalProjectedCap("revenue", rows)).toBeNull();
  });

  it("returns null for an empty category name", () => {
    expect(goalProjectedCap("", rows)).toBeNull();
  });

  it("returns null when the matching goal has no projected value", () => {
    expect(goalProjectedCap("profit", [goal("profit", "")])).toBeNull();
  });
});

describe("exceedsGoalProjected (Number categories)", () => {
  // Goal (1 YR) profit = 80, as in the reported scenario.
  const rows = [goal("profit", "80")];

  it("blocks a projected value greater than the goal", () => {
    expect(exceedsGoalProjected("profit", "100", rows)).toBe(true);
    expect(exceedsGoalProjected("profit", "81", rows)).toBe(true);
  });

  it("allows a projected value equal to the goal", () => {
    expect(exceedsGoalProjected("profit", "80", rows)).toBe(false);
  });

  it("allows a projected value below the goal", () => {
    expect(exceedsGoalProjected("profit", "79", rows)).toBe(false);
  });

  it("allows clearing the field (empty value is never over-goal)", () => {
    expect(exceedsGoalProjected("profit", "", rows)).toBe(false);
  });

  it("does not cap a category that has no matching goal", () => {
    expect(exceedsGoalProjected("revenue", "100000", rows)).toBe(false);
  });

  it("does not cap when the matching goal has no projected value", () => {
    expect(exceedsGoalProjected("profit", "100", [goal("profit", "")])).toBe(false);
  });

  it("tolerates a sub-cent overshoot but blocks a real decimal overshoot", () => {
    // Mirrors the +0.01 epsilon the ActionsModal validator uses.
    expect(exceedsGoalProjected("profit", "80.005", rows)).toBe(false);
    expect(exceedsGoalProjected("profit", "80.5", rows)).toBe(true);
  });
});

describe("exceedsGoalProjected (Currency categories, scale-aware)", () => {
  beforeAll(() => {
    populateCatCache([{ name: "salesUSD", dataType: "Currency", currency: "USD" }]);
  });

  // Goal (1 YR) = 100 K = 100,000.
  const rows = [goal("salesUSD", "100 K")];

  it("compares resolved (scaled) values, not raw digits", () => {
    // "200" alone (= 200) is below 100,000, so it is allowed even though the
    // raw digits look larger than the goal's "100".
    expect(exceedsGoalProjected("salesUSD", "200", rows)).toBe(false);
    // "200 K" = 200,000 > 100,000 → blocked.
    expect(exceedsGoalProjected("salesUSD", "200 K", rows)).toBe(true);
    // "100 K" = 100,000 = goal → allowed.
    expect(exceedsGoalProjected("salesUSD", "100 K", rows)).toBe(false);
  });
});
