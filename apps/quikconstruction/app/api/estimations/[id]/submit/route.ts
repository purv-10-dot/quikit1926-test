import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import {
  findEstimationById,
  patchEstimationStatus,
} from "@/lib/projects/estimation-repository";
import {
  submitForApproval,
  NoActiveWorkflowError,
} from "@/lib/approvals/submit-for-approval";

/**
 * Submit Material Estimation for approval.
 *
 * Both the estimation row and the approval instance live in Postgres
 * (entity + workflow in the same DB). The estimation is patched via
 * `patchEstimationStatus` after the workflow walk completes.
 *
 * Fails closed when no active workflow is configured.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await getTenantContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const est = await findEstimationById(ctx.tenantId, params.id);
  if (!est) {
    return NextResponse.json(
      { error: "Estimation not found" },
      { status: 404 },
    );
  }
  const currentStatus = String(est.status ?? "draft").toLowerCase();
  if (currentStatus !== "draft") {
    return NextResponse.json(
      { error: `Cannot submit estimation in status: ${est.status}` },
      { status: 400 },
    );
  }

  let instanceId: string;
  let autoApproved: boolean;
  try {
    ({ instanceId, autoApproved } = await submitForApproval({
      ctx: {
        tenantId: ctx.tenantId,
        orgId: ctx.orgId,
        userId: ctx.userId,
        roleKey: ctx.roleKey,
      },
      entityType: "material_estimations",
      entityId: est.id,
      entityNumber: est.boqNo ?? est.id,
    }));
  } catch (err) {
    if (err instanceof NoActiveWorkflowError) {
      return NextResponse.json(
        {
          error:
            "No active Material Estimation workflow is configured. Ask an admin to create one under Settings → Workflows.",
        },
        { status: 400 },
      );
    }
    throw err;
  }

  const now = new Date();
  const updated = await patchEstimationStatus(ctx.tenantId, est.id, {
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
