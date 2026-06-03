import { NextResponse } from "next/server";
import { dashboardService } from "@/lib/purchase";
import { requirePurchaseAction } from "@/lib/auth/requirePurchaseAction";

/**
 * Purchase Dashboard API — Real data KPIs from persisted data.
 * Gated by `construction.po.view` — any user with PO view access can
 * see the purchase dashboard (PO is the broadest purchase resource).
 */
export async function GET() {
  try {
    const ctxOrResp = await requirePurchaseAction("construction.po", "view");
    if (ctxOrResp instanceof NextResponse) return ctxOrResp;
    const ctx = ctxOrResp;
    const data = await dashboardService.getFullDashboard(ctx);
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Dashboard error" }, { status: 500 });
  }
}
