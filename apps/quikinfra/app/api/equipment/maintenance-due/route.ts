import { requireEquipmentAction } from "@/lib/auth/requireEquipmentAction";
import { getMaintenanceDue } from "@/lib/equipment/maintenance-service";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireEquipmentAction(
    "construction.equipment_maintenance",
    "view",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const data = await getMaintenanceDue({
    orgId: ctx.orgId,
    projectIds:
      Array.isArray(ctx.projectIds) && ctx.projectIds.length > 0
        ? ctx.projectIds
        : undefined,
  });

  return NextResponse.json({ data });
}
