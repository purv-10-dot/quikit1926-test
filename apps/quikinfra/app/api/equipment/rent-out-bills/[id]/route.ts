import { toErrorMessage } from "@/lib/api/errors";
import { requireEquipmentAction } from "@/lib/auth/requireEquipmentAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { patchRentOutBill } from "@/lib/equipment/hire-rent-service";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctxOrResp = await requireEquipmentAction(
    "construction.equipment_hire_rent",
    "edit",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "equip.hire_rent", "edit")) {
    return envelopeErr(
      "FORBIDDEN",
      'Action "edit" not allowed for equip.hire_rent',
      403,
    );
  }

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action === "approve" ? "approve" : "regenerate";

  try {
    const updated = await patchRentOutBill({
      orgId: ctx.orgId,
      userId: ctx.userId,
      id,
      action,
    });
    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "NOT_FOUND") {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: toErrorMessage(err, "Failed to update bill") },
      { status: 500 },
    );
  }
}
