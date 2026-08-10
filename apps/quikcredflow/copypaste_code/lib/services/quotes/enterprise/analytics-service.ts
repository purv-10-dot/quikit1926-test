import { db } from "@/lib/db";
import { toNumber } from "@/lib/services/quotes/decimal";

export interface QuoteAnalyticsDashboard {
  quotesSent: number;
  winRatePct: number;
  avgDealSize: number;
  avgApprovalDelayHours: number;
  expiringThisWeek: number;
  topProducts: { productName: string; revenue: number; count: number }[];
  topReps: { ownerName: string; wonCount: number; wonRevenue: number }[];
  funnel: { status: string; count: number; value: number }[];
  forecastPipeline: number;
}

export async function getQuoteAnalytics(tenantId: string): Promise<QuoteAnalyticsDashboard> {
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 86_400_000);

  const [byStatus, sentCount, wonRows, expiring, lineAgg, approvalDelays] =
    await Promise.all([
      db.crmQuote.groupBy({
        by: ["status"],
        where: { tenantId, deletedAt: null },
        _count: { _all: true },
        _sum: { grandTotal: true },
      }),
      db.crmQuote.count({
        where: { tenantId, deletedAt: null, sentAt: { not: null } },
      }),
      db.crmQuote.findMany({
        where: { tenantId, deletedAt: null, status: "Won" },
        select: { grandTotal: true, ownerName: true },
      }),
      db.crmQuote.count({
        where: {
          tenantId,
          deletedAt: null,
          status: "Active",
          effectiveTo: { gte: now, lte: weekEnd },
        },
      }),
      db.crmQuoteLine.findMany({
        where: {
          tenantId,
          quote: { status: { in: ["Active", "Won"] }, deletedAt: null },
        },
        select: { productName: true, lineTotal: true },
        take: 500,
      }),
      db.crmQuoteApproval.findMany({
        where: { tenantId, status: "Approved", decidedAt: { not: null } },
        select: { requestedAt: true, decidedAt: true },
        take: 200,
      }),
    ]);

  const funnel = byStatus.map((r) => ({
    status: r.status,
    count: r._count._all,
    value: toNumber(r._sum.grandTotal),
  }));

  const active = byStatus.find((r) => r.status === "Active")?._count._all ?? 0;
  const won = byStatus.find((r) => r.status === "Won")?._count._all ?? 0;
  const lost = byStatus.find((r) => r.status === "Lost")?._count._all ?? 0;
  const closed = won + lost;
  const winRatePct = closed > 0 ? Math.round((won / closed) * 1000) / 10 : 0;

  const avgDealSize =
    wonRows.length > 0
      ? wonRows.reduce((s, q) => s + toNumber(q.grandTotal), 0) / wonRows.length
      : 0;

  let avgApprovalDelayHours = 0;
  if (approvalDelays.length > 0) {
    const totalMs = approvalDelays.reduce((s, a) => {
      if (!a.decidedAt) return s;
      return s + (a.decidedAt.getTime() - a.requestedAt.getTime());
    }, 0);
    avgApprovalDelayHours = Math.round(totalMs / approvalDelays.length / 3_600_000);
  }

  const repMap = new Map<string, { wonCount: number; wonRevenue: number }>();
  for (const q of wonRows) {
    const name = q.ownerName ?? "Unassigned";
    const cur = repMap.get(name) ?? { wonCount: 0, wonRevenue: 0 };
    cur.wonCount += 1;
    cur.wonRevenue += toNumber(q.grandTotal);
    repMap.set(name, cur);
  }
  const topReps = [...repMap.entries()]
    .map(([ownerName, v]) => ({ ownerName, ...v }))
    .sort((a, b) => b.wonRevenue - a.wonRevenue)
    .slice(0, 5);

  const productMap = new Map<string, { revenue: number; count: number }>();
  for (const row of lineAgg) {
    const cur = productMap.get(row.productName) ?? { revenue: 0, count: 0 };
    cur.revenue += toNumber(row.lineTotal);
    cur.count += 1;
    productMap.set(row.productName, cur);
  }
  const topProducts = [...productMap.entries()]
    .map(([productName, v]) => ({ productName, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const forecastPipeline = byStatus
    .filter((r) => r.status === "Active" || r.status === "Draft")
    .reduce((s, r) => s + toNumber(r._sum.grandTotal), 0);

  return {
    quotesSent: sentCount,
    winRatePct,
    avgDealSize: Math.round(avgDealSize),
    avgApprovalDelayHours,
    expiringThisWeek: expiring,
    topProducts,
    topReps,
    funnel,
    forecastPipeline,
  };
}
