import { requireEquipmentAction } from "@/lib/auth/requireEquipmentAction";
import { getFuelReconciliation } from "@/lib/equipment/log-book-service";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireEquipmentAction("construction.equipment_log", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") ?? "";
  const fromDate = searchParams.get("fromDate") ?? "";
  const toDate = searchParams.get("toDate") ?? "";

  const data = await getFuelReconciliation({
    orgId: ctx.orgId,
    projectId: projectId || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    projectIds:
      Array.isArray(ctx.projectIds) && ctx.projectIds.length > 0
        ? ctx.projectIds
        : undefined,
  });

  return NextResponse.json({ data });
}
