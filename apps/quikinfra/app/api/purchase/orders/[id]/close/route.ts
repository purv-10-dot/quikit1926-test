import { requirePurchaseAction } from "@/lib/auth/requirePurchaseAction";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { findPOById } from "@/lib/purchase/po-repository";
import { sendPoCancellationEmailToVendor } from "@/lib/purchase/po-email";

/**
 * Close PO — manual closure with a required reason.
 *
 * Triggered from the PO detail-page popup that fires when the
 * delivery date has passed without a complete GRN. The user picks
 * "Yes, close it", supplies a reason, and this endpoint:
 *
 *   1. Validates the PO exists, belongs to the tenant, and isn't
 *      already closed.
 *   2. Refuses to close a fully-received PO — a fully-received PO
 *      is already in its terminal state and closing it would muddy
 *      the audit trail (was it cancelled? force-closed?).
 *   3. Stamps `status: "closed"`, `closedAt`, `closedBy`, and the
 *      user-supplied `closeReason` in a single update.
 *
 * Reopening is intentionally out of scope for this iteration — if
 * the goods arrive late, an admin can flip the row directly until
 * we add a Reopen workflow.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requirePurchaseAction("construction.po", "edit");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "purchase.po", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for purchase.po`, 403);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON" },
      { status: 400 },
    );
  }

  const reason = String(body?.reason ?? "").trim();
  if (!reason) {
    return NextResponse.json(
      { error: "Close reason is required" },
      { status: 400 },
    );
  }
  if (reason.length > 500) {
    return NextResponse.json(
      { error: "Close reason must be under 500 characters" },
      { status: 400 },
    );
  }

  const po = await (db as any).cnPurchaseOrder.findFirst({
    where: { id: params.id, orgId: ctx.orgId },
    select: { id: true, status: true, poNumber: true },
  });
  if (!po) {
    return NextResponse.json({ error: "PO not found" }, { status: 404 });
  }
  if (po.status === "closed") {
    return NextResponse.json(
      { error: "PO is already closed" },
      { status: 409 },
    );
  }
  if (po.status === "fully_received") {
    return NextResponse.json(
      {
        error:
          "Cannot close a fully-received PO — it's already in its terminal state.",
      },
      { status: 409 },
    );
  }

  // Use raw SQL for the update so we don't depend on the generated
  // Prisma client knowing about `closedAt` / `closedBy` / `closeReason`.
  // The schema was pushed with `prisma db push`, but the typed client
  // can't be regenerated while the dev server holds the engine .dll
  // open on Windows. Raw SQL skips the validation layer and writes
  // straight to the columns Postgres already knows about.
  await (db as any).$executeRawUnsafe(
    `UPDATE app_quikinfra."Purchase_orders"
       SET status        = $1,
           "closedAt"    = $2,
           "closedBy"    = $3,
           "closeReason" = $4,
           "updatedBy"   = $5,
           "updatedAt"   = NOW()
     WHERE id = $6`,
    "closed",
    new Date(),
    ctx.userId,
    reason,
    ctx.userId,
    params.id,
  );

  // ── Notify the vendor ─────────────────────────────────────────────
  // Send a cancellation email with the buyer-supplied reason embedded
  // verbatim so the vendor knows exactly why the PO is being killed.
  // Fetched via the enriched repository read so we have the vendor
  // master fields (email, contact, project name) the email needs.
  // Mail failures are logged but never fail the close — the DB write
  // has already committed and we don't want a flaky SMTP server to
  // surface as a 500 on a successful close.
  let mailResult: { sent: boolean; email: string | null; error?: string; skippedReason?: string } = {
    sent: false,
    email: null,
    skippedReason: "not attempted",
  };
  try {
    const enriched = await findPOById(ctx.orgId, params.id);
    if (enriched) {
      mailResult = await sendPoCancellationEmailToVendor(
        ctx.orgId,
        enriched,
        reason,
      );
    }
  } catch (err: any) {
    mailResult = {
      sent: false,
      email: null,
      error: err?.message ?? String(err),
    };
  }
  if (!mailResult.sent && (mailResult.error || mailResult.skippedReason)) {
    console.warn(
      `[po-close] Cancellation email not delivered for ${po.poNumber}:`,
      mailResult.skippedReason ?? mailResult.error,
    );
  }

  return NextResponse.json({
    ok: true,
    poNumber: po.poNumber,
    status: "closed",
    email: {
      sent: mailResult.sent,
      to: mailResult.email,
      skippedReason: mailResult.skippedReason ?? null,
      error: mailResult.error ?? null,
    },
  });
}
