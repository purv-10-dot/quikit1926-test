import { describe, it, expect } from "vitest";
import { applyRollup, computeBOQSummary } from "@/lib/boq/rollup";
import type { BOQItem } from "@/lib/boq/types";

function item(over: Partial<BOQItem> & { boq_no: string }): BOQItem {
  return {
    id: over.boq_no,
    project_id: "p1",
    category: "Civil Building",
    parent_boq_no: null,
    depth: 0,
    sort_order: 0,
    is_group: false,
    display_name: over.boq_no,
    description: "",
    unit: null,
    tender_qty: null,
    rate: null,
    estimate_amt: 0,
    scope_qty: 0,
    sub_done_qty: 0,
    self_done_qty: 0,
    billed_qty: 0,
    start_date: null,
    end_date: null,
    is_negative: false,
    source_sheet: "Civil",
    import_batch_id: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

describe("applyRollup — leaf computations", () => {
  it("computes done_qty, balance_qty, estimate_amt, billed_amount, completion_pct for a leaf", () => {
    const [leaf] = applyRollup([
      item({ boq_no: "1.1", tender_qty: 100, rate: 10, sub_done_qty: 30, self_done_qty: 20, billed_qty: 40 }),
    ]);
    expect(leaf.done_qty).toBe(50);
    expect(leaf.balance_qty).toBe(50);
    expect(leaf.estimate_amt).toBe(1000);     // 100*10
    expect(leaf.billed_amount).toBe(400);      // 40*10
    expect(leaf.balance_estimate).toBe(500);   // 50*10
    expect(leaf.completion_pct).toBe(50);      // 50/100*100
  });

  it("guards completion_pct against divide-by-zero (tender 0 -> 0)", () => {
    const [leaf] = applyRollup([item({ boq_no: "1.1", tender_qty: 0, rate: 5 })]);
    expect(leaf.completion_pct).toBe(0);
  });
});

describe("applyRollup — group aggregation", () => {
  it("rolls leaf totals up into the parent group", () => {
    const rows = applyRollup([
      item({ boq_no: "1", is_group: true, depth: 0 }),
      item({ boq_no: "1.1", parent_boq_no: "1", depth: 1, tender_qty: 100, rate: 10, sub_done_qty: 10, self_done_qty: 5 }),
      item({ boq_no: "1.2", parent_boq_no: "1", depth: 1, tender_qty: 50, rate: 20, sub_done_qty: 0, self_done_qty: 25 }),
    ]);
    const group = rows.find((r) => r.boq_no === "1")!;
    expect(group.tender_qty).toBe(150);                 // 100 + 50
    expect(group.estimate_amt).toBe(100 * 10 + 50 * 20); // 2000
    expect(group.done_qty).toBe(10 + 5 + 25);            // 40
    expect(group.sub_done_qty).toBe(10);
    expect(group.self_done_qty).toBe(30);
  });

  it("aggregates recursively through nested groups", () => {
    const rows = applyRollup([
      item({ boq_no: "1", is_group: true }),
      item({ boq_no: "1.1", is_group: true, parent_boq_no: "1", depth: 1 }),
      item({ boq_no: "1.1.1", parent_boq_no: "1.1", depth: 2, tender_qty: 10, rate: 100, sub_done_qty: 5 }),
    ]);
    const top = rows.find((r) => r.boq_no === "1")!;
    const mid = rows.find((r) => r.boq_no === "1.1")!;
    expect(mid.estimate_amt).toBe(1000);
    expect(top.estimate_amt).toBe(1000);
    expect(top.done_qty).toBe(5);
  });

  it("leaves a leaf's own tender_qty untouched but replaces a group's with the rollup", () => {
    const rows = applyRollup([
      item({ boq_no: "1", is_group: true, tender_qty: 999 }), // stored value ignored for groups
      item({ boq_no: "1.1", parent_boq_no: "1", depth: 1, tender_qty: 7, rate: 1 }),
    ]);
    expect(rows.find((r) => r.boq_no === "1")!.tender_qty).toBe(7);
    expect(rows.find((r) => r.boq_no === "1.1")!.tender_qty).toBe(7);
  });
});

describe("computeBOQSummary", () => {
  const computed = applyRollup([
    item({ boq_no: "1", is_group: true }),
    item({ boq_no: "1.1", parent_boq_no: "1", depth: 1, tender_qty: 100, rate: 10, sub_done_qty: 20, self_done_qty: 30, billed_qty: 40 }),
    item({ boq_no: "1.2", parent_boq_no: "1", depth: 1, tender_qty: 50, rate: 20, sub_done_qty: 10, self_done_qty: 0, billed_qty: 5 }),
  ]);

  it("sums only leaves to avoid double-counting group rollups", () => {
    const s = computeBOQSummary(computed);
    expect(s.contractValue).toBe(100 * 10 + 50 * 20);             // 2000
    expect(s.executedValue).toBe((20 + 30) * 10 + (10 + 0) * 20); // 700
    expect(s.billedValue).toBe(40 * 10 + 5 * 20);                 // 500
    expect(s.balanceValue).toBe(2000 - 700);                      // 1300
    expect(s.progressPercent).toBe(35);                          // 700/2000*100
    expect(s.leafCount).toBe(2);
    expect(s.groupCount).toBe(1);
    expect(s.totalCount).toBe(3);
  });

  it("filters by category when a non-'all' filter is given", () => {
    const mixed = applyRollup([
      item({ boq_no: "1.1", category: "Civil Building", tender_qty: 10, rate: 1 }),
      item({ boq_no: "2.1", category: "Electrical", tender_qty: 100, rate: 1 }),
    ]);
    const s = computeBOQSummary(mixed, "Civil Building");
    expect(s.contractValue).toBe(10);
    expect(s.totalCount).toBe(1);
  });

  it("returns zero progress when there is no contract value", () => {
    const s = computeBOQSummary(applyRollup([item({ boq_no: "1.1", tender_qty: 0, rate: 0 })]));
    expect(s.progressPercent).toBe(0);
    expect(s.contractValue).toBe(0);
  });
});
