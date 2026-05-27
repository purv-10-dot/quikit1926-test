import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { getTenantContext } from "@/lib/auth/context";

/**
 * Items-stock — current quantity per item, summed across every location
 * in the tenant. Backed by the `cn_stock_balances` ledger summary, with
 * a one-time fallback to the legacy per-location `itemQtyByItemId` map
 * so freshly-seeded tenants don't show all zeros.
 *
 * Two transports for the same payload:
 *   GET  ?itemIds=<csv>  — convenience for small lists (≤ a few dozen
 *                          IDs). Hits the URL-length limit (~8KB) when
 *                          the Items master grows past a few hundred
 *                          rows and the request 431s.
 *   POST { itemIds: [..] } — preferred for full-grid loads. No URL cap.
 *
 * Response: { data: Record<itemId, number> }
 */
async function loadStockForItems(
  orgId: string,
  itemIds: string[],
): Promise<Record<string, number>> {
  if (itemIds.length === 0) return {};

  const rows = await (db as any).cnStockBalance.groupBy({
    by: ["itemId"],
    where: { orgId, itemId: { in: itemIds } },
    _sum: { quantity: true },
  });

  const data: Record<string, number> = {};
  for (const r of rows) {
    data[r.itemId] = Number(r._sum.quantity?.toString?.() ?? r._sum.quantity ?? 0);
  }

  // Fallback: if the ledger has no balance rows yet, use Location master's
  // `itemQtyByItemId` as an opening snapshot so the UI doesn't show all zeros.
  const missing = itemIds.filter((id) => data[id] === undefined);
  if (missing.length > 0) {
    const locRows: any[] = await (db as any).cnLocation.findMany({
      where: { orgId, itemIds: { hasSome: missing } },
      select: { itemIds: true, itemQtyByItemId: true },
    });
    const addQty = (itemId: string, qty: number) => {
      if (!itemId || !Number.isFinite(qty)) return;
      data[itemId] = (data[itemId] ?? 0) + qty;
    };
    for (const loc of locRows) {
      const map = loc?.itemQtyByItemId;
      if (!map || typeof map !== "object" || Array.isArray(map)) continue;
      const ids: string[] = Array.isArray(loc?.itemIds) ? loc.itemIds : [];
      for (const id of ids) {
        if (!missing.includes(id)) continue;
        const raw = (map as any)[id];
        const n = raw === null || raw === undefined || String(raw).trim() === "" ? NaN : Number(raw);
        if (Number.isFinite(n)) addQty(id, n);
      }
    }
  }

  for (const id of itemIds) if (data[id] === undefined) data[id] = 0;
  return data;
}

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("itemIds") ?? "";
  const itemIds = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const data = await loadStockForItems(ctx.orgId, itemIds);
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawIds: unknown = body?.itemIds;
  const itemIds = Array.isArray(rawIds)
    ? rawIds.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];

  const data = await loadStockForItems(ctx.orgId, itemIds);
  return NextResponse.json({ data });
}

