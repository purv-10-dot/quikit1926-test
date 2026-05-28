import { NextResponse } from "next/server";
import { getTenantContext, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { requireOwnership } from "@/lib/auth/ownership";
import {
  findGatePassById,
  patchGatePassStatus,
} from "@/lib/store/gate-pass-repository";
import {
  submitForApproval,
  NoActiveWorkflowError,
} from "@/lib/approvals/submit-for-approval";

/**
 * Submit Gate Pass for approval.
 *
 * Both the Gate Pass row and the approval instance now live in
 * Postgres; the GP row is updated via the gate-pass repository after
 * the workflow walk completes. `entityType="gate_pass"` is the join key
 * (matches the option exposed in Settings → Workflows).
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await getTenantContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasMatrixAction(ctx, "store.gate_pass", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for store.gate_pass`, 403);
  }

  const gatePass = await findGatePassById(ctx.orgId, params.id);
  if (!gatePass) {
    return NextResponse.json(
      { error: "Gate Pass not found" },
      { status: 404 },
    );
  }
  const currentStatus = String(gatePass.status ?? "draft").toLowerCase();
  if (currentStatus !== "draft") {
    return NextResponse.json(
      { error: `Cannot submit gate pass in status: ${gatePass.status}` },
      { status: 400 },
    );
  }

  const ownershipGuard = requireOwnership(gatePass, ctx, "gate pass");
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
      entityType: "gate_pass",
      projectId: gatePass.projectId ?? null,
      entityId: gatePass.id,
      entityNumber: gatePass.gatePassNumber ?? gatePass.id,
    }));
  } catch (err) {
    if (err instanceof NoActiveWorkflowError) {
      return NextResponse.json(
        {
          error:
            "No active Gate Pass workflow is configured. Ask an admin to create one under Settings → Workflows.",
        },
        { status: 400 },
      );
    }
    throw err;
  }

  const now = new Date();
  const updated = await patchGatePassStatus(ctx.orgId, gatePass.id, {
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
