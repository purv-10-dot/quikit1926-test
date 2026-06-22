import { toErrorMessage } from "@/lib/api/errors";
import { requireEquipmentAction } from "@/lib/auth/requireEquipmentAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { createAudit, listAudits } from "@/lib/equipment/fixed-assets-service";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const ctxOrResp = await requireEquipmentAction(
    "construction.equipment_fixed_assets",
    "view",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  return NextResponse.json(await listAudits({ orgId: ctxOrResp.orgId }));
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
  if (!body.assetId || body.countedQty == null || !body.auditDate) {
    return NextResponse.json(
      { error: "assetId, countedQty, and auditDate are required" },
      { status: 400 },
    );
  }

  try {
    const created = await createAudit({
      orgId: ctx.orgId,
      userId: ctx.userId,
      assetId: String(body.assetId),
      countedQty: Number(body.countedQty),
      auditDate: String(body.auditDate),
      remarks: body.remarks ? String(body.remarks) : null,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "ASSET_NOT_FOUND") {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: toErrorMessage(err, "Failed to record audit") },
      { status: 500 },
    );
  }
}
