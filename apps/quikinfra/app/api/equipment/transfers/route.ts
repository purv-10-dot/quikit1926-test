import { toErrorMessage } from "@/lib/api/errors";
import { requireEquipmentAction } from "@/lib/auth/requireEquipmentAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  createTransfer,
  getDeploymentSummary,
  listTransfers,
} from "@/lib/equipment/deployment-service";
import { NextRequest, NextResponse } from "next/server";

function mapError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  switch (msg) {
    case "EQUIPMENT_NOT_FOUND":
      return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    case "SAME_DESTINATION":
      return NextResponse.json(
        { error: "Destination must differ from the machine's current project" },
        { status: 400 },
      );
    case "OPEN_TRANSFER_EXISTS":
      return NextResponse.json(
        { error: "This machine already has an open transfer in transit" },
        { status: 409 },
      );
    default:
      return NextResponse.json(
        { error: toErrorMessage(err, "Failed to create transfer") },
        { status: 500 },
      );
  }
}

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireEquipmentAction(
    "construction.equipment_deployment",
    "view",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "all";
  const summaryOnly = searchParams.get("summary") === "true";

  const baseOpts = {
    orgId: ctx.orgId,
    status: status || undefined,
    projectIds:
      Array.isArray(ctx.projectIds) && ctx.projectIds.length > 0
        ? ctx.projectIds
        : undefined,
  };

  if (summaryOnly) {
    const summary = await getDeploymentSummary(baseOpts);
    return NextResponse.json(summary);
  }

  const result = await listTransfers(baseOpts);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireEquipmentAction(
    "construction.equipment_deployment",
    "create",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "equip.deployment", "add")) {
    return envelopeErr(
      "FORBIDDEN",
      'Action "add" not allowed for equip.deployment',
      403,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.equipmentId) {
    return NextResponse.json({ error: "equipmentId is required" }, { status: 400 });
  }
  if (!body.destinationProjectId) {
    return NextResponse.json(
      { error: "destinationProjectId is required" },
      { status: 400 },
    );
  }
  if (!body.transferDate) {
    return NextResponse.json({ error: "transferDate is required" }, { status: 400 });
  }

  const transferType =
    (body.transferType as "reassignment" | "returnable") ?? "reassignment";
  if (transferType === "returnable") {
    if (!body.returnableTo) {
      return NextResponse.json(
        { error: "Returnable transfers require a returnable-until date" },
        { status: 400 },
      );
    }
    if (String(body.returnableTo) < String(body.transferDate)) {
      return NextResponse.json(
        { error: "Returnable-until date must be on or after the transfer date" },
        { status: 400 },
      );
    }
  }

  try {
    const created = await createTransfer({
      orgId: ctx.orgId,
      userId: ctx.userId,
      equipmentId: String(body.equipmentId),
      destinationProjectId: String(body.destinationProjectId),
      transferType,
      transferDate: String(body.transferDate),
      returnableFrom:
        transferType === "returnable" ? String(body.transferDate) : null,
      returnableTo:
        transferType === "returnable" ? String(body.returnableTo) : null,
      reason: body.reason ? String(body.reason) : null,
      remarks: body.remarks ? String(body.remarks) : null,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return mapError(err);
  }
}
