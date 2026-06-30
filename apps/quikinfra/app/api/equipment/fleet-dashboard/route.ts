import { toErrorMessage } from "@/lib/api/errors";
import { requireEquipmentAction } from "@/lib/auth/requireEquipmentAction";
import { getFleetDashboard } from "@/lib/equipment/fleet-service";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireEquipmentAction(
    "construction.equipment_fleet",
    "view",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") ?? undefined;
  const fromDate = searchParams.get("from") ?? searchParams.get("fromDate") ?? undefined;
  const toDate = searchParams.get("to") ?? searchParams.get("toDate") ?? undefined;
  const forceRefresh =
    searchParams.get("refresh") === "true" ||
    searchParams.get("forceRefresh") === "true";

  try {
    const payload = await getFleetDashboard({
      orgId: ctx.orgId,
      userId: ctx.userId,
      projectId: projectId || undefined,
      projectIds:
        !projectId && Array.isArray(ctx.projectIds) && ctx.projectIds.length > 0
          ? ctx.projectIds
          : undefined,
      fromDate,
      toDate,
      forceRefresh,
    });
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      { error: toErrorMessage(err, "Failed to load fleet dashboard") },
      { status: 500 },
    );
  }
}
