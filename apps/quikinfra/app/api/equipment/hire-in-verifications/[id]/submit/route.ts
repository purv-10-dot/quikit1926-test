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
  findHireInVerificationRow,
  formatHireInVerificationEntityNumber,
  patchHireInVerificationWorkflowStatus,
} from "@/lib/equipment/hire-rent-service";

const SUBMITTABLE = new Set(["draft", "computed"]);

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctxOrResp = await requireEquipmentAction(
    "construction.equipment_hire_rent",
    "create",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "equip.hire_rent", "edit")) {
    return envelopeErr("FORBIDDEN", 'Action "edit" not allowed for equip.hire_rent', 403);
  }

  const { id } = await params;
  const verification = await findHireInVerificationRow(ctx.orgId, id);
  if (!verification) {
    return NextResponse.json({ error: "Verification not found" }, { status: 404 });
  }
  if (!SUBMITTABLE.has(verification.status)) {
    return NextResponse.json(
      { error: `Cannot submit verification in status: ${verification.status}` },
      { status: 400 },
    );
  }

  const ownershipGuard = requireOwnership(verification, ctx, "hire-in verification");
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
      entityType: "hire_rent",
      projectId: verification.projectId,
      entityId: verification.id,
      entityNumber: formatHireInVerificationEntityNumber(verification),
    }));
  } catch (err) {
    if (err instanceof NoActiveWorkflowError) {
      return NextResponse.json(
        {
          error:
            "No active Hire & Rent workflow is configured. Ask an admin to create one under Settings → Workflows → Machinery & Equipment.",
        },
        { status: 400 },
      );
    }
    throw err;
  }

  const now = new Date();
  const updated = await patchHireInVerificationWorkflowStatus(ctx.orgId, verification.id, {
    status: autoApproved ? "approved" : "pending_approval",
    approvalId: instanceId,
    submittedAt: now,
    submittedBy: ctx.userId,
    ...(autoApproved ? { approvedAt: now, approvedBy: ctx.userId } : {}),
    updatedBy: ctx.userId,
  });

  return NextResponse.json({
    ...updated,
    approvalInstanceId: instanceId,
    autoApproved,
  });
}
