import { requireStoreAction } from "@/lib/auth/requireStoreAction";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";


/**
 * GET /api/store/item-stock-locations?itemId=...&projectId=...
 *
 * Returns per-location stock balances for an item (optionally scoped to a project).
 *
 * Response:
 * {
 *   itemId: string,
 *   total: number,
 *   locations: Array<{ locationId, locationCode, locationName, type, projectId, quantity }>
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

  const qtyByLocationId = new Map<string, number>();
  for (const r of balanceRows) {
    const locId = String(r.locationId ?? "");
    if (!locId) continue;
    const qty = Number(r.quantity?.toString?.() ?? r.quantity ?? 0);
    qtyByLocationId.set(locId, (qtyByLocationId.get(locId) ?? 0) + qty);
  }

  const locationIds = Array.from(
    new Set([
      ...masterLocations.map((l) => l.id),
      ...balanceRows.map((r) => r.locationId).filter(Boolean),
    ]),
  );

  const locRows =
    locationIds.length > 0
      ? await db.cnLocation.findMany({
          where: { orgId: ctx.orgId, id: { in: locationIds } },
          select: { id: true, code: true, name: true, type: true, projectId: true },
        })
      : [];
  const locById = new Map(locRows.map((l) => [l.id, l]));

  const locations = locationIds
    .map((locationId) => {
      const loc = locById.get(locationId) ?? null;
      const ledgerQty = qtyByLocationId.get(locationId);
      let quantity = typeof ledgerQty === "number" ? ledgerQty : 0;

      // Fallback to Location master qty when ledger has no row yet for this location+item.
      if (ledgerQty === undefined) {
        const master = masterLocations.find((l) => l.id === locationId);
        const map = master?.itemQtyByItemId;
        if (map && typeof map === "object" && !Array.isArray(map)) {
          const raw = (map as Record<string, unknown>)[itemId];
          const n = raw === null || raw === undefined || String(raw).trim() === "" ? NaN : Number(raw);
          if (Number.isFinite(n)) quantity = n;
        }
      }
      return {
        locationId,
        locationCode: loc?.code ?? "",
        locationName: loc?.name ?? "",
        type: loc?.type ?? "",
        projectId: loc?.projectId ?? "",
        quantity,
      };
    })
    .sort((a, b) => b.quantity - a.quantity);

  const total = locations.reduce((s, r) => s + (Number.isFinite(r.quantity) ? r.quantity : 0), 0);
  return NextResponse.json({ itemId, total, locations });
}

