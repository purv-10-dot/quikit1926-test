import { toErrorMessage } from "@/lib/api/errors";
import { requireEquipmentAction } from "@/lib/auth/requireEquipmentAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { createRepair, listRepairs } from "@/lib/equipment/fixed-assets-service";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const ctxOrResp = await requireEquipmentAction(
    "construction.equipment_fixed_assets",
    "view",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  return NextResponse.json(await listRepairs({ orgId: ctxOrResp.orgId }));
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireEquipmentAction(
    "construction.equipment_fixed_assets",
    "create",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "equip.fixed_assets", "add")) {
    return envelopeErr("FORBIDDEN", 'Action "add" not allowed for equip.fixed_assets', 403);
  }

  const body = await req.json().catch(() => ({}));
  if (!body.assetId || body.quantity == null) {
    return NextResponse.json({ error: "assetId and quantity are required" }, { status: 400 });
  }

  try {
    const created = await createRepair({
      orgId: ctx.orgId,
      userId: ctx.userId,
      assetId: String(body.assetId),
      quantity: Number(body.quantity),
      problem: body.problem ? String(body.problem) : null,
      repairCost: body.repairCost != null ? Number(body.repairCost) : 0,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "INSUFFICIENT_QTY") {
      return NextResponse.json({ error: "Insufficient available quantity" }, { status: 409 });
    }
    return NextResponse.json(
      { error: toErrorMessage(err, "Failed to open repair") },
      { status: 500 },
    );
  }
}
