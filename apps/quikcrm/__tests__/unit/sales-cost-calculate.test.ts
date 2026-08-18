/**
 * Pure cost math for Sales Cost Management. No DB, no session — these are the
 * arithmetic guarantees the feature rests on:
 *
 *   - the worked example from the spec (Rahul, ₹53,000) produces the documented
 *     cost-per-record figures;
 *   - zero counts never produce Infinity or NaN;
 *   - shared tools are charged by allocation share, so they are not
 *     double-counted;
 *   - each rep's figures depend only on their own cost and their own counts.
 */
import { describe, expect, it } from "vitest";
import {
  allocatedCost,
  buildBreakdown,
  computeEfficiency,
  round2,
  safeDivide,
  sumOtherCosts,
  sumToolCosts,
  totalMonthlyCost,
  type ToolCostLine,
} from "@/lib/services/sales-cost/calculate";
import {
  monthlyCostOf,
  overlapsPeriod,
  parsePeriod,
  rangesOverlap,
  resolveVersionForPeriod,
  startOfMonthUtc,
} from "@/lib/services/sales-cost/period";

/** Build a tool line with the derived fields computed the way the service does. */
function tool(
  name: string,
  toolCost: number,
  percentage: number,
  frequency = "monthly",
): ToolCostLine {
  const monthly = round2(monthlyCostOf(toolCost, frequency));
  return {
    allocationId: `alloc-${name}`,
    toolId: `tool-${name}`,
    toolName: name,
    vendor: null,
    category: null,
    toolCost,
    billingFrequency: frequency,
    toolMonthlyCost: monthly,
    percentage,
    allocatedMonthlyCost: allocatedCost(monthly, percentage),
    active: true,
    currency: "INR",
  };
}

describe("safeDivide", () => {
  it("divides normally", () => {
    expect(safeDivide(53000, 100)).toBe(530);
  });

  it("returns null for a zero count instead of Infinity", () => {
    expect(safeDivide(53000, 0)).toBeNull();
  });

  it("returns null for a negative count", () => {
    expect(safeDivide(53000, -5)).toBeNull();
  });

  it("returns null rather than NaN when the total is not finite", () => {
    expect(safeDivide(Number.NaN, 10)).toBeNull();
    expect(safeDivide(Number.POSITIVE_INFINITY, 10)).toBeNull();
  });

  it("rounds to 2 decimal places", () => {
    // 53000 / 40 = 1325 exactly; 53000 / 3 repeats and must not leak float noise.
    expect(safeDivide(53000, 40)).toBe(1325);
    expect(safeDivide(53000, 3)).toBe(17666.67);
  });
});

describe("monthlyCostOf", () => {
  it("passes a monthly cost through", () => {
    expect(monthlyCostOf(8000, "monthly")).toBe(8000);
  });

  it("amortises quarterly and annual costs", () => {
    expect(monthlyCostOf(24000, "quarterly")).toBe(8000);
    expect(monthlyCostOf(96000, "annual")).toBe(8000);
  });

  it("treats a one-time purchase as no recurring monthly cost", () => {
    // Spreading a one-off over an arbitrary window would make cost-per-lead
    // depend on an amortisation period nobody chose.
    expect(monthlyCostOf(50000, "one_time")).toBe(0);
  });
});

describe("allocatedCost — shared tools are not double-counted", () => {
  it("charges the full cost at 100%", () => {
    expect(allocatedCost(8000, 100)).toBe(8000);
  });

  it("splits a shared tool by percentage", () => {
    // The spec's example: a ₹16,000 seat split 50/50 charges ₹8,000 each, so the
    // two reps together carry exactly the tool's real cost — not 2 x ₹16,000.
    expect(allocatedCost(16000, 50)).toBe(8000);
    expect(allocatedCost(16000, 50) * 2).toBe(16000);
  });

  it("handles a three-way split without losing money to rounding drift", () => {
    const share = allocatedCost(16000, 33.333);
    expect(share).toBe(5333.28);
    // Three shares stay under the tool's total; they never exceed it.
    expect(share * 3).toBeLessThanOrEqual(16000);
  });
});

describe("the spec's worked example — Rahul", () => {
  const tools = [
    tool("LinkedIn Sales Navigator", 8000, 100),
    tool("Calling Tool", 3000, 100),
    tool("Email Tool", 2000, 100),
  ];

  it("totals salary + tools + other to ₹53,000", () => {
    expect(sumToolCosts(tools)).toBe(13000);
    expect(sumOtherCosts([])).toBe(0);
    expect(totalMonthlyCost(40000, 13000, 0)).toBe(53000);
  });

  it("produces the documented cost-per-record figures", () => {
    const breakdown = buildBreakdown({
      userId: "u-rahul",
      userName: "Rahul",
      period: "2026-08",
      currency: "INR",
      salary: 40000,
      tools,
      otherCosts: [],
      counts: { leads: 100, prospects: 40, opportunities: 10, wonDeals: 5 },
    });

    expect(breakdown.totalMonthlyCost).toBe(53000);
    expect(breakdown.efficiency).toEqual({
      costPerLead: 530,
      costPerProspect: 1325,
      costPerOpportunity: 5300,
      costPerWonDeal: 10600,
    });
  });

  it("never yields Infinity or NaN when every count is zero", () => {
    const breakdown = buildBreakdown({
      userId: "u-rahul",
      userName: "Rahul",
      period: "2026-08",
      currency: "INR",
      salary: 40000,
      tools,
      otherCosts: [],
      counts: { leads: 0, prospects: 0, opportunities: 0, wonDeals: 0 },
    });

    expect(breakdown.totalMonthlyCost).toBe(53000);
    for (const v of Object.values(breakdown.efficiency)) {
      expect(v).toBeNull();
      expect(Number.isNaN(v as unknown as number)).toBe(false);
    }
  });
});

describe("per-rep attribution — each rep divides their OWN cost by their OWN counts", () => {
  it("gives Rahul and Amit different cost per lead", () => {
    // Straight from the spec's section 7: the company total is never divided by
    // all CRM leads.
    const rahul = computeEfficiency(53000, {
      leads: 100,
      prospects: 40,
      opportunities: 10,
      wonDeals: 5,
    });
    const amit = computeEfficiency(59500, {
      leads: 200,
      prospects: 60,
      opportunities: 20,
      wonDeals: 8,
    });

    expect(rahul.costPerLead).toBe(530);
    expect(amit.costPerLead).toBe(297.5);
    expect(rahul.costPerLead).not.toBe(amit.costPerLead);
  });
});

describe("period ranges — historical months stay stable", () => {
  it("parses YYYY-MM into a half-open UTC month window", () => {
    const p = parsePeriod("2026-08");
    expect(p).not.toBeNull();
    expect(p!.start.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(p!.end.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("rejects malformed period keys rather than guessing", () => {
    expect(parsePeriod("2026-13")).toBeNull();
    expect(parsePeriod("2026-8")).toBeNull();
    expect(parsePeriod("august")).toBeNull();
    expect(parsePeriod("")).toBeNull();
    expect(parsePeriod(undefined)).toBeNull();
  });

  it("snaps any date to the first of its month in UTC", () => {
    expect(startOfMonthUtc(new Date("2026-08-17T14:33:00.000Z")).toISOString()).toBe(
      "2026-08-01T00:00:00.000Z",
    );
  });

  it("treats effectiveTo as exclusive, so a closed row does not bleed into the next month", () => {
    const august = parsePeriod("2026-08")!;
    const september = parsePeriod("2026-09")!;
    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date("2026-09-01T00:00:00.000Z"); // closed at the end of August

    expect(overlapsPeriod(from, to, august)).toBe(true);
    expect(overlapsPeriod(from, to, september)).toBe(false);
  });

  it("keeps an open-ended row active in every later month", () => {
    const from = new Date("2026-08-01T00:00:00.000Z");
    expect(overlapsPeriod(from, null, parsePeriod("2026-08")!)).toBe(true);
    expect(overlapsPeriod(from, null, parsePeriod("2027-03")!)).toBe(true);
    // ...but not before it starts.
    expect(overlapsPeriod(from, null, parsePeriod("2026-07")!)).toBe(false);
  });

  it("detects overlapping ranges for the allocation limit check", () => {
    const jan = new Date("2026-01-01T00:00:00.000Z");
    const jul = new Date("2026-07-01T00:00:00.000Z");
    const sep = new Date("2026-09-01T00:00:00.000Z");

    // [Jan, Jul) and [Jul, Sep) are adjacent, not overlapping — two reps can
    // each hold 100% of a tool in non-overlapping windows.
    expect(rangesOverlap(jan, jul, jul, sep)).toBe(false);
    // [Jan, Sep) and [Jul, null) do overlap.
    expect(rangesOverlap(jan, sep, jul, null)).toBe(true);
    // Two open-ended ranges always overlap.
    expect(rangesOverlap(jan, null, jul, null)).toBe(true);
  });
});

describe("versioned tool prices — historical months never change", () => {
  const iso = (s: string) => new Date(`${s}T00:00:00.000Z`);

  /**
   * The spec's example: a tool at ₹8,000 through August, ₹10,000 from September.
   * Modelled the way setToolPrice writes it — the August version is CLOSED at
   * 2026-09-01 (exclusive) rather than edited.
   */
  const priceHistory = [
    { id: "p1", cost: 8000, effectiveFrom: iso("2026-01-01"), effectiveTo: iso("2026-09-01") },
    { id: "p2", cost: 10000, effectiveFrom: iso("2026-09-01"), effectiveTo: null },
  ];

  it("August resolves to ₹8,000 even after September is repriced", () => {
    const v = resolveVersionForPeriod(priceHistory, parsePeriod("2026-08")!);
    expect(v?.cost).toBe(8000);
  });

  it("September onward resolves to ₹10,000", () => {
    expect(resolveVersionForPeriod(priceHistory, parsePeriod("2026-09")!)?.cost).toBe(10000);
    expect(resolveVersionForPeriod(priceHistory, parsePeriod("2026-10")!)?.cost).toBe(10000);
    // ...and stays there indefinitely, since the version is open-ended.
    expect(resolveVersionForPeriod(priceHistory, parsePeriod("2027-06")!)?.cost).toBe(10000);
  });

  it("every month before the change keeps the old price", () => {
    for (const m of ["2026-01", "2026-04", "2026-07", "2026-08"]) {
      expect(resolveVersionForPeriod(priceHistory, parsePeriod(m)!)?.cost).toBe(8000);
    }
  });

  it("returns null for a month before any version exists", () => {
    // No price configured yet → the tool contributes no cost, rather than
    // silently borrowing a later price.
    expect(resolveVersionForPeriod(priceHistory, parsePeriod("2025-12")!)).toBeNull();
  });

  it("returns null for an empty history", () => {
    expect(resolveVersionForPeriod([], parsePeriod("2026-08")!)).toBeNull();
  });

  it("picks the version starting later when two overlap the same month", () => {
    const overlapping = [
      { id: "old", cost: 8000, effectiveFrom: iso("2026-01-01"), effectiveTo: null },
      { id: "new", cost: 9000, effectiveFrom: iso("2026-08-01"), effectiveTo: null },
    ];
    expect(resolveVersionForPeriod(overlapping, parsePeriod("2026-08")!)?.cost).toBe(9000);
    // ...and July, which only the first version covers, is unaffected.
    expect(resolveVersionForPeriod(overlapping, parsePeriod("2026-07")!)?.cost).toBe(8000);
  });

  it("breaks an identical-effectiveFrom tie by createdAt, not array order", () => {
    // The unique constraint makes this rare, but the result must not depend on
    // the order Prisma returns rows in.
    const sameStart = [
      {
        id: "written-later",
        cost: 9000,
        effectiveFrom: iso("2026-08-01"),
        effectiveTo: null,
        createdAt: iso("2026-08-20"),
      },
      {
        id: "written-first",
        cost: 8000,
        effectiveFrom: iso("2026-08-01"),
        effectiveTo: null,
        createdAt: iso("2026-08-02"),
      },
    ];
    const aug = parsePeriod("2026-08")!;
    expect(resolveVersionForPeriod(sameStart, aug)?.id).toBe("written-later");
    // Reversed input, same answer.
    expect(resolveVersionForPeriod([...sameStart].reverse(), aug)?.id).toBe("written-later");
  });

  it("costs each month at its own price, so a reprice cannot alter a past total", () => {
    // A ₹8,000 seat allocated 50/50 charges ₹4,000/rep in August and ₹5,000 in
    // September — the September change never reaches back into August.
    const aug = resolveVersionForPeriod(priceHistory, parsePeriod("2026-08")!)!;
    const sep = resolveVersionForPeriod(priceHistory, parsePeriod("2026-09")!)!;

    expect(allocatedCost(monthlyCostOf(aug.cost, "monthly"), 50)).toBe(4000);
    expect(allocatedCost(monthlyCostOf(sep.cost, "monthly"), 50)).toBe(5000);
  });

  it("respects a version's own billing frequency, so a basis change is historical too", () => {
    // Monthly ₹8,000 through August, then annual ₹96,000 (= ₹8,000/mo) after.
    // August must keep the monthly basis it was billed on.
    const withBasisChange = [
      {
        id: "p1",
        cost: 8000,
        billingFrequency: "monthly",
        effectiveFrom: iso("2026-01-01"),
        effectiveTo: iso("2026-09-01"),
      },
      {
        id: "p2",
        cost: 96000,
        billingFrequency: "annual",
        effectiveFrom: iso("2026-09-01"),
        effectiveTo: null,
      },
    ];

    const aug = resolveVersionForPeriod(withBasisChange, parsePeriod("2026-08")!)!;
    const sep = resolveVersionForPeriod(withBasisChange, parsePeriod("2026-09")!)!;

    expect(monthlyCostOf(aug.cost, aug.billingFrequency)).toBe(8000);
    expect(monthlyCostOf(sep.cost, sep.billingFrequency)).toBe(8000);
    // Same monthly figure, but reached from different stored amounts.
    expect(aug.cost).not.toBe(sep.cost);
  });
});

describe("round2", () => {
  it("keeps money at 2 decimal places", () => {
    expect(round2(1325.005)).toBe(1325.01);
    expect(round2(8000)).toBe(8000);
  });

  it("coerces a non-finite value to 0 rather than propagating NaN", () => {
    expect(round2(Number.NaN)).toBe(0);
    expect(round2(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
