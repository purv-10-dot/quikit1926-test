import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import {
  findStockTransferById,
  patchStockTransferStatus,
} from "@/lib/store/stock-transfer-repository";
import {
  submitForApproval,
  NoActiveWorkflowError,
} from "@/lib/approvals/submit-for-approval";

/**
 * Submit Stock Transfer for approval.
 *
 * Mirrors the Material Issue / Gate Pass / Good Return submit flow —
 * `entityType="transfer"` matches the approve route's existing key.
 * Workflow walk + skip-on-raiser + history-row writes are delegated to
 * `submitForApproval`; this handler owns only the entity status patch
 * after the helper returns.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await getTenantContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const st = await findStockTransferById(ctx.tenantId, params.id);
  if (!st) {
    return NextResponse.json(
      { error: "Stock Transfer not found" },
      { status: 404 },
    );
  }
  const currentStatus = String(st.status ?? "draft").toLowerCase();
  if (currentStatus !== "draft") {
    return NextResponse.json(
      { error: `Cannot submit stock transfer in status: ${st.status}` },
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
      entityType: "transfer",
      entityId: st.id,
      entityNumber: st.transferNumber ?? st.id,
    }));
  } catch (err) {
    if (err instanceof NoActiveWorkflowError) {
      return NextResponse.json(
        {
          error:
            "No active Stock Transfer workflow is configured. Ask an admin to create one under Settings → Workflows.",
        },
        { status: 400 },
      );
    }
    throw err;
  }

  const now = new Date();
  const updated = await patchStockTransferStatus(ctx.tenantId, st.id, {
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
