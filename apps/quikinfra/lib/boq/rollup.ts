/**
 * BOQ Rollup — per Aakar BOQ Import Developer Spec v2.0 §9
 *
 * Computes group totals and computed columns at query time.
 * NEVER stored — always derived from leaf nodes.
 *
 * Algorithm:
 * 1. Build children index: parent_boq_no → child nodes
 * 2. Walk tree bottom-up, aggregating leaf values into group rows
 * 3. Apply computed column formulas (done_qty, balance_qty, completion_pct, etc.)
 */

import type { BOQItem, BOQItemComputed } from "./types";

/**
 * Apply rollup computations to a flat list of BOQ items.
 * Groups receive aggregated values from their descendant leaves.
 * Computed columns (done_qty, balance_qty, etc.) are added to all rows.
 */
export function applyRollup(items: BOQItem[]): BOQItemComputed[] {
  // Build index: boq_no → node
  const byBoqNo = new Map<string, BOQItem>();
  // Build children index: parent_boq_no → children array
  const childrenByParent = new Map<string, BOQItem[]>();

  for (const item of items) {
    byBoqNo.set(item.boq_no, item);
    const pKey = item.parent_boq_no ?? "__root__";
    if (!childrenByParent.has(pKey)) childrenByParent.set(pKey, []);
    childrenByParent.get(pKey)!.push(item);
  }

  // Compute rollups for each item
  // For leaves: use their own values
  // For groups: recursively aggregate all descendant leaf values
  const computedCache = new Map<string, {
    tender_qty: number;
    sub_done_qty: number;
    self_done_qty: number;
    billed_qty: number;
    estimate_amt: number;
    billed_amount: number;
    balance_estimate: number;
  }>();

  function computeFor(item: BOQItem): {
    tender_qty: number;
    sub_done_qty: number;
    self_done_qty: number;
    billed_qty: number;
    estimate_amt: number;
    billed_amount: number;
    balance_estimate: number;
  } {
    if (computedCache.has(item.boq_no)) return computedCache.get(item.boq_no)!;

    if (!item.is_group) {
      // Leaf — use direct values
      const tender = item.tender_qty ?? 0;
      const rate = item.rate ?? 0;
      const sub = item.sub_done_qty ?? 0;
      const self = item.self_done_qty ?? 0;
      const billed = item.billed_qty ?? 0;
      const done = sub + self;
      const balance = tender - done;

      const result = {
        tender_qty: tender,
        sub_done_qty: sub,
        self_done_qty: self,
        billed_qty: billed,
        estimate_amt: tender * rate,
        billed_amount: billed * rate,
        balance_estimate: balance * rate,
      };
      computedCache.set(item.boq_no, result);
      return result;
    }

    // Group — recurse into children
    const children = childrenByParent.get(item.boq_no) ?? [];
    let tender = 0, sub = 0, self = 0, billed = 0, estimateAmt = 0, billedAmt = 0, balEst = 0;

    for (const child of children) {
      const c = computeFor(child);
      tender += c.tender_qty;
      sub += c.sub_done_qty;
      self += c.self_done_qty;
      billed += c.billed_qty;
      estimateAmt += c.estimate_amt;
      billedAmt += c.billed_amount;
      balEst += c.balance_estimate;
    }

    const result = {
      tender_qty: tender,
      sub_done_qty: sub,
      self_done_qty: self,
      billed_qty: billed,
      estimate_amt: estimateAmt,
      billed_amount: billedAmt,
      balance_estimate: balEst,
    };
    computedCache.set(item.boq_no, result);
    return result;
  }

  // Apply computed values to each item
  return items.map(item => {
    const c = computeFor(item);
    const done = c.sub_done_qty + c.self_done_qty;
    const balance = c.tender_qty - done;
    const completionPct = c.tender_qty > 0 ? Math.round((done / c.tender_qty) * 10000) / 100 : 0;

    return {
      ...item,
      // For group rows, replace stored values with rolled-up totals
      tender_qty: item.is_group ? c.tender_qty : item.tender_qty,
      sub_done_qty: c.sub_done_qty,
      self_done_qty: c.self_done_qty,
      billed_qty: c.billed_qty,
      estimate_amt: c.estimate_amt,
      // Computed columns
      done_qty: done,
      balance_qty: balance,
      balance_estimate: c.balance_estimate,
      billed_amount: c.billed_amount,
      completion_pct: completionPct,
      estimate_amt_rollup: c.estimate_amt,
    };
  });
}

/**
 * Compute project-level summary KPIs from BOQ.
 */
export function computeBOQSummary(items: BOQItemComputed[], categoryFilter?: string): {
  contractValue: number;
  executedValue: number;
  billedValue: number;
  balanceValue: number;
  progressPercent: number;
  leafCount: number;
  groupCount: number;
  totalCount: number;
} {
  let filtered = items;
  if (categoryFilter && categoryFilter !== "all") {
    const lc = categoryFilter.toLowerCase();
    filtered = items.filter(i => (i.category ?? "").toLowerCase() === lc);
  }

  const leaves = filtered.filter(i => !i.is_group);
  const groups = filtered.filter(i => i.is_group);

  // Use only LEAF items for top-line sums (group rollups would double-count)
  const contractValue = leaves.reduce((s, i) => s + (i.tender_qty ?? 0) * (i.rate ?? 0), 0);
  const executedValue = leaves.reduce((s, i) => {
    const done = (i.sub_done_qty ?? 0) + (i.self_done_qty ?? 0);
    return s + done * (i.rate ?? 0);
  }, 0);
  const billedValue = leaves.reduce((s, i) => s + (i.billed_qty ?? 0) * (i.rate ?? 0), 0);
  const balanceValue = contractValue - executedValue;
  const progressPercent = contractValue > 0 ? Math.round((executedValue / contractValue) * 10000) / 100 : 0;

  return {
    contractValue: Math.round(contractValue),
    executedValue: Math.round(executedValue),
    billedValue: Math.round(billedValue),
    balanceValue: Math.round(balanceValue),
    progressPercent,
    leafCount: leaves.length,
    groupCount: groups.length,
    totalCount: filtered.length,
  };
}
