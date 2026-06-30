import { requireEquipmentAction } from "@/lib/auth/requireEquipmentAction";
import { listDepreciation } from "@/lib/equipment/fixed-assets-service";
import { NextResponse } from "next/server";

export async function GET() {
  const ctxOrResp = await requireEquipmentAction(
    "construction.equipment_fixed_assets",
    "view",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  return NextResponse.json(await listDepreciation({ orgId: ctxOrResp.orgId }));
}
