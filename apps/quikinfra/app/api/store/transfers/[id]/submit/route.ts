import { requireStoreAction } from "@/lib/auth/requireStoreAction";
import { NextResponse } from "next/server";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { requireOwnership } from "@/lib/auth/ownership";
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
  const ctxOrResp = await requireStoreAction("construction.transfer", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "store.transfer", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for store.transfer`, 403);
  }

  const st = await findStockTransferById(ctx.orgId, params.id);
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

  const ownershipGuard = requireOwnership(st, ctx, "stock transfer");
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
      entityType: "transfer",
      // Stock transfers are owned by the source project for approval
      // purposes — whoever is sending the goods authorises the move.
      // Schema carries both `sourceProjectId` and legacy `fromProjectId`.
      projectId:
        (st as any).sourceProjectId ?? (st as any).fromProjectId ?? null,
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
  const updated = await patchStockTransferStatus(ctx.orgId, st.id, {
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
