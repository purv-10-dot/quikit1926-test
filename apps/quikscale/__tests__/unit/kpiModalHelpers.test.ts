import { describe, it, expect } from "vitest";
import {
  fmtBreakdown,
  buildBreakdown,
  buildOwnerBreakdown,
  redistributeOwnerRemainder,
  redistributeFromCurrentWeek,
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
  it("Number: every week equals the target when no past (firstEditableWeek=1)", () => {
    const out = buildBreakdown("Standalone", 100, "Number");
    expect(Object.keys(out)).toHaveLength(13);
    for (let w = 1; w <= 13; w++) expect(out[w]).toBe("100");
  });
  it("Currency: every week equals target.toFixed(2) when no past", () => {
    const out = buildBreakdown("Standalone", 99.99, "Currency");
    for (let w = 1; w <= 13; w++) expect(out[w]).toBe("99.99");
  });
  it("Number: past weeks default to 0; current..13 hold the full target", () => {
    // currentWeek=5 → weeks 1..4 = 0, weeks 5..13 = 100
    const out = buildBreakdown("Standalone", 100, "Number", 5);
    for (let w = 1; w <= 4; w++) expect(out[w]).toBe("0");
    for (let w = 5; w <= 13; w++) expect(out[w]).toBe("100");
  });
  it("Currency: past weeks default to 0.00; current..13 hold the full target", () => {
    const out = buildBreakdown("Standalone", 50, "Currency", 4);
    for (let w = 1; w <= 3; w++) expect(out[w]).toBe("0.00");
    for (let w = 4; w <= 13; w++) expect(out[w]).toBe("50.00");
  });
});

describe("buildBreakdown — Cumulative Number", () => {
  it("evenly divides 130 into 10+10+...+10 (13 cells)", () => {
    const out = buildBreakdown("Cumulative", 130, "Number");
    for (let w = 1; w <= 13; w++) expect(out[w]).toBe("10");
  });

  it("puts entire flooring residue on Week 13 for 100/13 = 7 r9", () => {
    const out = buildBreakdown("Cumulative", 100, "Number");
    // base = floor(100/13) = 7. Weeks 1..12 = 7 each (= 84). Week 13 = 100 - 84 = 16.
    for (let w = 1; w <= 12; w++) expect(out[w]).toBe("7");
    expect(out[13]).toBe("16");
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

  it("blocks past weeks at 0 and splits across [firstEditableWeek..13] with residue on Week 13", () => {
    // currentWeek = 5 → editable weeks 5..13 (9 weeks). target = 50.
    // base = floor(50/9) = 5. Weeks 5..12 = 5 (= 40). Week 13 = 50 - 40 = 10.
    const out = buildBreakdown("Cumulative", 50, "Number", 5);
    for (let w = 1; w <= 4; w++) expect(out[w]).toBe("0");
    for (let w = 5; w <= 12; w++) expect(out[w]).toBe("5");
    expect(out[13]).toBe("10");
    let sum = 0;
    for (let w = 1; w <= 13; w++) sum += parseInt(out[w], 10);
    expect(sum).toBe(50);
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

  it("50% of target 100 = 50 subtarget (Standalone Number, no past)", () => {
    const out = buildOwnerBreakdown(50, 100, "Standalone", "Number");
    for (let w = 1; w <= 13; w++) expect(out[w]).toBe("50");
  });

  it("Standalone owner row: past weeks default to 0; current..13 = sub-target", () => {
    // currentWeek=4, owner contribution 50%, total target 100 → sub-target 50
    const out = buildOwnerBreakdown(50, 100, "Standalone", "Number", 4);
    for (let w = 1; w <= 3; w++) expect(out[w]).toBe("0");
    for (let w = 4; w <= 13; w++) expect(out[w]).toBe("50");
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

describe("redistributeFromCurrentWeek — preserve past, redistribute remainder", () => {
  it("preserves past-week cells exactly (Number, currentWeek=5)", () => {
    const current: Record<number, string> = {
      1: "10", 2: "10", 3: "10", 4: "10",
      // current+future may be anything — we expect them overwritten
      5: "0", 6: "0", 7: "0", 8: "0", 9: "0", 10: "0", 11: "0", 12: "0", 13: "0",
    };
    // newTarget=100, past sum=40, remaining=60, editableCount=9
    // base=floor(60/9)=6, week13=60-6*8=12
    const out = redistributeFromCurrentWeek(current, 100, "Cumulative", "Number", 5);
    expect(out[1]).toBe("10");
    expect(out[2]).toBe("10");
    expect(out[3]).toBe("10");
    expect(out[4]).toBe("10");
    for (let w = 5; w <= 12; w++) expect(out[w]).toBe("6");
    expect(out[13]).toBe("12");
    let sum = 0;
    for (let w = 1; w <= 13; w++) sum += parseInt(out[w], 10);
    expect(sum).toBe(100);
  });

  it("overwrites already-filled current/future weeks (per spec)", () => {
    const current: Record<number, string> = {
      1: "5", 2: "5", 3: "5",
      4: "100", 5: "100", 6: "100", // these should be wiped and redistributed
      7: "", 8: "", 9: "", 10: "", 11: "", 12: "", 13: "",
    };
    // currentWeek=4, target=80, past=15, remaining=65, editableCount=10
    // base=floor(65/10)=6, week13=65-6*9=11
    const out = redistributeFromCurrentWeek(current, 80, "Cumulative", "Number", 4);
    expect(out[1]).toBe("5");
    expect(out[2]).toBe("5");
    expect(out[3]).toBe("5");
    for (let w = 4; w <= 12; w++) expect(out[w]).toBe("6");
    expect(out[13]).toBe("11");
    let sum = 0;
    for (let w = 1; w <= 13; w++) sum += parseInt(out[w], 10);
    expect(sum).toBe(80);
  });

  it("clamps remaining to 0 when past already exceeds new target", () => {
    const current: Record<number, string> = {
      1: "50", 2: "50", 3: "50", 4: "50",
      5: "0", 6: "0", 7: "0", 8: "0", 9: "0", 10: "0", 11: "0", 12: "0", 13: "0",
    };
    // past=200, newTarget=100 → remaining=0 → all current/future weeks=0
    const out = redistributeFromCurrentWeek(current, 100, "Cumulative", "Number", 5);
    for (let w = 1; w <= 4; w++) expect(out[w]).toBe("50");
    for (let w = 5; w <= 13; w++) expect(out[w]).toBe("0");
  });

  it("Currency: 2-decimal split with residue on Week 13", () => {
    const current: Record<number, string> = {
      1: "10.00", 2: "10.00",
      3: "", 4: "", 5: "", 6: "", 7: "", 8: "", 9: "", 10: "", 11: "", 12: "", 13: "",
    };
    // currentWeek=3, target=100, past=20, remaining=80, editableCount=11
    // base=(80/11).toFixed(2)=7.27, sum=7.27*11=79.97, diff=0.03, W13=7.30
    const out = redistributeFromCurrentWeek(current, 100, "Cumulative", "Currency", 3);
    expect(out[1]).toBe("10.00");
    expect(out[2]).toBe("10.00");
    for (let w = 3; w <= 12; w++) expect(out[w]).toBe("7.27");
    expect(out[13]).toBe("7.30");
    const sum = Object.values(out).reduce((a, v) => a + parseFloat(v), 0);
    expect(Math.abs(sum - 100)).toBeLessThan(0.02);
  });

  it("returns 13 empty cells when target is 0", () => {
    const out = redistributeFromCurrentWeek({ 1: "10", 2: "20" } as any, 0, "Cumulative", "Number", 3);
    for (let w = 1; w <= 13; w++) expect(out[w]).toBe("");
  });

  it("Standalone: past weeks reset to 0; current..13 = full target", () => {
    const current: Record<number, string> = { 1: "999", 2: "999", 3: "" } as any;
    const out = redistributeFromCurrentWeek(current, 50, "Standalone", "Number", 3);
    expect(out[1]).toBe("0");
    expect(out[2]).toBe("0");
    for (let w = 3; w <= 13; w++) expect(out[w]).toBe("50");
  });

  it("firstEditableWeek=1 (no past) behaves like buildBreakdown", () => {
    const empty: Record<number, string> = {};
    for (let w = 1; w <= 13; w++) empty[w] = "";
    const out = redistributeFromCurrentWeek(empty, 100, "Cumulative", "Number", 1);
    // base=7, weeks 1..12=7, week 13=16
    for (let w = 1; w <= 12; w++) expect(out[w]).toBe("7");
    expect(out[13]).toBe("16");
  });

  it("Edit-mode scenario: target raised 500→1000 with past values from DB", () => {
    // KPI loaded with target=500, evenly split (weeks 1..12=38, week 13=44).
    // currentWeek=4 → past = weeks 1..3 (= 38*3 = 114).
    const dbBreakdown: Record<number, string> = {
      1: "38", 2: "38", 3: "38",
      4: "38", 5: "38", 6: "38", 7: "38", 8: "38", 9: "38",
      10: "38", 11: "38", 12: "38", 13: "44",
    };
    const out = redistributeFromCurrentWeek(dbBreakdown, 1000, "Cumulative", "Number", 4);
    // past preserved: weeks 1..3 = 38 each
    for (let w = 1; w <= 3; w++) expect(out[w]).toBe("38");
    // remaining = 1000 - 114 = 886; editableCount = 10
    // base = floor(886/10) = 88; week13 = 886 - 88*9 = 94
    for (let w = 4; w <= 12; w++) expect(out[w]).toBe("88");
    expect(out[13]).toBe("94");
    let sum = 0;
    for (let w = 1; w <= 13; w++) sum += parseInt(out[w], 10);
    expect(sum).toBe(1000);
  });

  it("Edit-mode scenario: target lowered 1000→500 keeps past intact, current/future shrink", () => {
    const dbBreakdown: Record<number, string> = {
      1: "100", 2: "100", 3: "100",
      4: "100", 5: "100", 6: "100", 7: "100", 8: "100",
      9: "100", 10: "100", 11: "100", 12: "100", 13: "100",
    };
    const out = redistributeFromCurrentWeek(dbBreakdown, 500, "Cumulative", "Number", 4);
    for (let w = 1; w <= 3; w++) expect(out[w]).toBe("100");
    // remaining = 500 - 300 = 200; editableCount = 10
    // base = 20, week13 = 200 - 20*9 = 20
    for (let w = 4; w <= 13; w++) expect(out[w]).toBe("20");
  });

  it("Edit-mode: 5.7 per editable week → 5 each, decimals on Week 13", () => {
    // user's exact phrasing: "if the divide value is 5.7 in week 5..13
    // then all weeks divided in 5 and decimals add in last week 13"
    const empty: Record<number, string> = {};
    for (let w = 1; w <= 13; w++) empty[w] = "0";
    // currentWeek=5, target=51.3 → editable=9, per-week=5.7
    // Number floor base=5, weeks 5..12 = 5 (40 total), week13 = 51 - 40 = 11
    // (51 because Math.round(51.3 - 5*8) = Math.round(11.3) = 11)
    const out = redistributeFromCurrentWeek(empty, 51.3, "Cumulative", "Number", 5);
    for (let w = 1; w <= 4; w++) expect(out[w]).toBe("0");
    for (let w = 5; w <= 12; w++) expect(out[w]).toBe("5");
    expect(out[13]).toBe("11");
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
