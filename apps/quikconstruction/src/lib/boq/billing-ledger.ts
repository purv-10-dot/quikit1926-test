/**
 * BOQ Billing Ledger
 *
 * Append-only record of RAB → BOQ postings. Authoritative source for
 * cumulative billed qty per BOQ leaf.
 *
 * Invariants enforced here (spec §12 item #15):
 *   - Only leaf items accept billing.
 *   - billed_qty cumulative cannot exceed cumulative done qty (sub+self),
 *     unless overrideFlag=true. This enforces "you can only bill what has
 *     been executed and approved via DPR".
 *   - Direction: +1 for bill, -1 for reverse.
 */

import type { TenantContext } from "@/lib/auth/context";
import { recordAudit } from "@/lib/workflow/audit";

export class BillingLedgerError extends Error {
  code: string;
  httpStatus: number;
  constructor(code: string, message: string, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.name = "BillingLedgerError";
  }
}

export interface BillingPosting {
  projectId: string;
  boqNo: string;
  qty: number;
  direction: 1 | -1;
  rabId?: string;
  rabLineId?: string;
  overrideFlag?: boolean;
  overrideReason?: string;
}

export async function postBillingEntry(
  tx: any,
  ctx: TenantContext,
  p: BillingPosting
): Promise<{ ledgerId: string; cumulativeBilledQty: number }> {
  if (p.qty <= 0) {
    throw new BillingLedgerError("INVALID_QTY", "Billing qty must be positive");
  }

  const item = await tx.cnBOQItemV2.findFirst({
    where: {
      tenantId: ctx.tenantId,
      projectId: p.projectId,
      boqNo: p.boqNo,
      deletedAt: null,
    },
  });
  if (!item) {
    throw new BillingLedgerError(
      "BOQ_NOT_FOUND",
      `BOQ item ${p.boqNo} not found in project`,
      404
    );
  }
  if (item.isGroup) {
    throw new BillingLedgerError(
      "GROUP_NOT_ALLOWED",
      `Cannot bill group row ${p.boqNo}. Only leaves accept billing.`
    );
  }

  const currentBilled = Number(item.billedQty.toString());
  const currentSub = Number(item.subDoneQty.toString());
  const currentSelf = Number(item.selfDoneQty.toString());
  const cumulativeDone = currentSub + currentSelf;

  const delta = p.direction * p.qty;
  const newBilled = currentBilled + delta;

  if (newBilled < 0) {
    throw new BillingLedgerError(
      "REVERSAL_UNDERFLOW",
      `Cannot reverse ${p.qty}: cumulative billed would go negative`
    );
  }

  // Over-done guard on forward postings — you can only bill executed qty.
  if (p.direction === 1 && newBilled > cumulativeDone && !p.overrideFlag) {
    throw new BillingLedgerError(
      "EXCEEDS_DONE",
      `Cumulative billed qty ${newBilled} would exceed approved done qty ${cumulativeDone} for ${p.boqNo}. ` +
        `Use explicit override workflow to proceed.`
    );
  }

  const ledger = await tx.cnBOQBillingLedger.create({
    data: {
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
      projectId: p.projectId,
      boqItemId: item.id,
      boqNo: p.boqNo,
      category: item.category,
      qty: p.qty,
      direction: p.direction,
      rabId: p.rabId ?? null,
      rabLineId: p.rabLineId ?? null,
      overrideFlag: p.overrideFlag ?? false,
      overrideReason: p.overrideReason ?? null,
      createdBy: ctx.userId,
    },
  });

  await tx.cnBOQItemV2.update({
    where: { id: item.id },
    data: { billedQty: newBilled, updatedBy: ctx.userId },
  });

  await recordAudit(tx, ctx, {
    entityType: "boq_item",
    entityId: item.id,
    action: p.direction === 1 ? "rab_billing_applied" : "rab_billing_reversed",
    changes: {
      boqNo: p.boqNo,
      qty: p.qty,
      rabId: p.rabId,
      beforeBilled: currentBilled,
      afterBilled: newBilled,
      doneQtyAtPosting: cumulativeDone,
      override: p.overrideFlag,
    },
  });

  return { ledgerId: ledger.id, cumulativeBilledQty: newBilled };
}
