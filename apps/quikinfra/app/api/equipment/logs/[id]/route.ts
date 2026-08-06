import { toErrorMessage } from "@/lib/api/errors";
import { requireEquipmentAction } from "@/lib/auth/requireEquipmentAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  getEquipmentLogById,
  patchEquipmentLog,
} from "@/lib/equipment/log-book-service";
import { db } from "@/lib/db";
import { resolveUserNames } from "@/lib/users/resolve-names";
import {
  APPROVAL_INSTANCE_INCLUDE,
  buildApprovalDto,
  type ApprovalDto,
  collectApprovalUserIds,
} from "@/lib/approvals/approval-dto";
import { NextRequest, NextResponse } from "next/server";

function mapError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  switch (msg) {
    case "NOT_FOUND":
      return NextResponse.json({ error: "Log not found" }, { status: 404 });
    case "INVALID_STATUS_TRANSITION":
      return NextResponse.json({ error: "Invalid status transition" }, { status: 400 });
    case "REJECT_REASON_REQUIRED":
      return NextResponse.json(
        { error: "Reject reason is required" },
        { status: 400 },
      );
    case "APPROVED_LOCKED":
      return NextResponse.json(
        { error: "Approved logs cannot be edited" },
        { status: 400 },
      );
    case "CLOSING_LT_OPENING":
      return NextResponse.json(
        { error: "Closing meter must be ≥ opening meter unless meter reset is checked" },
        { status: 400 },
      );
    default:
      return NextResponse.json(
        { error: toErrorMessage(err, "Failed to update equipment log") },
        { status: 500 },
      );
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireEquipmentAction("construction.equipment_log", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const row = await getEquipmentLogById(ctx.orgId, params.id);
  if (!row) {
    return NextResponse.json({ error: "Log not found" }, { status: 404 });
  }

  // Fan out to the approval instance (if any) so the detail page can render
  // a real timeline — configured steps with completed/pending markers —
  // mirroring the Purchase Requisition detail page.
  let approval: ApprovalDto | null = null;
  if (row.approvalId) {
    const instance = await db.cnApprovalInstance.findFirst({
      where: { id: row.approvalId, orgId: ctx.orgId },
      include: APPROVAL_INSTANCE_INCLUDE,
    });
    if (instance) {
      const nameById = await resolveUserNames(collectApprovalUserIds(instance));
      approval = buildApprovalDto(instance, nameById);
    }
  }

  return NextResponse.json({ ...row, approval });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireEquipmentAction("construction.equipment_log", "edit");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok for save */
  }

  if (!hasMatrixAction(ctx, "equip.log_book", "edit")) {
    return envelopeErr(
      "FORBIDDEN",
      'Action "edit" not allowed for equip.log_book',
      403,
    );
  }

  try {
    const updated = await patchEquipmentLog({
      orgId: ctx.orgId,
      userId: ctx.userId,
      id: params.id,
      action: body.action === "save_draft" ? "save_draft" : undefined,
      equipmentId: body.equipmentId ? String(body.equipmentId) : undefined,
      projectId:
        body.projectId !== undefined
          ? body.projectId
            ? String(body.projectId)
            : null
          : undefined,
      logDate: body.logDate ? String(body.logDate) : undefined,
      shift: body.shift ? String(body.shift) : undefined,
      openingMeter:
        body.openingMeter != null && body.openingMeter !== ""
          ? Number(body.openingMeter)
          : undefined,
      closingMeter:
        body.closingMeter != null && body.closingMeter !== ""
          ? Number(body.closingMeter)
          : undefined,
      meterReset: body.meterReset === true ? true : body.meterReset === false ? false : undefined,
      idleHours:
        body.idleHours != null && body.idleHours !== ""
          ? Number(body.idleHours)
          : undefined,
      breakdownHours:
        body.breakdownHours != null && body.breakdownHours !== ""
          ? Number(body.breakdownHours)
          : undefined,
      dieselIssued:
        body.dieselIssued != null && body.dieselIssued !== ""
          ? Number(body.dieselIssued)
          : undefined,
      operatorName:
        body.operatorName !== undefined ? String(body.operatorName) : undefined,
      productivityQty:
        body.productivityQty != null && body.productivityQty !== ""
          ? Number(body.productivityQty)
          : undefined,
      outputUom:
        body.outputUom !== undefined ? String(body.outputUom) : null,
      remarks: body.remarks !== undefined ? String(body.remarks) : undefined,
    });
    return NextResponse.json(updated);
  } catch (err) {
    return mapError(err);
  }
}
