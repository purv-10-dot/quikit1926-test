/**
 * Pipeline service — board grouping + weighted-pipeline math.
 *
 * Returns one column per CrmOpportunityStage in STAGE_ORDER. Each column
 * carries: count, totalAmountInr (best-effort INR-only sum for the headline
 * KPI), totalWeightedInr, totalsByCurrency, and the lightweight deal rows.
 *
 * "INR-only" totals reflect only opportunities whose currency is INR. Mixed-
 * currency totals are exposed under `totalsByCurrency` so the UI can render
 * the largest one big and the others as sublabels.
 */
import type { CrmOpportunityStage, Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { STAGE_ORDER, STAGE_LABEL, TERMINAL_STAGES } from "./stage-labels";
import { formatGeneric, toNumber } from "./currency";

const COLUMN_LIMIT = 100;

export type PipelineDeal = {
  id: string;
  name: string;
  accountId: string | null;
  accountName: string | null;
  amount: number | null;
  currency: string;
  amountDisplay: string;
  probability: number;
  weightedAmount: number | null;
  closeDate: Date | null;
  ownerId: string | null;
  ownerName: string | null;
  lastStageChangeAt: Date | null;
  lastActivityAt: Date | null;
  isStale: boolean;
};

export type PipelineColumn = {
  stage: CrmOpportunityStage;
  label: string;
  count: number;
  totalAmountInr: number;
  totalWeightedInr: number;
  totalsByCurrency: Array<{ currency: string; amount: number; display: string }>;
  deals: PipelineDeal[];
};

export type PipelineBoard = {
  columns: PipelineColumn[];
  totalsByCurrency: Array<{ currency: string; amount: number; display: string }>;
  totalPipelineInr: number;
  totalWeightedInr: number;
  thisQuarterForecastInr: number;
  atRisk: {
    stuckDeals: number;
    noActivity7d: number;
    closingThisMonth: number;
  };
};

export async function getPipelineBoard(args: {
  tenantId: string;
  aclFilter: Record<string, unknown> | null;
  /** When set, replaces the default tenant + ACL where (caller merges ACL). */
  where?: Prisma.CrmOpportunityWhereInput;
}): Promise<PipelineBoard> {
  const { tenantId, aclFilter } = args;

  const baseWhere: Prisma.CrmOpportunityWhereInput =
    args.where ??
    ({
      tenantId,
      deletedAt: null,
      ...(aclFilter ? (aclFilter as Prisma.CrmOpportunityWhereInput) : {}),
    } as Prisma.CrmOpportunityWhereInput);

  const rows = await db.crmOpportunity.findMany({
    where: baseWhere,
    select: {
      id: true,
      name: true,
      accountId: true,
      account: { select: { id: true, name: true } },
      stage: true,
      amount: true,
      currency: true,
      probability: true,
      weightedAmount: true,
      closeDate: true,
      ownerId: true,
      ownerName: true,
      lastStageChangeAt: true,
      lastActivityAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const now = Date.now();
  const STALE_MS = 30 * 24 * 60 * 60 * 1000;
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

  const byStage = new Map<CrmOpportunityStage, typeof rows>();
  for (const stage of STAGE_ORDER) byStage.set(stage, []);
  for (const r of rows) byStage.get(r.stage)!.push(r);

  const columns: PipelineColumn[] = STAGE_ORDER.map((stage) => {
    const stageRows = byStage.get(stage)!;

    const byCurrency = new Map<string, number>();
    let totalAmountInr = 0;
    let totalWeightedInr = 0;

    for (const r of stageRows) {
      const amt = toNumber(r.amount);
      const currency = (r.currency ?? "INR").toUpperCase();
      byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + amt);
      if (currency === "INR") {
        totalAmountInr += amt;
        totalWeightedInr += toNumber(r.weightedAmount);
      }
    }

    const deals: PipelineDeal[] = stageRows.slice(0, COLUMN_LIMIT).map((r) => {
      const currency = (r.currency ?? "INR").toUpperCase();
      const amt = r.amount == null ? null : toNumber(r.amount);
      const isStale =
        !TERMINAL_STAGES.has(r.stage) &&
        !!r.lastStageChangeAt &&
        now - r.lastStageChangeAt.getTime() > STALE_MS;
      return {
        id: r.id,
        name: r.name,
        accountId: r.accountId,
        accountName: r.account?.name ?? null,
        amount: amt,
        currency,
        amountDisplay: formatGeneric(amt, currency),
        probability: r.probability,
        weightedAmount: r.weightedAmount == null ? null : toNumber(r.weightedAmount),
        closeDate: r.closeDate,
        ownerId: r.ownerId,
        ownerName: r.ownerName,
        lastStageChangeAt: r.lastStageChangeAt,
        lastActivityAt: r.lastActivityAt,
        isStale,
      };
    });

    const totalsByCurrency = [...byCurrency.entries()]
      .map(([currency, amount]) => ({
        currency,
        amount,
        display: formatGeneric(amount, currency),
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      stage,
      label: STAGE_LABEL[stage],
      count: stageRows.length,
      totalAmountInr,
      totalWeightedInr,
      totalsByCurrency,
      deals,
    };
  });

  // Board-wide aggregates.
  const boardByCurrency = new Map<string, number>();
  for (const c of columns) {
    for (const t of c.totalsByCurrency) {
      boardByCurrency.set(t.currency, (boardByCurrency.get(t.currency) ?? 0) + t.amount);
    }
  }
  const totalsByCurrency = [...boardByCurrency.entries()]
    .map(([currency, amount]) => ({
      currency,
      amount,
      display: formatGeneric(amount, currency),
    }))
    .sort((a, b) => b.amount - a.amount);

  // KPIs: pipeline INR + weighted INR + this-quarter forecast.
  let totalPipelineInr = 0;
  let totalWeightedInr = 0;
  for (const c of columns) {
    totalPipelineInr += c.totalAmountInr;
    totalWeightedInr += c.totalWeightedInr;
  }

  const { qStart, qEnd, mStart, mEnd } = quarterAndMonthBounds(new Date());
  let thisQuarterForecastInr = 0;
  let stuckDeals = 0;
  let noActivity7d = 0;
  let closingThisMonth = 0;

  for (const r of rows) {
    const isClosed = TERMINAL_STAGES.has(r.stage);
    if (
      r.closeDate &&
      r.closeDate >= qStart &&
      r.closeDate < qEnd &&
      !isClosed &&
      (r.currency ?? "INR").toUpperCase() === "INR"
    ) {
      thisQuarterForecastInr += toNumber(r.weightedAmount);
    }
    if (
      !isClosed &&
      r.lastStageChangeAt &&
      now - r.lastStageChangeAt.getTime() > STALE_MS
    ) {
      stuckDeals += 1;
    }
    if (
      !isClosed &&
      (!r.lastActivityAt || now - r.lastActivityAt.getTime() > SEVEN_DAYS)
    ) {
      noActivity7d += 1;
    }
    if (
      !isClosed &&
      r.closeDate &&
      r.closeDate >= mStart &&
      r.closeDate < mEnd
    ) {
      closingThisMonth += 1;
    }
  }

  return {
    columns,
    totalsByCurrency,
    totalPipelineInr,
    totalWeightedInr,
    thisQuarterForecastInr,
    atRisk: { stuckDeals, noActivity7d, closingThisMonth },
  };
}

function quarterAndMonthBounds(now: Date): {
  qStart: Date;
  qEnd: Date;
  mStart: Date;
  mEnd: Date;
} {
  const y = now.getFullYear();
  const m = now.getMonth();
  const qIdx = Math.floor(m / 3);
  const qStart = new Date(y, qIdx * 3, 1);
  const qEnd = new Date(y, qIdx * 3 + 3, 1);
  const mStart = new Date(y, m, 1);
  const mEnd = new Date(y, m + 1, 1);
  return { qStart, qEnd, mStart, mEnd };
}
