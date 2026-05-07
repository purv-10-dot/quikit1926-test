import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
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
  const ctx = await getTenantContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

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

  const po = await findPOById(ctx.tenantId, params.id);
  if (!po) return NextResponse.json({ error: "PO not found" }, { status: 404 });
  if (po.status !== "draft") {
    return NextResponse.json(
      { error: `Cannot submit PO in status: ${po.status}` },
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
      entityType: ["purchase_orders", "purchase_order", "po"],
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

  let updated = await findPOById(ctx.tenantId, po.id);

  // Fire the PO email to the vendor. The mailer is wrapped in a
  // try/catch so SMTP flakiness never blocks the approval that just
  // got persisted. Whatever the outcome is lands in the response as
  // `mail` so the client UI can surface success/skip/failure.
  let mailResult: Awaited<ReturnType<typeof sendPoEmailToVendor>> | null = null;
  try {
    mailResult = await sendPoEmailToVendor(ctx.tenantId, updated, {
      emailHtmlBody,
    });
    console.log(
      `[po:submit] mail to vendor for ${updated.poNumber}: ` +
        `sent=${mailResult.sent} email=${mailResult.email ?? "(none)"}${
          mailResult.skippedReason ? ` skipped="${mailResult.skippedReason}"` : ""
        }${mailResult.error ? ` error="${mailResult.error}"` : ""}`,
    );
  } catch (e: unknown) {
    const ne = e as { code?: string; message?: string };
    console.warn(
      `[po:submit] mailer threw for ${updated.poNumber}:`,
      ne?.message ?? e,
    );
  }

  // If the mail actually went out and the PO is currently `approved`,
  // flip status to `sent` so the chip on the detail page reflects
  // reality — exactly the same treatment as the RFQ submit route.
  if (mailResult?.sent && updated.status === "approved") {
    const bumped = await updatePOStatus(
      ctx.tenantId,
      po.id,
      "sent",
      ctx.userId,
    );
    if (bumped) updated = bumped;
  }

  return NextResponse.json({
    ...updated,
    approvalInstanceId: instanceId,
    autoApproved,
    mail: mailResult,
  });
}
