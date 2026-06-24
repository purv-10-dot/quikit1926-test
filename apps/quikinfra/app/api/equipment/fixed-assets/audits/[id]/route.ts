import { toErrorMessage } from "@/lib/api/errors";
import { requireEquipmentAction } from "@/lib/auth/requireEquipmentAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { adjustAudit } from "@/lib/equipment/fixed-assets-service";
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

  try {
    const updated = await adjustAudit({
      orgId: ctx.orgId,
      userId: ctx.userId,
      id,
    });
    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "NOT_FOUND") return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    if (msg === "ALREADY_ADJUSTED") {
      return NextResponse.json({ error: "Audit already adjusted" }, { status: 409 });
    }
    return NextResponse.json(
      { error: toErrorMessage(err, "Failed to adjust audit") },
      { status: 500 },
    );
  }
}
