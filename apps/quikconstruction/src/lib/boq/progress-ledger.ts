/**
 * BOQ Progress Ledger
 *
 * Append-only record of DPR → BOQ postings. Authoritative source for
 * cumulative done qty per BOQ leaf. The `subDoneQty` / `selfDoneQty` columns
 * on CnBOQItemV2 are kept in sync inside the same transaction as a cached
 * rollup — all reads should go through them, but the ledger is the truth.
 *
 * Invariants enforced here (spec §12 item #14):
 *   - Only leaf items (is_group = false) accept progress.
 *   - Direction is always +1 for apply, -1 for reverse (compensating entry).
 *   - Cumulative done qty (sub + self) ≤ tender_qty, unless overrideFlag=true.
 *   - BOQ must be locked (V08 inverse — locked BOQ accepts DPR updates; it's
 *     re-imports that are blocked). Actually per spec the lock guards IMPORT,
 *     not progress. Progress is always allowed on existing items.
 *
 * Usage inside a transaction:
 *
 *   await db.$transaction(async (tx) => {
 *     // ... update DPR status ...
 *     await postProgressEntry(tx, ctx, {
 *       projectId, boqNo, qty: 15.5, workType: "sub_contractor", dprId, direction: 1,
 *     });
 *   });
 */

import type { TenantContext } from "@/lib/auth/context";
import { recordAudit } from "@/lib/workflow/audit";

export class ProgressLedgerError extends Error {
  code: string;
  httpStatus: number;
  constructor(code: string, message: string, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.name = "ProgressLedgerError";
  }
}

export interface ProgressPosting {
  projectId: string;
  boqNo: string;
  qty: number; // always positive
  workType: "sub_contractor" | "self";
  direction: 1 | -1;
  dprId?: string;
  dprLineId?: string;
  overrideFlag?: boolean;
  overrideReason?: string;
}

/**
 * Post one progress ledger entry inside an existing Prisma transaction.
 *
 * Atomicity guarantee: ledger row + aggregate update + audit log all in
 * one DB round-trip batch. Caller must ensure the outer `tx` block rolls
 * back if any subsequent step fails.
 */
export async function postProgressEntry(
  tx: any,
  ctx: TenantContext,
  p: ProgressPosting
): Promise<{ ledgerId: string; cumulativeDoneQty: number }> {
  if (p.qty <= 0) {
    throw new ProgressLedgerError("INVALID_QTY", "Progress qty must be positive");
  }

  // Locate the leaf item — must exist, must not be a group, must be in this tenant.
  const item = await tx.cnBOQItemV2.findFirst({
    where: {
      tenantId: ctx.tenantId,
      projectId: p.projectId,
      boqNo: p.boqNo,
      deletedAt: null,
    },
  });
  if (!item) {
    throw new ProgressLedgerError(
      "BOQ_NOT_FOUND",
      `BOQ item ${p.boqNo} not found in project`,
      404
    );
  }
  if (item.isGroup) {
    throw new ProgressLedgerError(
      "GROUP_NOT_ALLOWED",
      `Cannot post progress to group row ${p.boqNo}. Only leaves accept progress.`
    );
  }

  const currentSub = Number(item.subDoneQty.toString());
  const currentSelf = Number(item.selfDoneQty.toString());
  const currentDone = currentSub + currentSelf;
  const tenderQty = item.tenderQty ? Number(item.tenderQty.toString()) : 0;

  const delta = p.direction * p.qty;
  const newSub = p.workType === "sub_contractor" ? currentSub + delta : currentSub;
  const newSelf = p.workType === "self" ? currentSelf + delta : currentSelf;
  const newDone = newSub + newSelf;

  // Negative-balance guard on reversal
  if (newSub < 0 || newSelf < 0) {
    throw new ProgressLedgerError(
      "REVERSAL_UNDERFLOW",
      `Cannot reverse ${p.qty} from ${p.workType}: cumulative would go negative`
    );
  }

  // Over-tender guard (forward posting only — reversals are always allowed)
  if (p.direction === 1 && tenderQty > 0 && newDone > tenderQty && !p.overrideFlag) {
    throw new ProgressLedgerError(
      "EXCEEDS_TENDER",
      `Cumulative done qty ${newDone} would exceed tender qty ${tenderQty} for ${p.boqNo}. ` +
        `Use explicit override workflow to proceed.`
    );
  }

  // Append ledger row
  const ledger = await tx.cnBOQProgressLedger.create({
    data: {
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
      projectId: p.projectId,
      boqItemId: item.id,
      boqNo: p.boqNo,
      category: item.category,
      qty: p.qty,
      direction: p.direction,
      workType: p.workType,
      dprId: p.dprId ?? null,
      dprLineId: p.dprLineId ?? null,
      overrideFlag: p.overrideFlag ?? false,
      overrideReason: p.overrideReason ?? null,
      createdBy: ctx.userId,
    },
  });

  // Update cached aggregate on the BOQ item
  await tx.cnBOQItemV2.update({
    where: { id: item.id },
    data: {
      subDoneQty: newSub,
      selfDoneQty: newSelf,
      updatedBy: ctx.userId,
    },
  });

  // Audit
  await recordAudit(tx, ctx, {
    entityType: "boq_item",
    entityId: item.id,
    action: p.direction === 1 ? "dpr_progress_applied" : "dpr_progress_reversed",
    changes: {
      boqNo: p.boqNo,
      qty: p.qty,
      workType: p.workType,
      dprId: p.dprId,
      beforeDone: currentDone,
      afterDone: newDone,
      override: p.overrideFlag,
    },
  });

  return { ledgerId: ledger.id, cumulativeDoneQty: newDone };
}
