import { toErrorMessage } from "@/lib/api/errors";
import { requireEquipmentAction } from "@/lib/auth/requireEquipmentAction";
import { getMachine360 } from "@/lib/equipment/machine-360-service";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctxOrResp = await requireEquipmentAction(
    "construction.equipment_fleet",
    "view",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const fromDate = searchParams.get("from") ?? searchParams.get("fromDate") ?? undefined;
  const toDate = searchParams.get("to") ?? searchParams.get("toDate") ?? undefined;

  try {
    const payload = await getMachine360({
      orgId: ctx.orgId,
      equipmentId: id,
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
      { error: toErrorMessage(err, "Failed to load machine 360") },
      { status: 500 },
    );
  }
}
