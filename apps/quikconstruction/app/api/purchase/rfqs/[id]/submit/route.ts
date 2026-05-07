import { NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { getTenantContext } from "@/lib/auth/context";
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
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

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

  const rfq = await findRfqById(ctx.tenantId, params.id);
  if (!rfq) return NextResponse.json({ error: "RFQ not found" }, { status: 404 });
  if (rfq.status !== "draft") {
    return NextResponse.json(
      { error: `Cannot submit RFQ in status: ${rfq.status}` },
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
      entityType: ["rfqs", "rfq"],
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

  let updated = await findRfqById(ctx.tenantId, rfq.id);

  // Fan out the RFQ PDF to every vendor attached to this RFQ. Mail
  // failures are collected per-vendor so a typo in one address doesn't
  // block the others, and they never fail the submit — the approval
  // state is already persisted above.
  let emailResult: Awaited<ReturnType<typeof sendRfqEmailsToVendors>> | null =
    null;
  try {
    emailResult = await sendRfqEmailsToVendors(ctx.tenantId, updated, {
      emailHtmlBodies,
    });
    console.log(
      `[rfq:submit] mail fan-out for ${updated.rfqNumber}: ` +
        `sent=${emailResult.sent.length} ` +
        `skipped=${emailResult.skipped.length} ` +
        `failed=${emailResult.failed.length}`,
    );
  } catch (e: unknown) {
    const ne = e as { code?: string; message?: string };
    console.warn(
      `[rfq:submit] mail fan-out threw for ${updated.rfqNumber}:`,
      ne?.message ?? e,
    );
  }

  // Post-dispatch status bump: once the PDF has actually left our
  // outbox for at least one vendor we advance `approved` → `sent` so
  // the chip on the detail page reflects reality instead of stopping
  // at the approval state. If no mail went out (no vendors, all
  // skipped, all failed) we leave the status alone so the admin can
  // retry without the status lying to them.
  if (
    emailResult &&
    emailResult.sent.length > 0 &&
    updated.status === "approved"
  ) {
    await (db as any).cnRfq.update({
      where: { id: rfq.id },
      data: { status: "sent", updatedBy: ctx.userId },
    });
    updated = await findRfqById(ctx.tenantId, rfq.id);
  }

  return NextResponse.json({
    ...updated,
    approvalInstanceId: instanceId,
    autoApproved,
    mail: emailResult,
  });
}
