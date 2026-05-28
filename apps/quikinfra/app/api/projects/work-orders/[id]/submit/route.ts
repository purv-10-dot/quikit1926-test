import { NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { getTenantContext, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { requireOwnership } from "@/lib/auth/ownership";
import {
  submitForApproval,
  NoActiveWorkflowError,
} from "@/lib/approvals/submit-for-approval";

/**
 * Submit Work Order for approval.
 *
 * `entityType="work_order"` on the approval instance is the join key.
 * The WO row is updated directly via Prisma after the workflow walk
 * completes (no repository helper exists for WO yet).
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await getTenantContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasMatrixAction(ctx, "pm.work_order", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for pm.work_order`, 403);
  }

  const wo = await (db as any).cnWorkOrder.findFirst({
    where: { id: params.id, orgId: ctx.orgId },
    select: {
      id: true,
      status: true,
      woNumber: true,
      projectId: true,
      createdBy: true,
    },
  });
  if (!wo) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }
  const currentStatus = String(wo.status ?? "draft").toLowerCase();
  if (currentStatus !== "draft") {
    return NextResponse.json(
      { error: `Cannot submit work order in status: ${wo.status}` },
      { status: 400 },
    );
  }

  const ownershipGuard = requireOwnership(wo, ctx, "work order");
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
      entityType: "work_order",
      projectId: wo.projectId ?? null,
      entityId: wo.id,
      entityNumber: wo.woNumber ?? wo.id,
    }));
  } catch (err) {
    if (err instanceof NoActiveWorkflowError) {
      return NextResponse.json(
        {
          error:
            "No active Work Order workflow is configured. Ask an admin to create one under Settings → Workflows.",
        },
        { status: 400 },
      );
    }
    throw err;
  }

  const updated = await (db as any).cnWorkOrder.update({
    where: { id: wo.id },
    data: {
      status: autoApproved ? "approved" : "pending_approval",
      approvalId: instanceId,
      updatedBy: ctx.userId,
    },
  });

  return NextResponse.json({
    ...updated,
    approvalInstanceId: instanceId,
    autoApproved,
  });
}
