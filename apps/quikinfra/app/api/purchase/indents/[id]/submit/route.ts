import { NextResponse } from "next/server";
import { getTenantContext, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { requireOwnership } from "@/lib/auth/ownership";
import { findIndentById } from "@/lib/purchase/indent-repository";
import {
  submitForApproval,
  NoActiveWorkflowError,
} from "@/lib/approvals/submit-for-approval";

/**
 * Submit Indent for Approval.
 *
 * Mirrors the PR submit route at the helper layer. The indent row is
 * patched inside the same transaction as the instance + history rows
 * via `onCreatedInTxn` so a partial submit is impossible.
 *
 * Fails closed when no active workflow is configured.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasMatrixAction(ctx, "purchase.indent", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for purchase.indent`, 403);
  }

  const indent = await findIndentById(ctx.orgId, params.id);
  if (!indent) {
    return NextResponse.json({ error: "Indent not found" }, { status: 404 });
  }
  if (indent.status !== "draft") {
    return NextResponse.json(
      { error: `Cannot submit indent in status: ${indent.status}` },
      { status: 400 },
    );
  }

  const ownershipGuard = requireOwnership(indent, ctx, "indent");
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
      entityType: "purchase_indents",
      projectId: indent.projectId ?? null,
      entityId: indent.id,
      entityNumber: indent.indentNumber,
      onCreatedInTxn: async (tx, args) => {
        await tx.cnPurchaseIndent.update({
          where: { id: indent.id },
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
            "No active Purchase Indents workflow is configured. Ask an admin to create one under Settings → Workflows.",
        },
        { status: 400 },
      );
    }
    throw err;
  }

  const updated = await findIndentById(ctx.orgId, indent.id);
  return NextResponse.json({
    ...updated,
    approvalInstanceId: instanceId,
    autoApproved,
  });
}
