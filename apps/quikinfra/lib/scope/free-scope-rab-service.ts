/**
 * FREE_SCOPE RA Bill engine — the activity-anchored parallel of
 * lib/rab/from-dpr.ts.
 *
 * Same clamp guards double-billing:
 *     billQty = max(0, min(dprQty, executed − billed))
 * but executed/billed are derived from the append-only ledgers (activity items
 * have no cached qty columns) and the rate comes from the activity's work-order
 * negotiated rate, falling back to CnActivityItem.rate (no contract
 * baseline exists in FREE_SCOPE mode).
 *
 * aggregateActivityFromDpr is preview-only. postActivityRABLines writes the
 * approved proposal to the billing ledger inside a caller-provided transaction.
 */

import type { Prisma } from "@quikit/database";
import type { TenantContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { boqService } from "@/lib/boq";

const QTY_DP = 4;
const MONEY_DP = 2;
const roundQty = (n: number): number => Number(n.toFixed(QTY_DP));
const roundMoney = (n: number): number => Number(n.toFixed(MONEY_DP));
const decToNum = (d: Prisma.Decimal | null): number =>
  d ? Number(d.toString()) : 0;

export interface FreeScopeRABLine {
  scopeId: string;
  activityCode: string;
  description: string;
  uomId: string;
  rate: string;
  dprQty: string;
  executedQty: string;
  billedQty: string;
  billableQty: string;
  billQty: string;
  amount: string;
  capped: boolean;
}

export interface FreeScopeRABSource {
  id: string;
  dprNumber: string;
  reportDate: string;
}

export interface FreeScopeRABResult {
  lines: FreeScopeRABLine[];
  sources: FreeScopeRABSource[];
  total: string;
  cappedLines: number;
  noDprs: boolean;
}

interface ActivityAgg {
  qty: number;
  uomId: string;
  description: string;
  dprIds: Set<string>;
}

/**
 * Aggregate approved DPR activity work in [from, to] into clamped proposed
 * RA-bill lines. Org-scoped throughout. Preview-only — nothing is persisted.
 */
export async function aggregateActivityFromDpr(
  ctx: TenantContext,
  projectId: string,
  from: Date,
  to: Date
): Promise<FreeScopeRABResult> {
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
          scopeType: true,
          scopeId: true,
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

  const byScope = new Map<string, ActivityAgg>();
  for (const dpr of dprs) {
    for (const wi of dpr.workItems ?? []) {
      if (wi.scopeType !== "ACTIVITY" || !wi.scopeId) continue;
      const qty = Number(wi.todayQty?.toString() ?? "0");
      if (qty <= 0) continue;
      const agg =
        byScope.get(wi.scopeId) ??
        {
          qty: 0,
          uomId: wi.uomId ?? "",
          description: wi.description ?? "",
          dprIds: new Set<string>(),
        };
      agg.qty += qty;
      if (!agg.uomId && wi.uomId) agg.uomId = wi.uomId;
      if (!agg.description && wi.description) agg.description = wi.description;
      agg.dprIds.add(dpr.id);
      byScope.set(wi.scopeId, agg);
    }
  }

  const scopeIds = [...byScope.keys()];
  if (!scopeIds.length) {
    return { lines: [], sources: [], total: "0", cappedLines: 0, noDprs: false };
  }

  // Activity master rows (codes + rate fallback).
  const activities = await db.cnActivityItem.findMany({
    where: { orgId: ctx.orgId, projectId, id: { in: scopeIds } },
    select: {
      id: true,
      activityCode: true,
      description: true,
      uomId: true,
      rate: true,
    },
  });
  const actById = new Map(activities.map((a) => [a.id, a]));

  // WO negotiated rate per activity (first WO line wins); fallback later.
  const woLines = await db.cnWorkOrderLine.findMany({
    where: {
      scopeType: "ACTIVITY",
      scopeId: { in: scopeIds },
      workOrder: { orgId: ctx.orgId, projectId },
    },
    select: { scopeId: true, negotiatedRate: true },
  });
  const woRateByScope = new Map<string, number>();
  for (const wl of woLines) {
    if (wl.scopeId && !woRateByScope.has(wl.scopeId)) {
      woRateByScope.set(wl.scopeId, decToNum(wl.negotiatedRate));
    }
  }

  // Cumulative executed / billed from the append-only ledgers (signed).
  const [prog, bill] = await Promise.all([
    db.cnBOQProgressLedger.groupBy({
      by: ["scopeId", "direction"],
      where: { orgId: ctx.orgId, projectId, scopeType: "ACTIVITY", scopeId: { in: scopeIds } },
      _sum: { qty: true },
    }),
    db.cnBOQBillingLedger.groupBy({
      by: ["scopeId", "direction"],
      where: { orgId: ctx.orgId, projectId, scopeType: "ACTIVITY", scopeId: { in: scopeIds } },
      _sum: { qty: true },
    }),
  ]);

  const executedByScope = new Map<string, number>();
  for (const r of prog) {
    if (!r.scopeId) continue;
    executedByScope.set(
      r.scopeId,
      (executedByScope.get(r.scopeId) ?? 0) + decToNum(r._sum.qty) * r.direction
    );
  }
  const billedByScope = new Map<string, number>();
  for (const r of bill) {
    if (!r.scopeId) continue;
    billedByScope.set(
      r.scopeId,
      (billedByScope.get(r.scopeId) ?? 0) + decToNum(r._sum.qty) * r.direction
    );
  }

  const lines: FreeScopeRABLine[] = [];
  let total = 0;
  let cappedLines = 0;
  const contributing = new Set<string>();

  for (const [scopeId, agg] of byScope) {
    const act = actById.get(scopeId);
    if (!act) continue; // referenced a deleted / unknown activity — skip.

    const executed = roundQty(executedByScope.get(scopeId) ?? 0);
    const billed = roundQty(billedByScope.get(scopeId) ?? 0);
    const remaining = roundQty(executed - billed);
    const dprQty = roundQty(agg.qty);
    const billQty = roundQty(Math.max(0, Math.min(dprQty, remaining)));
    if (billQty <= 0) continue;

    const rate = woRateByScope.get(scopeId) ?? decToNum(act.rate);
    const amount = roundMoney(billQty * rate);
    const capped = billQty < dprQty;
    if (capped) cappedLines += 1;
    total = roundMoney(total + amount);
    for (const id of agg.dprIds) contributing.add(id);

    lines.push({
      scopeId,
      activityCode: act.activityCode,
      description: act.description || agg.description || "",
      uomId: agg.uomId || (act.uomId ?? ""),
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

  const sources: FreeScopeRABSource[] = dprs
    .filter((d) => contributing.has(d.id))
    .map((d) => ({
      id: d.id,
      dprNumber: d.dprNumber,
      reportDate: d.reportDate?.toISOString().slice(0, 10) ?? "",
    }));

  return { lines, sources, total: String(total), cappedLines, noDprs: false };
}

export interface ActivityRABPostLine {
  scopeId: string;
  qty: number;
}

/**
 * Post approved FREE_SCOPE RAB lines to the activity billing ledger. Call
 * inside the RAB-approve transaction, mirroring boqService.applyRABBillingTxn.
 */
export async function postActivityRABLines(
  tx: Prisma.TransactionClient,
  ctx: TenantContext,
  projectId: string,
  lines: ActivityRABPostLine[],
  opts?: { rabId?: string; rabLineId?: string }
): Promise<void> {
  for (const line of lines) {
    if (line.qty <= 0) continue;
    await boqService.applyActivityRABBillingTxn(
      tx,
      ctx,
      projectId,
      line.scopeId,
      line.qty,
      { rabId: opts?.rabId, rabLineId: opts?.rabLineId }
    );
  }
}
