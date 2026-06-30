import { toErrorMessage } from "@/lib/api/errors";
import { requireEquipmentAction } from "@/lib/auth/requireEquipmentAction";
import { getCostSheet } from "@/lib/equipment/fleet-service";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireEquipmentAction(
    "construction.equipment_fleet",
    "view",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const equipmentId = searchParams.get("equipmentId");
  const fromDate = searchParams.get("from") ?? searchParams.get("fromDate") ?? undefined;
  const toDate = searchParams.get("to") ?? searchParams.get("toDate") ?? undefined;

  if (!equipmentId) {
    return NextResponse.json({ error: "equipmentId is required" }, { status: 400 });
  }

  try {
    const payload = await getCostSheet({
      orgId: ctx.orgId,
      equipmentId,
      fromDate,
      toDate,
    });
    return NextResponse.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "EQUIPMENT_NOT_FOUND") {
      return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: toErrorMessage(err, "Failed to load cost sheet") },
      { status: 500 },
    );
  }
}
