import { NextResponse } from "next/server";
import { getTenantContext, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { db } from "@/lib/db/prisma";
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
  if (!hasMatrixAction(ctx, "purchase.mr", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for purchase.mr`, 403);
  }

  const pr = await findPRById(ctx.orgId, params.id);
  if (!pr) return NextResponse.json({ error: "PR not found" }, { status: 404 });
  if (pr.status !== "draft") {
    return NextResponse.json(
      { error: `Cannot submit PR in status: ${pr.status}` },
      { status: 400 },
    );
  }
  if (pr.createdBy && pr.createdBy !== ctx.userId) {
    return NextResponse.json(
      {
        error:
          "Only the person who raised this PR can submit it for approval. Ask the requester to submit it themselves.",
      },
      { status: 403 },
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
        orgId: ctx.orgId,
        userId: ctx.userId,
        roleKey: ctx.roleKey,
      },
      entityType: "purchase_requisitions",
      projectId: pr.projectId ?? null,
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
      let projectName: string | null = null;
      if (err.projectId) {
        const project = await (db as any).cnProject.findFirst({
          where: { id: err.projectId, orgId: ctx.orgId },
          select: { name: true, code: true },
        });
        projectName = project?.name ?? project?.code ?? null;
      }
      const scopeLabel = projectName
        ? `project "${projectName}"`
        : err.projectId
          ? `project ${err.projectId}`
          : "this tenant";
      return NextResponse.json(
        {
          error: err.projectId
            ? `No active Purchase Requisition workflow is configured for ${scopeLabel}. Ask an admin to either configure one under Settings → Workflows for ${scopeLabel}, or set up a Default workflow that applies to every project.`
            : `No active Purchase Requisition workflow is configured. Ask an admin to create one under Settings → Workflows.`,
        },
        { status: 400 },
      );
    }
    throw err;
  }

  const updated = await findPRById(ctx.orgId, pr.id);
  return NextResponse.json({
    ...updated,
    approvalInstanceId: instanceId,
    autoApproved,
  });
}
