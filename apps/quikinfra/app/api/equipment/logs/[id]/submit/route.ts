import { requireEquipmentAction } from "@/lib/auth/requireEquipmentAction";
import { NextResponse } from "next/server";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { requireOwnership } from "@/lib/auth/ownership";
import {
  submitForApproval,
  NoActiveWorkflowError,
} from "@/lib/approvals/submit-for-approval";
import {
  findEquipmentLogRow,
  formatEquipmentLogEntityNumber,
  finalizeEquipmentLogApproval,
  patchEquipmentLogWorkflowStatus,
} from "@/lib/equipment/log-book-service";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireEquipmentAction("construction.equipment_log", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "equip.log_book", "edit")) {
    return envelopeErr("FORBIDDEN", 'Action "edit" not allowed for equip.log_book', 403);
  }

  const log = await findEquipmentLogRow(ctx.orgId, params.id);
  if (!log) {
    return NextResponse.json({ error: "Log not found" }, { status: 404 });
  }
  if (log.status !== "draft") {
    return NextResponse.json(
      { error: `Cannot submit equipment log in status: ${log.status}` },
      { status: 400 },
    );
  }
  if (!log.projectId) {
    return NextResponse.json(
      {
        error:
          "Project is required before submitting for approval. Edit the log and select a project.",
      },
      { status: 400 },
    );
  }

  const ownershipGuard = requireOwnership(log, ctx, "equipment log");
  if (ownershipGuard) return ownershipGuard;

  let instanceId: string;
  let autoApproved: boolean;
  try {
    ({ instanceId, autoApproved } = await submitForApproval({
      ctx: {
        orgId: ctx.orgId,
        userId: ctx.userId,
        roleKey: ctx.roleKey,
      },
      entityType: "equipment_logs",
      projectId: log.projectId,
      entityId: log.id,
      entityNumber: formatEquipmentLogEntityNumber(log),
    }));
  } catch (err) {
    if (err instanceof NoActiveWorkflowError) {
      return NextResponse.json(
        {
          error:
            "No active Equipment Log Book workflow is configured. Ask an admin to create one under Settings → Workflows → Machinery & Equipment.",
        },
        { status: 400 },
      );
    }
    throw err;
  }

  const now = new Date();
  const updated = await patchEquipmentLogWorkflowStatus(ctx.orgId, log.id, {
    status: autoApproved ? "approved" : "pending_approval",
    approvalId: instanceId,
    submittedAt: now,
    submittedBy: ctx.userId,
    ...(autoApproved
      ? { approvedAt: now, approvedBy: ctx.userId }
      : {}),
    updatedBy: ctx.userId,
  });

  if (autoApproved) {
    await finalizeEquipmentLogApproval(ctx.orgId, log.id, ctx.userId);
  }

  return NextResponse.json({
    ...updated,
    approvalInstanceId: instanceId,
    autoApproved,
  });
}
