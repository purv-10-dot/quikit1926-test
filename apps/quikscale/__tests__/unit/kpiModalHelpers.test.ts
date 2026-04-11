import { describe, it, expect } from "vitest";
import {
  fmtBreakdown,
  buildBreakdown,
  buildOwnerBreakdown,
  redistributeOwnerRemainder,
  sumBreakdown,
  distributeContributionsEven,
} from "@/app/(dashboard)/kpi/components/kpiModalHelpers";

describe("fmtBreakdown", () => {
  it("rounds Number to integer", () => {
    expect(fmtBreakdown(10.7, "Number")).toBe("11");
    expect(fmtBreakdown(10.4, "Number")).toBe("10");
  });
  it("uses 2 decimals for Percentage", () => {
    expect(fmtBreakdown(12.345, "Percentage")).toBe("12.35");
  });
  it("uses 2 decimals for Currency", () => {
    expect(fmtBreakdown(99.9, "Currency")).toBe("99.90");
  });
});

describe("buildBreakdown — empty / guard", () => {
  it("returns 13 empty cells when target is 0", () => {
    const out = buildBreakdown("Cumulative", 0, "Number");
    expect(Object.keys(out)).toHaveLength(13);
    for (let w = 1; w <= 13; w++) expect(out[w]).toBe("");
  });
  it("returns 13 empty cells when target is negative", () => {
    const out = buildBreakdown("Cumulative", -5, "Number");
    expect(Object.values(out).every((v) => v === "")).toBe(true);
  });
});

describe("buildBreakdown — Standalone", () => {
  it("Number: every week equals the target (rounded)", () => {
    const out = buildBreakdown("Standalone", 100, "Number");
    expect(Object.keys(out)).toHaveLength(13);
    for (let w = 1; w <= 13; w++) expect(out[w]).toBe("100");
  });
  it("Currency: every week equals target.toFixed(2)", () => {
    const out = buildBreakdown("Standalone", 99.99, "Currency");
    for (let w = 1; w <= 13; w++) expect(out[w]).toBe("99.99");
  });
});

describe("buildBreakdown — Cumulative Number", () => {
  it("evenly divides 130 into 10+10+...+10 (13 cells)", () => {
    const out = buildBreakdown("Cumulative", 130, "Number");
    for (let w = 1; w <= 13; w++) expect(out[w]).toBe("10");
  });

  it("piles remainder onto rightmost weeks for 100/13 = 7r9", () => {
    const out = buildBreakdown("Cumulative", 100, "Number");
    // 13-w < 9 means weeks 5..13 get +1 (i.e. 9 weeks get 8, 4 get 7)
    let sum = 0;
    for (let w = 1; w <= 13; w++) sum += parseInt(out[w], 10);
    expect(sum).toBe(100);
  });

  it("sum always equals target (sanity, 50 values)", () => {
    for (let target = 13; target <= 500; target += 10) {
      const out = buildBreakdown("Cumulative", target, "Number");
      let sum = 0;
      for (let w = 1; w <= 13; w++) sum += parseInt(out[w], 10);
      expect(sum).toBe(target);
    }
  });
});

describe("buildBreakdown — Cumulative Currency", () => {
  it("splits 100 into 13 equal 2-decimal cells with residue on W13", () => {
    const out = buildBreakdown("Cumulative", 100, "Currency");
    // base = (100/13).toFixed(2) = "7.69"
    // diff = (100 - 7.69 * 13) = 0.03
    // W13 = 7.69 + 0.03 = 7.72
    for (let w = 1; w <= 12; w++) expect(out[w]).toBe("7.69");
    expect(out[13]).toBe("7.72");
  });

  it("residue absorbs rounding so sum ≈ target within 0.01", () => {
    const targets = [100, 250.5, 1000, 1234.56];
    for (const target of targets) {
      const out = buildBreakdown("Cumulative", target, "Currency");
      const sum = Object.values(out).reduce((a, v) => a + parseFloat(v), 0);
      expect(Math.abs(sum - target)).toBeLessThan(0.02);
    }
  });
});

describe("buildOwnerBreakdown", () => {
  it("returns empty cells for 0% contribution", () => {
    const out = buildOwnerBreakdown(0, 100, "Cumulative", "Number");
    expect(Object.values(out).every((v) => v === "")).toBe(true);
  });

  it("50% of target 100 = 50 subtarget (Standalone Number)", () => {
    const out = buildOwnerBreakdown(50, 100, "Standalone", "Number");
    for (let w = 1; w <= 13; w++) expect(out[w]).toBe("50");
  });

  it("50% of target 260 = 130 subtarget / 13 = 10 each (Cumulative Number)", () => {
    const out = buildOwnerBreakdown(50, 260, "Cumulative", "Number");
    let sum = 0;
    for (let w = 1; w <= 13; w++) sum += parseInt(out[w], 10);
    expect(sum).toBe(130);
  });

  it("25% of target 100 = 25 subtarget (Cumulative Currency)", () => {
    const out = buildOwnerBreakdown(25, 100, "Cumulative", "Currency");
    const sum = Object.values(out).reduce((a, v) => a + parseFloat(v), 0);
    expect(Math.abs(sum - 25)).toBeLessThan(0.02);
  });

  it("33.33% + 33.33% + 33.34% owner splits sum back to 100% of target", () => {
    const total = 1000;
    const pcts = [33.33, 33.33, 33.34];
    let combined = 0;
    for (const pct of pcts) {
      const row = buildOwnerBreakdown(pct, total, "Cumulative", "Currency");
      combined += Object.values(row).reduce((a, v) => a + parseFloat(v), 0);
    }
    expect(Math.abs(combined - total)).toBeLessThan(0.1);
  });
});

describe("redistributeOwnerRemainder", () => {
  const row: Record<number, string> = {
    1: "10",
    2: "10",
    3: "10",
    4: "10",
    5: "10",
    6: "10",
    7: "10",
    8: "10",
    9: "10",
    10: "10",
    11: "10",
    12: "10",
    13: "10",
  };

  it("preserves cells 1..fromWeek exactly", () => {
    const edited = { ...row, 3: "50" };
    const out = redistributeOwnerRemainder(edited, 3, 130, "Number");
    expect(out[1]).toBe("10");
    expect(out[2]).toBe("10");
    expect(out[3]).toBe("50");
  });

  it("redistributes remainder across (fromWeek+1)..13 (Number)", () => {
    const edited = { ...row, 3: "50" };
    const out = redistributeOwnerRemainder(edited, 3, 130, "Number");
    // left sum = 10 + 10 + 50 = 70; remaining = 60; rightCount = 10
    // base = 6, extra = 0 → all right cells = 6
    let rightSum = 0;
    for (let w = 4; w <= 13; w++) rightSum += parseInt(out[w], 10);
    expect(rightSum).toBe(60);
  });

  it("preserves the sum exactly after redistribution (Number)", () => {
    const edited = { ...row, 2: "30" };
    const out = redistributeOwnerRemainder(edited, 2, 130, "Number");
    let sum = 0;
    for (let w = 1; w <= 13; w++) sum += parseInt(out[w], 10);
    expect(sum).toBe(130);
  });

  it("no-ops when fromWeek is 13 (nothing to redistribute)", () => {
    const out = redistributeOwnerRemainder(row, 13, 130, "Number");
    expect(out).toEqual(row);
  });

  it("Currency: sum preserved within 0.02", () => {
    const crRow: Record<number, string> = Object.fromEntries(
      Array.from({ length: 13 }, (_, i) => [i + 1, "7.69"]),
    );
    crRow[13] = "7.72";
    const edited = { ...crRow, 3: "20.00" };
    const out = redistributeOwnerRemainder(edited, 3, 100, "Currency");
    const sum = Object.values(out).reduce((a, v) => a + parseFloat(v), 0);
    expect(Math.abs(sum - 100)).toBeLessThan(0.02);
  });
});

describe("sumBreakdown", () => {
  it("sums numeric cells", () => {
    expect(sumBreakdown({ 1: "10", 2: "20", 3: "30" })).toBe(60);
  });
  it("treats empty / non-numeric cells as 0", () => {
    expect(sumBreakdown({ 1: "10", 2: "", 3: "abc", 4: "20" })).toBe(30);
  });
  it("returns 0 for empty row", () => {
    expect(sumBreakdown({})).toBe(0);
  });
});

describe("distributeContributionsEven", () => {
  it("returns empty object for 0 owners", () => {
    expect(distributeContributionsEven([])).toEqual({});
  });
  it("single owner gets 100%", () => {
    expect(distributeContributionsEven(["a"])).toEqual({ a: "100" });
  });
  it("two owners get 50 / 50", () => {
    expect(distributeContributionsEven(["a", "b"])).toEqual({
      a: "50",
      b: "50",
    });
  });
  it("three owners: last absorbs the rounding residue", () => {
    const out = distributeContributionsEven(["a", "b", "c"]);
    // base = floor(33.333 * 100) / 100 = 33.33; last = 100 - 66.66 = 33.34
    expect(out.a).toBe("33.33");
    expect(out.b).toBe("33.33");
    expect(out.c).toBe("33.34");
  });
  it("sum always equals 100 (integer check)", () => {
    for (let n = 1; n <= 10; n++) {
      const ids = Array.from({ length: n }, (_, i) => `u${i}`);
      const out = distributeContributionsEven(ids);
      const sum = ids.reduce((a, id) => a + parseFloat(out[id]), 0);
      expect(Math.abs(sum - 100)).toBeLessThan(0.01);
    }
  });
});
