import { toErrorMessage } from "@/lib/api/errors";
import { requireEquipmentAction } from "@/lib/auth/requireEquipmentAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { deactivateDocument } from "@/lib/equipment/deployment-service";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireEquipmentAction(
    "construction.equipment_deployment",
    "delete",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "equip.deployment", "delete")) {
    return envelopeErr(
      "FORBIDDEN",
      'Action "delete" not allowed for equip.deployment',
      403,
    );
  }

  try {
    await deactivateDocument(ctx.orgId, params.id, ctx.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "NOT_FOUND") {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: toErrorMessage(err, "Failed to delete document") },
      { status: 500 },
    );
  }
}
