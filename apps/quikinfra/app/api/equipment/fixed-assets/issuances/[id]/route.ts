import { toErrorMessage } from "@/lib/api/errors";
import { requireEquipmentAction } from "@/lib/auth/requireEquipmentAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { returnIssuance } from "@/lib/equipment/fixed-assets-service";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctxOrResp = await requireEquipmentAction(
    "construction.equipment_fixed_assets",
    "edit",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "equip.fixed_assets", "edit")) {
    return envelopeErr("FORBIDDEN", 'Action "edit" not allowed for equip.fixed_assets', 403);
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    const updated = await returnIssuance({
      orgId: ctx.orgId,
      userId: ctx.userId,
      id,
      returnQty: body.returnQty != null ? Number(body.returnQty) : undefined,
    });
    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "NOT_FOUND") return NextResponse.json({ error: "Issuance not found" }, { status: 404 });
    if (msg === "ALREADY_RETURNED") {
      return NextResponse.json({ error: "Already fully returned" }, { status: 409 });
    }
    return NextResponse.json(
      { error: toErrorMessage(err, "Failed to return asset") },
      { status: 500 },
    );
  }
}
