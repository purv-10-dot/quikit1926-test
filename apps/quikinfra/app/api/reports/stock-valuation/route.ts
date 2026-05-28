import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("reports");

/**
 * GET /api/reports/stock-valuation
 *
 * Per (project, location, item): qty = Σ qtyIn − Σ qtyOut.
 * Value approximated as qty × moving-avg rate (weighted avg of inbound rows).
 */
export const GET = withOrgAuth(async ({ orgId }) => {
  const rows = await db.cnStockLedger.groupBy({
    by: ["projectId", "locationId", "itemId", "uomId"],
    where: { orgId },
    _sum: { qtyIn: true, qtyOut: true, amount: true },
  });

  const projectIds = Array.from(new Set(rows.map(r => r.projectId)));
  const locationIds = Array.from(new Set(rows.map(r => r.locationId)));
  const itemIds = Array.from(new Set(rows.map(r => r.itemId)));
  const uomIds = Array.from(new Set(rows.map(r => r.uomId)));

  const [projects, locations, items, uoms] = await Promise.all([
    db.cnProject.findMany({ where: { id: { in: projectIds } }, select: { id: true, code: true, name: true } }),
    db.cnLocation.findMany({ where: { id: { in: locationIds } }, select: { id: true, code: true, name: true } }),
    db.cnItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, code: true, name: true } }),
    db.cnUOM.findMany({ where: { id: { in: uomIds } }, select: { id: true, code: true } }),
  ]);

  // moving-avg rate per (project, location, item)
  const inboundAgg = await db.cnStockLedger.groupBy({
    by: ["projectId", "locationId", "itemId"],
    where: { orgId, qtyIn: { gt: 0 } },
    _sum: { qtyIn: true, amount: true },
  });
  const rateMap = new Map<string, number>();
  for (const a of inboundAgg) {
    const key = `${a.projectId}|${a.locationId}|${a.itemId}`;
    const qi = Number(a._sum.qtyIn ?? 0);
    const val = Number(a._sum.amount ?? 0);
    rateMap.set(key, qi > 0 ? val / qi : 0);
  }

  const out = rows
    .map(r => {
      const qty = Number(r._sum.qtyIn ?? 0) - Number(r._sum.qtyOut ?? 0);
      const rate = rateMap.get(`${r.projectId}|${r.locationId}|${r.itemId}`) ?? 0;
      return {
        projectId: r.projectId, projectName: projects.find(p => p.id === r.projectId)?.name ?? "—",
        locationId: r.locationId, locationName: locations.find(l => l.id === r.locationId)?.name ?? "—",
        itemId: r.itemId, itemCode: items.find(i => i.id === r.itemId)?.code ?? "—", itemName: items.find(i => i.id === r.itemId)?.name ?? "—",
        uomCode: uoms.find(u => u.id === r.uomId)?.code ?? "",
        qty, rate, value: qty * rate,
      };
    })
    .filter(r => Math.abs(r.qty) > 0.0001);

  return NextResponse.json({ success: true, data: out });
});
