import { requireStoreAction } from "@/lib/auth/requireStoreAction";
import { NextRequest, NextResponse } from "next/server";
import { handleApprovalAction } from "@/lib/workflow/handle-approval";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctxOrResp = await requireStoreAction("construction.reconciliation", "approve");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "store.recon", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for store.recon`, 403);
  }
  return handleApprovalAction(req, {
    prismaModel: "cnStockReconciliation",
    entityId: params.id,
    entityType: "recon",
    requiredPermission: "store.recon.approve",
    transitions: {
      approve: ["submitted", "pending_approval", "draft"],
      reject: ["submitted", "pending_approval", "draft"],
      return: ["submitted", "pending_approval", "draft"],
    },
  });
}
