import { prisma } from "@/lib/db/prisma";

export interface ProductAnalyticsBundle {
  quoteLineCount: number;
  orderLineCount: number;
  quotedRevenue: number;
  orderedRevenue: number;
  topQuoteSkus: { sku: string; productName: string; quantity: number; revenue: number }[];
  topOrderSkus: { sku: string; productName: string; quantity: number; revenue: number }[];
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "toNumber" in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v) || 0;
}

export async function buildProductAnalytics(
  orgId: string,
  productId: string,
): Promise<ProductAnalyticsBundle> {
  const [quoteLines, orderLines] = await Promise.all([
    prisma.qcfQuoteLine.findMany({
      where: { orgId, productId },
      select: { sku: true, productName: true, quantity: true, lineTotal: true },
      take: 500,
      orderBy: { createdAt: "desc" },
    }),
    prisma.qcfOrderLine.findMany({
      where: { orgId, productId },
      select: { sku: true, productName: true, quantity: true, lineTotal: true },
      take: 500,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const quotedRevenue = quoteLines.reduce((s, l) => s + toNum(l.lineTotal), 0);
  const orderedRevenue = orderLines.reduce((s, l) => s + toNum(l.lineTotal), 0);

  return {
    quoteLineCount: quoteLines.length,
    orderLineCount: orderLines.length,
    quotedRevenue,
    orderedRevenue,
    topQuoteSkus: aggregateLines(quoteLines).slice(0, 5),
    topOrderSkus: aggregateLines(orderLines).slice(0, 5),
  };
}

function aggregateLines(
  lines: { sku: string | null; productName: string; quantity: unknown; lineTotal: unknown }[],
) {
  const map = new Map<string, { sku: string; productName: string; quantity: number; revenue: number }>();
  for (const l of lines) {
    const key = l.sku ?? l.productName;
    const cur = map.get(key) ?? {
      sku: l.sku ?? "—",
      productName: l.productName,
      quantity: 0,
      revenue: 0,
    };
    cur.quantity += toNum(l.quantity);
    cur.revenue += toNum(l.lineTotal);
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

export async function buildCatalogAnalytics(orgId: string) {
  const [byCategory, topProducts] = await Promise.all([
    prisma.qcfProduct.groupBy({
      by: ["categoryId"],
      where: { orgId, deletedAt: null },
      _count: { id: true },
    }),
    prisma.qcfOrderLine.groupBy({
      by: ["productId"],
      where: { orgId, productId: { not: null } },
      _sum: { lineTotal: true },
      _count: { id: true },
      orderBy: { _sum: { lineTotal: "desc" } },
      take: 10,
    }),
  ]);

  return { byCategory, topProducts };
}
