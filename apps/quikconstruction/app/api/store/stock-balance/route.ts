import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { getTenantContext } from "@/lib/auth/context";

/**
 * GET /api/store/stock-balance
 *
 * Reads from `stock_balances` — the denormalised current-quantity
 * cache maintained by the stock ledger. The query scope widens
 * gracefully based on which filters the caller supplies:
 *
 *   ?itemId=...                                  → tenant-wide total for the item
 *   ?itemId=...&projectId=...                    → project-wide total for the item
 *   ?itemId=...&projectId=...&locationId=...     → exact per-location balance
 *
 * `itemId` is the only required filter — the Material Issue form
 * reads this endpoint as soon as a material is picked, before the
 * user has chosen a source location.
 *
 * Response: { quantity: number, avgRate: number } — returns zeroes
 * (not 404) when the scope has no ledger history, so the UI can
 * render "0" uniformly without a second branch. `avgRate` on the
 * aggregate paths is a quantity-weighted average.
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await getTenantContext();
    if (!ctx) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId") ?? "";
    const locationId = searchParams.get("locationId") ?? "";
    const itemId = searchParams.get("itemId") ?? "";

    if (!itemId) {
      return NextResponse.json(
        { error: "itemId is required" },
        { status: 400 },
      );
    }

    // Exact (project, location, item) lookup — fast path via the
    // composite primary key.
    if (projectId && locationId) {
      const row: any = await (db as any).cnStockBalance.findUnique({
        where: {
          projectId_locationId_itemId: { projectId, locationId, itemId },
        },
      });
      if (!row || row.tenantId !== ctx.tenantId) {
        return NextResponse.json({ quantity: 0, avgRate: 0 });
      }
      return NextResponse.json({
        quantity: Number(row.quantity.toString()),
        avgRate: Number(row.avgRate.toString()),
      });
    }

    // Aggregate — either tenant-wide (itemId only) or project-wide
    // (itemId + projectId). Sum quantity, compute a quantity-weighted
    // average rate so the caller can still surface something useful.
    const where: any = { tenantId: ctx.tenantId, orgId: ctx.orgId, itemId };
    if (projectId) where.projectId = projectId;

    const rows: any[] = await (db as any).cnStockBalance.findMany({
      where,
      select: { quantity: true, avgRate: true },
    });

    let quantity = 0;
    let weightedRate = 0;
    for (const r of rows) {
      const q = Number(r.quantity?.toString?.() ?? r.quantity ?? 0);
      const rate = Number(r.avgRate?.toString?.() ?? r.avgRate ?? 0);
      quantity += q;
      weightedRate += q * rate;
    }
    const avgRate = quantity > 0 ? weightedRate / quantity : 0;

    return NextResponse.json({ quantity, avgRate });

  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[store/stock-balance.GET] failed:", err);
    return NextResponse.json(
      { ok: false, error: e.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
