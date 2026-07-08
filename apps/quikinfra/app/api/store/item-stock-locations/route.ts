import { requireStoreAction } from "@/lib/auth/requireStoreAction";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";


/**
 * GET /api/store/item-stock-locations?itemId=...&projectId=...
 *
 * Returns per-project, per-location stock balances for an item
 * (optionally scoped to a project).
 *
 * Response:
 * {
 *   itemId: string,
 *   total: number,
 *   locations: Array<{
 *     locationId, locationCode, locationName, type,
 *     projectId, projectCode, projectName, quantity
 *   }>
 * }
 */
export async function GET(req: NextRequest) {
  const ctxOrResp = await requireStoreAction("construction.stock", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const itemId = (searchParams.get("itemId") ?? "").trim();
  const projectId = (searchParams.get("projectId") ?? "").trim();

  if (!itemId) return NextResponse.json({ error: "itemId is required" }, { status: 400 });

  // 1) Candidate locations from the Locations master (so the user always sees
  //    their known sites/warehouses for this item, even when stock is 0).
  const masterLocations = await db.cnLocation.findMany({
    where: { orgId: ctx.orgId, itemIds: { has: itemId } },
    select: { id: true, code: true, name: true, type: true, projectId: true, itemQtyByItemId: true },
  });

  // 2) Quantity from stock balances (authoritative available stock)
  const where: Prisma.CnStockBalanceWhereInput = { orgId: ctx.orgId, itemId };
  if (projectId) where.projectId = projectId;
  const balanceRows = await db.cnStockBalance.findMany({
    where,
    select: { locationId: true, projectId: true, quantity: true },
  });

  type StockEntry = { projectId: string; locationId: string; quantity: number };
  const entryKey = (pId: string, locId: string) => `${pId}|${locId}`;
  const entries = new Map<string, StockEntry>();

  for (const r of balanceRows) {
    const locId = String(r.locationId ?? "");
    const pId = String(r.projectId ?? "");
    if (!locId || !pId) continue;
    const qty = Number(r.quantity?.toString?.() ?? r.quantity ?? 0);
    const key = entryKey(pId, locId);
    const prev = entries.get(key);
    entries.set(key, {
      projectId: pId,
      locationId: locId,
      quantity: (prev?.quantity ?? 0) + qty,
    });
  }

  // Fallback to Location master qty when ledger has no row yet for this project+location+item.
  for (const master of masterLocations) {
    const locId = master.id;
    const pId = String(master.projectId ?? "");
    if (!locId || !pId) continue;
    const key = entryKey(pId, locId);
    if (entries.has(key)) continue;
    const map = master.itemQtyByItemId;
    if (!map || typeof map !== "object" || Array.isArray(map)) continue;
    const raw = (map as Record<string, unknown>)[itemId];
    const n = raw === null || raw === undefined || String(raw).trim() === "" ? NaN : Number(raw);
    if (!Number.isFinite(n)) continue;
    entries.set(key, { projectId: pId, locationId: locId, quantity: n });
  }

  const locationIds = Array.from(new Set([...entries.values()].map((e) => e.locationId)));
  const projectIds = Array.from(new Set([...entries.values()].map((e) => e.projectId)));

  const [locRows, projectRows] = await Promise.all([
    locationIds.length > 0
      ? db.cnLocation.findMany({
          where: { orgId: ctx.orgId, id: { in: locationIds } },
          select: { id: true, code: true, name: true, type: true, projectId: true },
        })
      : Promise.resolve([]),
    projectIds.length > 0
      ? db.cnProject.findMany({
          where: { orgId: ctx.orgId, id: { in: projectIds } },
          select: { id: true, code: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const locById = new Map(locRows.map((l) => [l.id, l]));
  const projectById = new Map(projectRows.map((p) => [p.id, p]));

  const locations = [...entries.values()]
    .map(({ projectId: pId, locationId, quantity }) => {
      const loc = locById.get(locationId) ?? null;
      const project = projectById.get(pId) ?? null;
      return {
        locationId,
        locationCode: loc?.code ?? "",
        locationName: loc?.name ?? "",
        type: loc?.type ?? "",
        projectId: pId,
        projectCode: project?.code ?? "",
        projectName: project?.name ?? "",
        quantity,
      };
    })
    .sort((a, b) => b.quantity - a.quantity);

  const total = locations.reduce((s, r) => s + (Number.isFinite(r.quantity) ? r.quantity : 0), 0);
  return NextResponse.json({ itemId, total, locations });
}
