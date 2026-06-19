/**
 * Stock Ledger Service
 *
 * Single entry point for stock movements. All stock math flows through this
 * file — no route handler, service, or repository is allowed to write to
 * `CnStockLedger` or `CnStockBalance` directly.
 *
 * Invariants enforced here:
 *   1. CnStockLedger is append-only (compensating entries for reversals).
 *   2. CnStockBalance is derived state, kept in sync inside the same txn.
 *   3. Outward postings reject if balance would go negative (except
 *      explicit reconciliation_adj with allowNegative=true).
 *   4. Every posting writes a CnAuditLog row in the same transaction.
 *
 * All methods take a Prisma transaction client (`tx`) so the caller can
 * compose multi-entity atomic operations (e.g. "approve GRN + post all its
 * lines + transition status" is one txn).
 */

import type { Prisma } from "@quikit/database";
import type { TenantContext } from "@/lib/auth/context";
import { recordAudit } from "@/lib/workflow/audit";

export class StockError extends Error {
  code: string;
  httpStatus: number;
  constructor(code: string, message: string, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.name = "StockError";
  }
}

// Canonical ledger transaction types — must match the union documented on
// CnStockLedger.transactionType.
export const LEDGER_TX_TYPES = {
  GRN: "grn",
  ISSUE: "issue",
  RETURN_VENDOR: "return_vendor",
  RETURN_INTERNAL: "return_internal",
  TRANSFER_OUT: "transfer_out",
  TRANSFER_IN: "transfer_in",
  RECONCILIATION_ADJ: "reconciliation_adj",
  OPENING_BALANCE: "opening_balance",
  DPR_CONSUMPTION: "dpr_consumption",
} as const;

export type LedgerTxType = (typeof LEDGER_TX_TYPES)[keyof typeof LEDGER_TX_TYPES];

export interface StockPosting {
  projectId: string;
  locationId: string;
  itemId: string;
  uomId: string;
  qty: number; // always positive — direction is determined by txType
  unitRate: number;
  txType: LedgerTxType;
  refId: string;
  refNumber: string;
  txDate?: Date;
  allowNegative?: boolean; // only reconciliation_adj may set this
}

// ─── Internal helpers ───────────────────────────────────────────────

function isInward(txType: LedgerTxType): boolean {
  return (
    txType === LEDGER_TX_TYPES.GRN ||
    txType === LEDGER_TX_TYPES.RETURN_INTERNAL ||
    txType === LEDGER_TX_TYPES.TRANSFER_IN ||
    txType === LEDGER_TX_TYPES.OPENING_BALANCE
  );
}

function isOutward(txType: LedgerTxType): boolean {
  return (
    txType === LEDGER_TX_TYPES.ISSUE ||
    txType === LEDGER_TX_TYPES.RETURN_VENDOR ||
    txType === LEDGER_TX_TYPES.TRANSFER_OUT ||
    txType === LEDGER_TX_TYPES.DPR_CONSUMPTION
  );
}

// ─── Core posting primitive ─────────────────────────────────────────

/**
 * Post a single ledger entry inside an existing transaction.
 * - Appends one CnStockLedger row.
 * - Upserts the running CnStockBalance.
 * - Writes a CnAuditLog row.
 *
 * Returns the new balance. Throws StockError on negative-balance violations.
 *
 * NB: `tx` must be the Prisma transaction client from `db.$transaction`.
 */
export async function postLedgerEntry(
  tx: Prisma.TransactionClient,
  ctx: TenantContext,
  p: StockPosting
): Promise<{ ledgerId: string; balanceAfter: number }> {
  if (p.qty <= 0) {
    throw new StockError("INVALID_QTY", "Posting qty must be a positive number");
  }

  // Load current balance (or default to 0)
  const existing = await tx.cnStockBalance.findUnique({
    where: {
      projectId_locationId_itemId: {
        projectId: p.projectId,
        locationId: p.locationId,
        itemId: p.itemId,
      },
    },
  });

  const currentQty = existing ? Number(existing.quantity.toString()) : 0;
  const currentAvgRate = existing ? Number(existing.avgRate.toString()) : 0;

  const delta = isInward(p.txType)
    ? p.qty
    : isOutward(p.txType)
    ? -p.qty
    : // reconciliation_adj can be either direction — caller passes signed qty via allowNegative semantics.
      p.qty;

  const newQty = currentQty + delta;

  // Negative-balance guard
  if (newQty < 0 && !(p.txType === LEDGER_TX_TYPES.RECONCILIATION_ADJ && p.allowNegative)) {
    throw new StockError(
      "INSUFFICIENT_STOCK",
      `Insufficient stock: have ${currentQty}, tried to deduct ${p.qty} (${p.txType}) for item ${p.itemId} at location ${p.locationId}`
    );
  }

  // Weighted average rate for inward postings
  let newAvgRate = currentAvgRate;
  if (isInward(p.txType) && newQty > 0) {
    newAvgRate = (currentQty * currentAvgRate + p.qty * p.unitRate) / newQty;
  }

  // Append ledger row
  const ledger = await tx.cnStockLedger.create({
    data: {
      orgId: ctx.orgId,
      projectId: p.projectId,
      locationId: p.locationId,
      itemId: p.itemId,
      transactionType: p.txType,
      transactionRefId: p.refId,
      transactionRefNumber: p.refNumber,
      transactionDate: p.txDate ?? new Date(),
      qtyIn: isInward(p.txType) ? p.qty : 0,
      qtyOut: isOutward(p.txType) ? p.qty : 0,
      unitRate: p.unitRate,
      amount: p.qty * p.unitRate,
      uomId: p.uomId,
      createdBy: ctx.userId,
    },
  });

  // Upsert balance
  await tx.cnStockBalance.upsert({
    where: {
      projectId_locationId_itemId: {
        projectId: p.projectId,
        locationId: p.locationId,
        itemId: p.itemId,
      },
    },
    create: {
      orgId: ctx.orgId,
      projectId: p.projectId,
      locationId: p.locationId,
      itemId: p.itemId,
      quantity: newQty,
      avgRate: newAvgRate,
      lastTxnAt: new Date(),
    },
    update: {
      quantity: newQty,
      avgRate: newAvgRate,
      lastTxnAt: new Date(),
    },
  });

  // Audit
  await recordAudit(tx, ctx, {
    entityType: "stock_ledger",
    entityId: ledger.id,
    action: p.txType,
    changes: {
      projectId: p.projectId,
      locationId: p.locationId,
      itemId: p.itemId,
      qty: p.qty,
      direction: isInward(p.txType) ? "in" : "out",
      refType: p.txType,
      refId: p.refId,
      balanceAfter: newQty,
    },
  });

  return { ledgerId: ledger.id, balanceAfter: newQty };
}

// ─── High-level operations (domain-level entry points) ─────────────

/**
 * Post all lines of a GRN inward. Call this from the GRN approval transaction.
 * GRN approval is the ONLY event that credits inward stock — no other caller
 * is allowed to use `txType: "grn"`.
 */
export async function postGRNInward(
  tx: Prisma.TransactionClient,
  ctx: TenantContext,
  grn: {
    id: string;
    grnNumber: string;
    projectId: string;
    locationId: string;
    lines: Array<{ itemId: string; uomId: string; acceptedQty: number; unitRate: number }>;
  }
): Promise<Array<{ ledgerId: string; itemId: string; balanceAfter: number }>> {
  const results: Array<{ ledgerId: string; itemId: string; balanceAfter: number }> = [];
  for (const line of grn.lines) {
    if (line.acceptedQty <= 0) continue;
    const r = await postLedgerEntry(tx, ctx, {
      projectId: grn.projectId,
      locationId: grn.locationId,
      itemId: line.itemId,
      uomId: line.uomId,
      qty: line.acceptedQty,
      unitRate: line.unitRate,
      txType: LEDGER_TX_TYPES.GRN,
      refId: grn.id,
      refNumber: grn.grnNumber,
    });
    results.push({ ledgerId: r.ledgerId, itemId: line.itemId, balanceAfter: r.balanceAfter });
  }
  return results;
}

/**
 * Post all lines of a Material Issue outward. Call this from the Issue
 * approval transaction. Material issue approval is the ONLY event that
 * deducts stock for consumption.
 */
export async function postMaterialIssueOutward(
  tx: Prisma.TransactionClient,
  ctx: TenantContext,
  issue: {
    id: string;
    issueNumber: string;
    projectId: string;
    locationId: string;
    lines: Array<{ itemId: string; uomId: string; issuedQty: number; unitRate: number }>;
  }
): Promise<Array<{ ledgerId: string; itemId: string; balanceAfter: number }>> {
  const results: Array<{ ledgerId: string; itemId: string; balanceAfter: number }> = [];
  for (const line of issue.lines) {
    if (line.issuedQty <= 0) continue;
    const r = await postLedgerEntry(tx, ctx, {
      projectId: issue.projectId,
      locationId: issue.locationId,
      itemId: line.itemId,
      uomId: line.uomId,
      qty: line.issuedQty,
      unitRate: line.unitRate,
      txType: LEDGER_TX_TYPES.ISSUE,
      refId: issue.id,
      refNumber: issue.issueNumber,
    });
    results.push({ ledgerId: r.ledgerId, itemId: line.itemId, balanceAfter: r.balanceAfter });
  }
  return results;
}

/**
 * Post a single stock-reconciliation adjustment.
 *
 *   signedQty > 0 → surplus found  → qtyIn row,  balance increases
 *   signedQty < 0 → shortage       → qtyOut row, balance decreases
 *   signedQty = 0 → no-op (returns null)
 *
 * Appends the CnStockLedger row AND syncs the CnStockBalance cache in the same
 * txn. Shortages are guarded against the current balance unless `allowNegative`.
 * The adjustment is valued at the location's current moving-average rate, and
 * avgRate is left unchanged (a reconciliation corrects quantity, it does not
 * revalue stock).
 *
 * This exists separately from `postLedgerEntry` because that primitive requires
 * a strictly-positive qty and a fixed in/out direction per txType; a
 * reconciliation carries a SIGNED delta whose direction is per-line.
 */
export async function postReconciliationAdjustment(
  tx: Prisma.TransactionClient,
  ctx: TenantContext,
  p: {
    projectId: string;
    locationId: string;
    itemId: string;
    uomId: string;
    signedQty: number;
    refId: string;
    refNumber: string;
    txDate?: Date;
    allowNegative?: boolean;
  }
): Promise<{ ledgerId: string; balanceAfter: number } | null> {
  if (p.signedQty === 0) return null;

  const existing = await tx.cnStockBalance.findUnique({
    where: {
      projectId_locationId_itemId: {
        projectId: p.projectId,
        locationId: p.locationId,
        itemId: p.itemId,
      },
    },
  });
  const currentQty = existing ? Number(existing.quantity.toString()) : 0;
  const currentAvgRate = existing ? Number(existing.avgRate.toString()) : 0;
  const newQty = currentQty + p.signedQty;

  if (newQty < 0 && !p.allowNegative) {
    throw new StockError(
      "INSUFFICIENT_STOCK",
      `Reconciliation shortage exceeds stock: have ${currentQty}, tried to adjust by ${p.signedQty} for item ${p.itemId} at location ${p.locationId}`
    );
  }

  const ledger = await tx.cnStockLedger.create({
    data: {
      orgId: ctx.orgId,
      projectId: p.projectId,
      locationId: p.locationId,
      itemId: p.itemId,
      transactionType: LEDGER_TX_TYPES.RECONCILIATION_ADJ,
      transactionRefId: p.refId,
      transactionRefNumber: p.refNumber,
      transactionDate: p.txDate ?? new Date(),
      qtyIn: p.signedQty > 0 ? p.signedQty : 0,
      qtyOut: p.signedQty < 0 ? -p.signedQty : 0,
      unitRate: currentAvgRate,
      amount: Math.abs(p.signedQty) * currentAvgRate,
      uomId: p.uomId,
      createdBy: ctx.userId,
    },
  });

  await tx.cnStockBalance.upsert({
    where: {
      projectId_locationId_itemId: {
        projectId: p.projectId,
        locationId: p.locationId,
        itemId: p.itemId,
      },
    },
    create: {
      orgId: ctx.orgId,
      projectId: p.projectId,
      locationId: p.locationId,
      itemId: p.itemId,
      quantity: newQty,
      avgRate: currentAvgRate,
      lastTxnAt: new Date(),
    },
    update: {
      quantity: newQty,
      avgRate: currentAvgRate,
      lastTxnAt: new Date(),
    },
  });

  await recordAudit(tx, ctx, {
    entityType: "stock_ledger",
    entityId: ledger.id,
    action: LEDGER_TX_TYPES.RECONCILIATION_ADJ,
    changes: {
      projectId: p.projectId,
      locationId: p.locationId,
      itemId: p.itemId,
      signedQty: p.signedQty,
      direction: p.signedQty > 0 ? "in" : "out",
      refType: LEDGER_TX_TYPES.RECONCILIATION_ADJ,
      refId: p.refId,
      balanceAfter: newQty,
    },
  });

  return { ledgerId: ledger.id, balanceAfter: newQty };
}

/**
 * Post a DPR's consumed materials outward. Call this from the DPR approval
 * transaction — DPR approval is the only event that deducts stock for
 * on-site material consumption logged on the daily progress report.
 *
 * Unlike a Material Issue (which carries its own issue rate), DPR
 * consumption is valued at the location's current moving-average rate,
 * read from CnStockBalance at post time. The resolved rate/amount per
 * line is returned so the caller can snapshot it onto CnDPRMaterialEntry.
 */
export async function postDPRConsumptionOutward(
  tx: Prisma.TransactionClient,
  ctx: TenantContext,
  dpr: {
    id: string;
    dprNumber: string;
    projectId: string;
    locationId: string;
    lines: Array<{ lineId: string; itemId: string; uomId: string; consumedQty: number }>;
  }
): Promise<
  Array<{ lineId: string; ledgerId: string; itemId: string; unitRate: number; amount: number; balanceAfter: number }>
> {
  const results: Array<{
    lineId: string;
    ledgerId: string;
    itemId: string;
    unitRate: number;
    amount: number;
    balanceAfter: number;
  }> = [];
  for (const line of dpr.lines) {
    if (line.consumedQty <= 0) continue;
    // Value the consumption at the location's current moving-average rate.
    const bal = await tx.cnStockBalance.findUnique({
      where: {
        projectId_locationId_itemId: {
          projectId: dpr.projectId,
          locationId: dpr.locationId,
          itemId: line.itemId,
        },
      },
    });
    const unitRate = bal ? Number(bal.avgRate.toString()) : 0;
    const r = await postLedgerEntry(tx, ctx, {
      projectId: dpr.projectId,
      locationId: dpr.locationId,
      itemId: line.itemId,
      uomId: line.uomId,
      qty: line.consumedQty,
      unitRate,
      txType: LEDGER_TX_TYPES.DPR_CONSUMPTION,
      refId: dpr.id,
      refNumber: dpr.dprNumber,
    });
    results.push({
      lineId: line.lineId,
      ledgerId: r.ledgerId,
      itemId: line.itemId,
      unitRate,
      amount: line.consumedQty * unitRate,
      balanceAfter: r.balanceAfter,
    });
  }
  return results;
}

/** Read current stock balance (outside of any txn). */
export async function getStockBalance(
  db: Prisma.TransactionClient,
  ctx: TenantContext,
  projectId: string,
  locationId: string,
  itemId: string
): Promise<number> {
  const row = await db.cnStockBalance.findUnique({
    where: {
      projectId_locationId_itemId: { projectId, locationId, itemId },
    },
  });
  if (!row || row.orgId !== ctx.orgId) return 0;
  return Number(row.quantity.toString());
}
