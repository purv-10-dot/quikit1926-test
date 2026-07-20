/**
 * Labour RA Bill engine (Section 4).
 *
 * Deterministically prices a LABOUR_ONLY work order from the ledgers:
 *
 *   thisBillQty = cumProgress(under this WO) − cumBilled(approved RABs for this WO)
 *
 * Both sides are recomputed from immutable records every run, so regenerating
 * or double-approving can never double-bill: a second run finds
 * cumBilled == cumProgress and produces zero billable quantity.
 *
 * v1 scope: BOQ_ITEM lines (contractor executes BOQ work at a labour rate).
 * LABOUR_CATEGORY day-rate billing needs a category-level billed store and is
 * a follow-up (see notes in the PRD §3.9 / feature-logic §10).
 */

import { db } from "@/lib/db";
import { DomainError } from "@/lib/http";

function round2(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100; }
function round4(n: number): number { return Math.round((n + Number.EPSILON) * 1e4) / 1e4; }

export interface LabourRabLinePreview {
  boqItemId: string;
  boqNo: string;
  description: string;
  uomId: string;
  woQty: number;         // WO line quantity (cap)
  cumProgress: number;   // approved DPR progress under this WO, up to billUpto
  cumBilled: number;     // already billed on approved RABs for this WO
  thisBillQty: number;   // max(cumProgress − cumBilled, 0), capped at woQty
  rate: number;          // WO line labour rate
  amount: number;        // thisBillQty × rate
  clipped: boolean;      // true if capped at woQty (over-execution)
}

export interface LabourRabPreview {
  workOrderId: string;
  woNumber: string;
  contractorId: string;
  billUpto: string;
  lines: LabourRabLinePreview[];
  gross: number;
  retentionPercent: number;
  retentionAmount: number;
  netPayable: number;
  warnings: string[];
}

/** Sum(qty × direction) from the progress ledger for one WO + BOQ item up to a date. */
async function cumProgressForItem(
  orgId: string, projectId: string, workOrderId: string, boqItemId: string, billUptoEnd: Date,
): Promise<number> {
  const grp = await db.cnBOQProgressLedger.groupBy({
    by: ["direction"],
    where: { orgId, projectId, workOrderId, boqItemId, createdAt: { lte: billUptoEnd } },
    _sum: { qty: true },
  });
  let net = 0;
  for (const g of grp) {
    const s = Number(g._sum.qty?.toString() ?? "0");
    net += g.direction * s;
  }
  return round4(net);
}

/** Sum of already-billed qty for this BOQ item across APPROVED RABs for the WO. */
async function cumBilledForItem(
  orgId: string, workOrderId: string, boqItemId: string,
): Promise<number> {
  const approved = await db.cnRunningAccountBill.findMany({
    where: { orgId, woId: workOrderId, status: "approved" },
    select: { id: true },
  });
  if (!approved.length) return 0;
  const agg = await db.cnRABLine.aggregate({
    where: { rabId: { in: approved.map((r) => r.id) }, boqItemId },
    _sum: { currentQty: true },
  });
  return round4(Number(agg._sum.currentQty?.toString() ?? "0"));
}

export async function previewLabourRab(params: {
  orgId: string;
  projectId: string;
  workOrderId: string;
  billUpto: string;
  retentionPercent?: number;
}): Promise<LabourRabPreview> {
  const { orgId, projectId, workOrderId } = params;
  const billUptoStr = String(params.billUpto ?? "").slice(0, 10);
  const billUptoEnd = new Date(`${billUptoStr}T23:59:59.999Z`);
  if (Number.isNaN(billUptoEnd.getTime())) {
    throw new DomainError("VALIDATION", "billUpto must be a valid date", 400);
  }

  const wo = await db.cnWorkOrder.findFirst({
    where: { id: workOrderId, orgId, projectId },
    select: { id: true, woNumber: true, contractorId: true, workType: true, status: true },
  });
  if (!wo) throw new DomainError("WO_NOT_FOUND", "Work order not found", 404);
  if (wo.workType !== "LABOUR_ONLY") {
    throw new DomainError("WO_NOT_LABOUR_ONLY", "Labour RA bill requires a LABOUR_ONLY work order", 400);
  }

  // BOQ-item labour lines on the WO.
  const woLines = await db.cnWorkOrderLine.findMany({
    where: { woId: workOrderId, lineType: "boq" },
    select: { id: true, boqItemId: true, description: true, uomId: true, quantity: true, negotiatedRate: true },
  });

  const boqNoById = new Map<string, { boqNo: string; description: string }>();
  const leaves = await db.cnBOQItemV2.findMany({
    where: { orgId, projectId, id: { in: woLines.map((w) => w.boqItemId) } },
    select: { id: true, boqNo: true, description: true },
  });
  for (const l of leaves) boqNoById.set(l.id, { boqNo: l.boqNo, description: l.description ?? "" });

  const lines: LabourRabLinePreview[] = [];
  const warnings: string[] = [];
  let gross = 0;

  for (const w of woLines) {
    const cumProgress = await cumProgressForItem(orgId, projectId, workOrderId, w.boqItemId, billUptoEnd);
    const cumBilled = await cumBilledForItem(orgId, workOrderId, w.boqItemId);
    const woQty = round4(Number(w.quantity.toString()));
    let thisBillQty = round4(Math.max(cumProgress - cumBilled, 0));

    let clipped = false;
    const remainingWo = round4(woQty - cumBilled);
    if (thisBillQty > remainingWo) {
      thisBillQty = Math.max(remainingWo, 0);
      clipped = true;
      warnings.push(`${boqNoById.get(w.boqItemId)?.boqNo ?? w.boqItemId}: clipped to WO quantity ${woQty}`);
    }
    if (thisBillQty <= 0) continue;

    const rate = round2(Number(w.negotiatedRate.toString()));
    const amount = round2(thisBillQty * rate);
    gross = round2(gross + amount);

    lines.push({
      boqItemId: w.boqItemId,
      boqNo: boqNoById.get(w.boqItemId)?.boqNo ?? "",
      description: w.description ?? boqNoById.get(w.boqItemId)?.description ?? "",
      uomId: w.uomId,
      woQty,
      cumProgress,
      cumBilled,
      thisBillQty,
      rate,
      amount,
      clipped,
    });
  }

  if (!lines.length) {
    throw new DomainError("RAB_NOTHING_TO_BILL", "Nothing to bill — all approved progress under this WO is already billed", 409);
  }

  const retentionPercent = round2(Number(params.retentionPercent ?? 0));
  const retentionAmount = round2((gross * retentionPercent) / 100);
  const netPayable = round2(gross - retentionAmount);

  return {
    workOrderId,
    woNumber: wo.woNumber,
    contractorId: wo.contractorId,
    billUpto: billUptoStr,
    lines,
    gross,
    retentionPercent,
    retentionAmount,
    netPayable,
    warnings,
  };
}
