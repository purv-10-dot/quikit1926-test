import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("store");

/**
 * GET /api/store/stock-ledger?projectId&locationId&itemId
 *
 * Two modes:
 *   1. No filters → aggregated current balance per (project, location, item)
 *      → returns rows with qtyIn, qtyOut, balance, totalValue.
 *   2. itemId + projectId + locationId → full ledger with row-by-row running
 *      balance (for drill-down / audit view).
 */
export const GET = withTenantAuth(async ({ tenantId }, req) => {
  const projectId = req.nextUrl.searchParams.get("projectId") || undefined;
  const locationId = req.nextUrl.searchParams.get("locationId") || undefined;
  const itemId = req.nextUrl.searchParams.get("itemId") || undefined;
  const drilldown = Boolean(itemId && projectId && locationId);

  if (drilldown) {
    const rows = await db.cnStockLedger.findMany({
      where: { tenantId, projectId, locationId, itemId },
      orderBy: { transactionDate: "asc" },
      include: {
        item: { select: { code: true, name: true } },
        uom: { select: { code: true } },
      },
    });
    let running = 0;
    const withBalance = rows.map((r) => {
      running += Number(r.qtyIn) - Number(r.qtyOut);
      return { ...r, runningBalance: running };
    });
    return NextResponse.json({ success: true, data: withBalance, mode: "drilldown" });
  }

  // Aggregate view: group by project + location + item
  const rows = await db.cnStockLedger.groupBy({
    by: ["projectId", "locationId", "itemId", "uomId"],
    where: {
      tenantId,
      ...(projectId ? { projectId } : {}),
      ...(locationId ? { locationId } : {}),
    },
    _sum: { qtyIn: true, qtyOut: true, amount: true },
  });

  // Resolve project + location + item names in bulk
  const projectIds = [...new Set(rows.map((r) => r.projectId))];
  const locationIds = [...new Set(rows.map((r) => r.locationId))];
  const itemIds = [...new Set(rows.map((r) => r.itemId))];
  const uomIds = [...new Set(rows.map((r) => r.uomId))];
  const [projects, locations, items, uoms] = await Promise.all([
    db.cnProject.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } }),
    db.cnLocation.findMany({ where: { id: { in: locationIds } }, select: { id: true, name: true } }),
    db.cnItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, code: true, name: true } }),
    db.cnUOM.findMany({ where: { id: { in: uomIds } }, select: { id: true, code: true } }),
  ]);
  const byId = <T extends { id: string }>(list: T[]) => Object.fromEntries(list.map((x) => [x.id, x]));
  const pMap = byId(projects);
  const lMap = byId(locations);
  const iMap = byId(items);
  const uMap = byId(uoms);

  const data = rows
    .map((r) => {
      const qtyIn = Number(r._sum.qtyIn ?? 0);
      const qtyOut = Number(r._sum.qtyOut ?? 0);
      const balance = qtyIn - qtyOut;
      return {
        projectId: r.projectId,
        projectName: pMap[r.projectId]?.name ?? "—",
        locationId: r.locationId,
        locationName: lMap[r.locationId]?.name ?? "—",
        itemId: r.itemId,
        itemCode: iMap[r.itemId]?.code ?? "—",
        itemName: iMap[r.itemId]?.name ?? "—",
        uomId: r.uomId,
        uomCode: uMap[r.uomId]?.code ?? "—",
        qtyIn,
        qtyOut,
        balance,
        totalValue: Number(r._sum.amount ?? 0),
      };
    })
    .filter((r) => (itemId ? r.itemId === itemId : true))
    .sort((a, b) => a.itemCode.localeCompare(b.itemCode));

  return NextResponse.json({ success: true, data, mode: "aggregate" });
});
