import { NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { getTenantContext } from "@/lib/auth/context";
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

  const wo = await (db as any).cnWorkOrder.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    select: { id: true, status: true, woNumber: true },
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
      entityType: "work_order",
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
