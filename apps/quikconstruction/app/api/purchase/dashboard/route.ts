import { NextResponse } from "next/server";
import { dashboardService } from "@/lib/purchase";
import { getTenantContext } from "@/lib/auth/context";

/**
 * Purchase Dashboard API — Real data KPIs from persisted data.
 * No hardcoded values. All queries use canonical enums.
 */
export async function GET() {
  try {
    const ctx = await getTenantContext();
    const data = await dashboardService.getFullDashboard(ctx);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    return NextResponse.json({ error: e.message ?? "Dashboard error" }, { status: 500 });
  }
}
