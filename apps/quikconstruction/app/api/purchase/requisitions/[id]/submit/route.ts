import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import { findPRById } from "@/lib/purchase/pr-repository";
import {
  submitForApproval,
  NoActiveWorkflowError,
} from "@/lib/approvals/submit-for-approval";

/**
 * Submit PR for approval.
 *
 * Finds the active `CnApprovalWorkflow` for `purchase_requisitions` via
 * `submitForApproval` and stamps the resulting `CnApprovalInstance` id
 * onto the PR via `approvalId`. Skip-on-raiser, auto-approve-on-full-skip
 * and history-row writes live in the helper.
 *
 * PR-specific behaviour preserved here:
 *   - Auto-approved branch: PR status comes from `stockCheckSummary` —
 *     `ALL_AVAILABLE` → `approved_stock_available`, otherwise
 *     `approved_indent_required`. Mirrors the approve route.
 *   - Pending branch: PR moves to `pending_approval`.
 *   - Both updates run inside the same transaction as the instance + history
 *     rows so a partial submit is impossible.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const pr = await findPRById(ctx.tenantId, params.id);
  if (!pr) return NextResponse.json({ error: "PR not found" }, { status: 404 });
  if (pr.status !== "draft") {
    return NextResponse.json(
      { error: `Cannot submit PR in status: ${pr.status}` },
      { status: 400 },
    );
  }

  // Compute the PR's final status if it auto-approves (every step is
  // self). Branches by the stock check exactly like the approve route.
  const summary = String(pr.stockCheckSummary ?? "").toUpperCase();
  const autoApprovedPRStatus =
    summary === "ALL_AVAILABLE"
      ? "approved_stock_available"
      : "approved_indent_required";

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
      entityType: "purchase_requisitions",
      entityId: pr.id,
      entityNumber: pr.prNumber,
      onCreatedInTxn: async (tx, args) => {
        await tx.cnPurchaseRequisition.update({
          where: { id: pr.id },
          data: {
            status: args.autoApproved ? autoApprovedPRStatus : "pending_approval",
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
            "No active Purchase Requisition workflow is configured. Ask an admin to create one under Settings → Workflows.",
        },
        { status: 400 },
      );
    }
    throw err;
  }

  const updated = await findPRById(ctx.tenantId, pr.id);
  return NextResponse.json({
    ...updated,
    approvalInstanceId: instanceId,
    autoApproved,
  });
}
