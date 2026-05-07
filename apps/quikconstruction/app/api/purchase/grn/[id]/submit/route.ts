import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import { findGRNById } from "@/lib/purchase/grn-repository";
import {
  submitForApproval,
  NoActiveWorkflowError,
} from "@/lib/approvals/submit-for-approval";

/**
 * Submit GRN for Approval.
 *
 * Mirrors PR / Indent / RFQ / PO at the helper layer. The GRN row is
 * patched inside the same transaction as the instance + history rows
 * via `onCreatedInTxn` so a partial submit is impossible.
 *
 * Accepts both `"grns"` (canonical) and `"grn"` (legacy) workflow keys
 * for backward compat — the helper tries them in order.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await getTenantContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const grn = await findGRNById(ctx.tenantId, params.id);
  if (!grn)
    return NextResponse.json({ error: "GRN not found" }, { status: 404 });
  if (grn.status !== "draft") {
    return NextResponse.json(
      { error: `Cannot submit GRN in status: ${grn.status}` },
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
      entityType: ["grns", "grn"],
      entityId: grn.id,
      entityNumber: grn.grnNumber,
      onCreatedInTxn: async (tx, args) => {
        await tx.cnGoodsReceiptNote.update({
          where: { id: grn.id },
          data: {
            status: args.autoApproved ? "approved" : "pending_approval",
            approvalId: args.instanceId,
            updatedBy: ctx.userId,
          },
        });
      },
    }));
  } catch (err) {
    if (err instanceof NoActiveWorkflowError) {
      return NextResponse.json(
        {
          error:
            "No active GRN workflow is configured. Ask an admin to create one under Settings → Workflows.",
        },
        { status: 400 },
      );
    }
    throw err;
  }

  const updated = await findGRNById(ctx.tenantId, grn.id);
  return NextResponse.json({
    ...updated,
    approvalInstanceId: instanceId,
    autoApproved,
  });
}
