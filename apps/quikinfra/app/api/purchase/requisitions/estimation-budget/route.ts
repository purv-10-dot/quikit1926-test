import { requirePurchaseAction } from "@/lib/auth/requirePurchaseAction";
import { NextRequest, NextResponse } from "next/server";

import { getProjectMaterialBudget } from "@/lib/purchase/estimation-consumption";

/**
 * GET /api/purchase/requisitions/estimation-budget?projectId=...&boqItemId=...
 *
 * Returns the per-material estimation budget for a project — the cap a
 * PR creator is allowed to draw against. The PR drawer uses this to
 * display Estimated / Consumed / Remaining columns and to block submit
 * when any line exceeds its remaining qty.
 */
export async function GET(req: NextRequest) {
  const ctxOrResp = await requirePurchaseAction("construction.pr", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") ?? "";
  const boqItemId = searchParams.get("boqItemId") ?? null;

  if (!projectId) {
    return NextResponse.json(
      { error: "projectId is required" },
      { status: 400 },
    );
  }

  const data = await getProjectMaterialBudget(ctx.orgId, projectId, {
    boqItemId,
  });

  return NextResponse.json({ data, total: data.length });
}
