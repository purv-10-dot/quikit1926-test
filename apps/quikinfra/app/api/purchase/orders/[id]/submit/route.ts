import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { requirePurchaseAction } from "@/lib/auth/requirePurchaseAction";
import { NextResponse } from "next/server";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { requireOwnership } from "@/lib/auth/ownership";
import {
  findPOById,
  updatePOStatus,
} from "@/lib/purchase/po-repository";
import { sendPoEmailToVendor } from "@/lib/purchase/po-email";
import {
  submitForApproval,
  NoActiveWorkflowError,
} from "@/lib/approvals/submit-for-approval";

/**
 * Submit PO for Approval.
 *
 * Mirrors PR / Indent / RFQ at the helper layer. The PO row is patched
 * inside the same transaction as the instance + history rows via
 * `onCreatedInTxn`. Accepts `"purchase_orders"` (canonical),
 * `"purchase_order"` and `"po"` as workflow keys for backward compat.
 *
 * After the approval state is persisted, fires the PO PDF email to the
 * vendor. Email failures never roll back the approval; they're logged
 * and reported back on the response for the UI to surface.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requirePurchaseAction("construction.po", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "purchase.po", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for purchase.po`, 403);
  }

  // Optional cover-email override from the Submit-PO preview modal.
  // Body is empty for legacy callers (list-page quick submit), so we
  // tolerate JSON parse failures and fall through to the default
  // template.
  let emailHtmlBody: string | null = null;
  try {
    const body = await req.json().catch(() => null);
    if (body && typeof body.emailHtmlBody === "string") {
      const trimmed = body.emailHtmlBody.trim();
      if (trimmed.length > 0) emailHtmlBody = body.emailHtmlBody;
    }
  } catch {
    /* no body — use default email template */
  }

  const po = await findPOById(ctx.orgId, params.id);
  if (!po) return NextResponse.json({ error: "PO not found" }, { status: 404 });
  if (po.status !== "draft") {
    return NextResponse.json(
      { error: `Cannot submit PO in status: ${po.status}` },
      { status: 400 },
    );
  }

  // Hierarchy guard: only the creator can submit their own draft into the
  // approval queue. Site Admin / HO User must NOT submit on behalf of the
  // raiser — they participate downstream via approve / reject / return.
  // Tenant ADMIN bypasses this so a break-glass admin can unblock a
  // stuck draft when the original creator is unavailable.
  const ownershipGuard = requireOwnership(po, ctx, "purchase order");
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
      entityType: ["purchase_orders", "purchase_order", "po"],
      projectId: po.projectId ?? null,
      entityId: po.id,
      entityNumber: po.poNumber,
      onCreatedInTxn: async (tx, args) => {
        await tx.cnPurchaseOrder.update({
          where: { id: po.id },
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
            "No active PO workflow is configured. Ask an admin to create one under Settings → Workflows.",
        },
        { status: 400 },
      );
    }
    throw err;
  }

  let updated = await findPOById(ctx.orgId, po.id);
  if (!updated) {
    return NextResponse.json(
      { error: "Purchase order not found after submit." },
      { status: 500 },
    );
  }

  // Fire the PO email to the vendor ONLY when the workflow auto-approved
  // (no multi-step approval required). For multi-step workflows the
  // email goes out from the FINAL approve step instead — the vendor
  // must not see the PO until every level signs off.
  let mailResult: Awaited<ReturnType<typeof sendPoEmailToVendor>> | null = null;
  if (autoApproved) {
    try {
      mailResult = await sendPoEmailToVendor(ctx.orgId, updated, {
        emailHtmlBody,
      });
      console.log(
        `[po:submit] mail to vendor for ${updated.poNumber}: ` +
          `sent=${mailResult.sent} email=${mailResult.email ?? "(none)"}${
            mailResult.skippedReason ? ` skipped="${mailResult.skippedReason}"` : ""
          }${mailResult.error ? ` error="${mailResult.error}"` : ""}`,
      );
    } catch (e: unknown) {
      console.warn(
        `[po:submit] mailer threw for ${updated.poNumber}:`,
        toErrorMessage(e),
      );
    }

    if (mailResult?.sent && updated.status === "approved") {
      const bumped = await updatePOStatus(
        ctx.orgId,
        po.id,
        "sent",
        ctx.userId,
      );
      if (bumped) updated = bumped;
    }
  }

  return NextResponse.json({
    ...updated,
    approvalInstanceId: instanceId,
    autoApproved,
    mail: mailResult,
  });
}
