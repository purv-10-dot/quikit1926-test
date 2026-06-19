import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { requirePurchaseAction } from "@/lib/auth/requirePurchaseAction";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { requireOwnership } from "@/lib/auth/ownership";
import { findRfqById } from "@/lib/purchase/rfq-repository";
import { sendRfqEmailsToVendors } from "@/lib/purchase/rfq-email";
import {
  submitForApproval,
  NoActiveWorkflowError,
} from "@/lib/approvals/submit-for-approval";

/**
 * Submit RFQ for Approval.
 *
 * Mirrors PR + Indent at the helper layer. The RFQ row is patched
 * inside the same transaction as the instance + history rows via
 * `onCreatedInTxn`. Accepts both `"rfqs"` (canonical) and `"rfq"`
 * (legacy) workflow keys for backward compat.
 *
 * After approval persistence completes we fan the RFQ PDF out to every
 * vendor attached to this RFQ. Mail failures are collected per-vendor
 * so a typo in one address doesn't block the others; they never fail
 * the submit since the approval state is already persisted.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requirePurchaseAction("construction.rfq", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "purchase.rfq", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for purchase.rfq`, 403);
  }

  // Optional per-vendor cover-email overrides from the Submit-RFQ
  // preview modal. Body is empty for legacy callers (list-page quick
  // submit), so we tolerate JSON parse failures and fall through to
  // the default per-vendor template. Only string values are kept; any
  // empty / non-string entries are dropped so the mailer can fall
  // back per-vendor without re-checking.
  let emailHtmlBodies: Record<string, string> | null = null;
  try {
    const body = await req.json().catch(() => null);
    const raw = body?.emailHtmlBodies;
    if (raw && typeof raw === "object") {
      const cleaned: Record<string, string> = {};
      for (const [vendorId, html] of Object.entries(raw)) {
        if (typeof html === "string" && html.trim().length > 0) {
          cleaned[vendorId] = html;
        }
      }
      if (Object.keys(cleaned).length > 0) emailHtmlBodies = cleaned;
    }
  } catch {
    /* no body — use default per-vendor template */
  }

  const rfq = await findRfqById(ctx.orgId, params.id);
  if (!rfq) return NextResponse.json({ error: "RFQ not found" }, { status: 404 });
  if (rfq.status !== "draft") {
    return NextResponse.json(
      { error: `Cannot submit RFQ in status: ${rfq.status}` },
      { status: 400 },
    );
  }

  // Hierarchy guard — only the creator may submit their own draft.
  // Site Admin / HO User act downstream via approve / reject / return,
  // not by submitting on the raiser's behalf. Tenant ADMIN bypasses
  // for break-glass on stuck drafts.
  const ownershipGuard = requireOwnership(rfq, ctx, "RFQ");
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
      entityType: ["rfqs", "rfq"],
      projectId: rfq.projectId ?? null,
      entityId: rfq.id,
      entityNumber: rfq.rfqNumber,
      onCreatedInTxn: async (tx, args) => {
        await tx.cnRfq.update({
          where: { id: rfq.id },
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
            "No active RFQ workflow is configured. Ask an admin to create one under Settings → Workflows.",
        },
        { status: 400 },
      );
    }
    throw err;
  }

  let updated = await findRfqById(ctx.orgId, rfq.id);
  if (!updated) {
    return NextResponse.json(
      { error: "RFQ not found after submit." },
      { status: 500 },
    );
  }

  // Fan out the RFQ PDF to vendors ONLY when the workflow auto-approved
  // (no multi-step approval was required). For multi-step workflows the
  // emails go out from the final approve step instead — vendors must not
  // see the RFQ before every level signs off.
  let emailResult: Awaited<ReturnType<typeof sendRfqEmailsToVendors>> | null =
    null;
  if (autoApproved) {
    try {
      emailResult = await sendRfqEmailsToVendors(ctx.orgId, updated, {
        emailHtmlBodies,
      });
      console.log(
        `[rfq:submit] mail fan-out for ${updated.rfqNumber}: ` +
          `sent=${emailResult.sent.length} ` +
          `skipped=${emailResult.skipped.length} ` +
          `failed=${emailResult.failed.length}`,
      );
    } catch (e: unknown) {
      console.warn(
        `[rfq:submit] mail fan-out threw for ${updated.rfqNumber}:`,
        toErrorMessage(e),
      );
    }

    // Post-dispatch status bump: once the PDF has actually left our
    // outbox for at least one vendor we advance `approved` → `sent` so
    // the chip on the detail page reflects reality instead of stopping
    // at the approval state.
    if (
      emailResult &&
      emailResult.sent.length > 0 &&
      updated.status === "approved"
    ) {
      await db.cnRfq.update({
        where: { id: rfq.id },
        data: { status: "sent", updatedBy: ctx.userId },
      });
      const refetched = await findRfqById(ctx.orgId, rfq.id);
      if (refetched) updated = refetched;
    }
  }

  return NextResponse.json({
    ...updated,
    approvalInstanceId: instanceId,
    autoApproved,
    mail: emailResult,
  });
}
