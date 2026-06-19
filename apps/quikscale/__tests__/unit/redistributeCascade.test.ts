import { describe, it, expect, beforeAll } from "vitest";
import { redistributeOnCellEdit } from "@/app/(dashboard)/opsp/components/modals";
import { populateCatCache } from "@/app/(dashboard)/opsp/components/category";

/**
 * Regression coverage for the forward-cascade breakdown rebalance.
 *
 * Editing one period cell on an Automatic + Cumulative row pushes the delta
 * onto the NEXT cell(s) instead of re-splitting evenly across all of them, so
 * the user can hand-shape a distribution (e.g. 40 / 5 / 35) while the total
 * stays equal to Projected.
 */
beforeAll(() => {
  populateCatCache([
    // Whole-number cumulative auto row — the case the user hit.
    { name: "profit", dataType: "Number", currency: null, categoryType: "Cumulative", breakdownType: "Automatic" },
    // Currency cumulative auto row — verifies scale is preserved across cells.
    { name: "salesUSD", dataType: "Currency", currency: "USD", categoryType: "Cumulative", breakdownType: "Automatic" },
    // Manual + Standalone rows must NOT cascade (return null).
    { name: "manualCat", dataType: "Number", currency: null, categoryType: "Cumulative", breakdownType: "Manual" },
    { name: "standaloneCat", dataType: "Number", currency: null, categoryType: "Standalone", breakdownType: "Automatic" },
  ]);
});

const cascade = (category: string, projected: string, values: string[], edited: number, newVal: string) =>
  redistributeOnCellEdit({ categoryName: category, projected, values, edited, newVal });

describe("redistributeOnCellEdit — forward cascade", () => {
  it("pushes the delta onto the next cell, leaving later cells untouched", () => {
    // Projected 30, start 10/10/10 → edit M1 to 5 → 5/15/10.
    expect(cascade("profit", "30", ["10", "10", "10"], 0, "5")).toEqual(["5", "15", "10"]);
  });

  it("cascades to the following cell on a second edit", () => {
    // From 5/15/10 → edit M2 to 4 → 5/4/21 (M3 absorbs the +11).
    expect(cascade("profit", "30", ["5", "15", "10"], 1, "4")).toEqual(["5", "4", "21"]);
  });

  it("lets the user hand-shape 40 / 5 / 35 over two edits (the reported case)", () => {
    // Projected 80, start 27/27/26 → edit M1 to 40 → 40/14/26.
    const afterM1 = cascade("profit", "80", ["27", "27", "26"], 0, "40");
    expect(afterM1).toEqual(["40", "14", "26"]);
    // Then edit M2 to 5 → 40/5/35.
    expect(cascade("profit", "80", afterM1 as string[], 1, "5")).toEqual(["40", "5", "35"]);
  });

  it("keeps the total equal to Projected when one neighbour can't absorb it all", () => {
    // Projected 30, start 10/10/10 → edit M1 to 25 → M2 zeroes, M3 gives the rest → 25/0/5.
    // formatVal renders a zero cell as "".
    expect(cascade("profit", "30", ["10", "10", "10"], 0, "25")).toEqual(["25", "", "5"]);
  });

  it("clamps an over-Projected entry so the total never exceeds Projected", () => {
    // Projected 30, edit M1 to 100 → clamped to 30, others zeroed → 30 total.
    expect(cascade("profit", "30", ["10", "10", "10"], 0, "100")).toEqual(["30", "", ""]);
  });

  it("preserves the currency scale across cascaded cells", () => {
    // Projected 30 K, start 10K/10K/10K → edit M1 to 5 K → 5K/15K/10K.
    expect(cascade("salesUSD", "30 K", ["10 K", "10 K", "10 K"], 0, "5 K")).toEqual([
      "5 K",
      "15 K",
      "10 K",
    ]);
  });

  it("does not cascade Manual rows (caller writes only the edited cell)", () => {
    expect(cascade("manualCat", "30", ["10", "10", "10"], 0, "5")).toBeNull();
  });

  it("does not cascade Standalone rows", () => {
    expect(cascade("standaloneCat", "30", ["10", "10", "10"], 0, "5")).toBeNull();
  });
});
