import { toErrorMessage } from "@/lib/api/errors";
import { requireEquipmentAction } from "@/lib/auth/requireEquipmentAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  getTransferById,
  patchTransfer,
} from "@/lib/equipment/deployment-service";
import { NextRequest, NextResponse } from "next/server";

function mapError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  switch (msg) {
    case "NOT_FOUND":
      return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
    case "INVALID_STATUS":
      return NextResponse.json(
        { error: "Only in-transit transfers can be updated" },
        { status: 400 },
      );
    default:
      return NextResponse.json(
        { error: toErrorMessage(err, "Failed to update transfer") },
        { status: 500 },
      );
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireEquipmentAction(
    "construction.equipment_deployment",
    "view",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const row = await getTransferById(ctx.orgId, params.id);
  if (!row) {
    return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  }
  return NextResponse.json(row);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireEquipmentAction(
    "construction.equipment_deployment",
    "edit",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "equip.deployment", "edit")) {
    return envelopeErr(
      "FORBIDDEN",
      'Action "edit" not allowed for equip.deployment',
      403,
    );
  }

  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }

  const action = body.action;
  if (action !== "receive" && action !== "cancel") {
    return NextResponse.json(
      { error: 'action must be "receive" or "cancel"' },
      { status: 400 },
    );
  }

  try {
    const updated = await patchTransfer({
      orgId: ctx.orgId,
      userId: ctx.userId,
      id: params.id,
      action,
    });
    return NextResponse.json(updated);
  } catch (err) {
    return mapError(err);
  }
}
