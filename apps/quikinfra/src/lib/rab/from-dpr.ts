import type { TenantContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { boqService } from "@/lib/boq";

/**
 * RA Bill — DPR aggregation engine (Phase 2).
 *
 * Turns approved daily progress into a clamped, traceable set of proposed
 * bill lines. The clamp is the guard against double-billing:
 *
 *     billQty = max(0, min(dprQty, executed − billed))
 *
 * where executed = subDoneQty + selfDoneQty (cumulative, approved DPRs) and
 * billed = billedQty (cumulative, approved RABs). A line whose proposed qty
 * was reduced by the clamp is flagged `capped` so the UI can warn that the
 * DPR quantity exceeded the un-billed balance.
 *
 * This is preview-only: it reads, computes, and proposes. Nothing is
 * persisted and the billing ledger is never touched here.
 */

const QTY_DP = 4;
const MONEY_DP = 2;

const roundQty = (n: number): number => Number(n.toFixed(QTY_DP));
const roundMoney = (n: number): number => Number(n.toFixed(MONEY_DP));

export interface RABProposedLine {
  boqItemId: string;
  boqNo: string;
  category: string;
  description: string;
  unit: string;
  uomId: string;
  rate: string;
  /** Total qty posted by DPRs in the period for this item. */
  dprQty: string;
  /** Cumulative executed (sub + self) on the BOQ leaf. */
  executedQty: string;
  /** Cumulative billed on the BOQ leaf. */
  billedQty: string;
  /** Un-billed balance: executed − billed. */
  billableQty: string;
  /** Clamped proposal: min(dprQty, billableQty), never < 0. */
  billQty: string;
  /** billQty * rate. */
  amount: string;
  /** True when billQty < dprQty (proposal reduced to the un-billed balance). */
  capped: boolean;
}

export interface RABDprSource {
  id: string;
  dprNumber: string;
  reportDate: string;
}

export interface FromDprResult {
  lines: RABProposedLine[];
  sources: RABDprSource[];
  /** Sum of proposed line amounts. */
  total: string;
  /** Count of lines reduced by the clamp. */
  cappedLines: number;
  /** No approved DPRs in the period — distinct from "all progress billed". */
  noDprs: boolean;
}

interface ItemAgg {
  qty: number;
  uomId: string;
  description: string;
  dprIds: Set<string>;
}

/**
 * Aggregate approved DPR work in [from, to] for a project into clamped
 * proposed RA bill lines. Org-scoped throughout.
 */
export async function aggregateFromDpr(
  ctx: TenantContext,
  projectId: string,
  from: Date,
  to: Date,
): Promise<FromDprResult> {
  // 1. Approved DPRs in the period, with their work items.
  const dprs = await db.cnDailyProgressReport.findMany({
    where: {
      orgId: ctx.orgId,
      projectId,
      status: "approved",
      reportDate: { gte: from, lte: to },
    },
    select: {
      id: true,
      dprNumber: true,
      reportDate: true,
      workItems: {
        select: {
          boqItemId: true,
          todayQty: true,
          uomId: true,
          description: true,
        },
      },
    },
    orderBy: { reportDate: "asc" },
  });

  if (!dprs.length) {
    return { lines: [], sources: [], total: "0", cappedLines: 0, noDprs: true };
  }

  // 2. Aggregate todayQty by BOQ item + track which DPRs contributed.
  const byItem = new Map<string, ItemAgg>();
  for (const dpr of dprs) {
    for (const wi of dpr.workItems ?? []) {
      const qty = Number(wi.todayQty?.toString() ?? "0");
      if (qty <= 0) continue;
      const agg = byItem.get(wi.boqItemId) ?? {
        qty: 0,
        uomId: wi.uomId ?? "",
        description: wi.description ?? "",
        dprIds: new Set<string>(),
      };
      agg.qty += qty;
      if (!agg.uomId && wi.uomId) agg.uomId = wi.uomId;
      if (!agg.description && wi.description) agg.description = wi.description;
      agg.dprIds.add(dpr.id);
      byItem.set(wi.boqItemId, agg);
    }
  }

  // 3. BOQ leaves (rolled up): executed = done_qty, billed = billed_qty.
  const leaves = await boqService.getLeafItems(ctx, projectId);
  const leafById = new Map<string, (typeof leaves)[number]>();
  for (const l of leaves) leafById.set(l.id, l);

  const lines: RABProposedLine[] = [];
  let total = 0;
  let cappedLines = 0;
  const contributingDprIds = new Set<string>();

  for (const [boqItemId, agg] of byItem) {
    const leaf = leafById.get(boqItemId);
    if (!leaf) continue; // DPR referenced a group / deleted leaf — skip.

    const executed = roundQty(leaf.done_qty ?? 0);
    const billed = roundQty(leaf.billed_qty ?? 0);
    const remaining = roundQty(executed - billed);
    const dprQty = roundQty(agg.qty);
    const billQty = roundQty(Math.max(0, Math.min(dprQty, remaining)));

    if (billQty <= 0) continue; // already fully billed — nothing to propose.

    const rate = Number(leaf.rate ?? 0);
    const amount = roundMoney(billQty * rate);
    const capped = billQty < dprQty;
    if (capped) cappedLines += 1;
    total = roundMoney(total + amount);
    for (const id of agg.dprIds) contributingDprIds.add(id);

    lines.push({
      boqItemId,
      boqNo: leaf.boq_no,
      category: leaf.category ?? "",
      description: leaf.display_name || agg.description || leaf.description || "",
      unit: leaf.unit ?? "",
      uomId: agg.uomId,
      rate: String(rate),
      dprQty: String(dprQty),
      executedQty: String(executed),
      billedQty: String(billed),
      billableQty: String(remaining),
      billQty: String(billQty),
      amount: String(amount),
      capped,
    });
  }

  // Only list DPRs that actually contributed a proposed (non-zero) line.
  const sources: RABDprSource[] = dprs
    .filter((d) => contributingDprIds.has(d.id))
    .map((d) => ({
      id: d.id,
      dprNumber: d.dprNumber,
      reportDate: d.reportDate?.toISOString().slice(0, 10) ?? "",
    }));

  return { lines, sources, total: String(total), cappedLines, noDprs: false };
}
