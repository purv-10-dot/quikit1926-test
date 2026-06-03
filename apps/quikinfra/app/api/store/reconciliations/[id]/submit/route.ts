import { requireStoreAction } from "@/lib/auth/requireStoreAction";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { requireOwnership } from "@/lib/auth/ownership";
import {
  submitForApproval,
  NoActiveWorkflowError,
} from "@/lib/approvals/submit-for-approval";

/**
 * Submit Stock Reconciliation for approval.
 *
 * Mirrors the Material Issue / Stock Transfer submit handlers. The
 * approval instance is written by `submitForApproval`; the recon row's
 * status + approvalId are patched directly via Prisma (the recon model
 * has no dedicated repository helper). `entityType="recon"` is the
 * join key — matches the existing legacy approve route and any
 * "Reconciliation" workflow already configured under Settings → Workflows.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireStoreAction("construction.reconciliation", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "store.recon", "edit")) {
    return envelopeErr(
      "FORBIDDEN",
      `Action "edit" not allowed for store.recon`,
      403,
    );
  }

  const recon = await (db as any).cnStockReconciliation.findFirst({
    where: { id: params.id, orgId: ctx.orgId },
  });
  if (!recon) {
    return NextResponse.json(
      { error: "Reconciliation not found" },
      { status: 404 },
    );
  }
  const currentStatus = String(recon.status ?? "draft").toLowerCase();
  if (currentStatus !== "draft") {
    return NextResponse.json(
      { error: `Cannot submit reconciliation in status: ${recon.status}` },
      { status: 400 },
    );
  }

  const ownershipGuard = requireOwnership(recon, ctx, "reconciliation");
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
      entityType: "stock_reconciliation",
      projectId: recon.projectId ?? null,
      entityId: recon.id,
      entityNumber: recon.reconciliationNumber ?? recon.id,
    }));
  } catch (err) {
    if (err instanceof NoActiveWorkflowError) {
      return NextResponse.json(
        {
          error:
            "No active Reconciliation workflow is configured. Ask an admin to create one under Settings → Workflows.",
        },
        { status: 400 },
      );
    }
    throw err;
  }

  await (db as any).cnStockReconciliation.update({
    where: { id: recon.id },
    data: {
      status: autoApproved ? "approved" : "pending_approval",
      approvalId: instanceId,
      ...(autoApproved ? { approvedById: ctx.userId } : {}),
      updatedBy: ctx.userId,
    },
  });

  return NextResponse.json({
    id: recon.id,
    approvalInstanceId: instanceId,
    autoApproved,
    status: autoApproved ? "approved" : "pending_approval",
  });
}
