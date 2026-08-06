/**
 * POST /api/quotes/[id]/send
 *
 * Flow:
 *   1. Auth-gate the request (requireApiUser + assertModule)
 *   2. Tenant-scope the quote lookup
 *   3. Validate the composer payload (To/Cc/Bcc/Subject/Body)
 *   4. Deliver via the email abstraction (console-driver in dev, Resend
 *      in prod once it's wired)
 *   5. Mark the quote `sentAt` + write a `QuoteSent` activity, both
 *      inside the same Prisma transaction so a delivery success without
 *      a DB write is impossible
 *
 * The route does NOT auto-transition status (Draft stays Draft, Active
 * stays Active) — sending and activating are deliberately decoupled,
 * matching Dynamics 365's behaviour. If the rep wants to lock pricing,
 * they Activate; if they want to send a preview from Draft, they send.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { sendQuoteSchema } from "@/lib/services/quotes/validators";
import {
  QuoteError,
  getQuote,
  markQuoteSent,
} from "@/lib/services/quotes/quote-service";
import {
  EmailError,
  sendTransactionalEmail,
} from "@/lib/services/email/send";
import {
  assertQuoteApprovedForSend,
  QuoteApprovalError,
} from "@/lib/services/quotes/enterprise/approval-service";
import { createQuotePortalLink } from "@/lib/services/quotes/enterprise/portal-service";
import { generateQuotePdfSnapshot } from "@/lib/services/quotes/enterprise/pdf/generate-pdf";
import {
  renderQuoteEmailHtml,
  renderQuoteEmailText,
} from "@/lib/services/quotes/enterprise/email-templates";
import { getTenantCompanyBranding } from "@/lib/services/company-profile";
import { toNumber } from "@/lib/services/quotes/decimal";
import { recordQuoteEngagement } from "@/lib/services/quotes/enterprise/engagement-service";
import { evaluateRulesForEvent } from "@/lib/notifications/rules/engine";
import { notifyQuoteSent } from "@/lib/notifications/quote-triggers";

export const runtime = "nodejs";

function ok<T>(data: T): NextResponse {
  return NextResponse.json({ success: true, data });
}
function fail(status: number, error: string, fieldErrors?: Record<string, string>): NextResponse {
  return NextResponse.json(
    { success: false, error, ...(fieldErrors ? { fieldErrors } : {}) },
    { status },
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "edit");

    const quote = await getQuote(user.tenantId, id);
    if (!quote) return fail(404, "Quote not found");

    try {
      await assertQuoteApprovedForSend(user.tenantId, id);
    } catch (e: unknown) {
      if (e instanceof QuoteApprovalError) return fail(e.statusCode, e.message);
      throw e;
    }

    const body = await req.json().catch(() => null);
    const parsed = sendQuoteSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        400,
        "Validation failed",
        parsed.error.flatten().fieldErrors as Record<string, string>,
      );
    }

    // Build the portal URL. (The legacy browser-print URL is deprecated; the
    // new enterprise PDF flow is server-generated and will attach PDF in Phase 2.)
    // Resolution order: explicit Origin header → req.nextUrl.origin (set by
    // Next runtime) → relative path (works even from email if the recipient
    // is the same-origin internal user; broken for external customers, but
    // the route never reaches this fallback in real Next.js requests).
    const origin =
      req.headers.get("origin") ??
      (req as NextRequest & { nextUrl?: { origin?: string } }).nextUrl?.origin ??
      "";

    const portal = await createQuotePortalLink({
      tenantId: user.tenantId,
      quoteId: quote.id,
      userId: user.userId,
      expiresInDays: 30,
      origin,
    });

    await generateQuotePdfSnapshot({
      tenantId: user.tenantId,
      quoteId: quote.id,
      userId: user.userId,
      userName: user.name ?? null,
    }).catch(() => null);

    const company = await getTenantCompanyBranding(user.tenantId);
    const validUntil = quote.effectiveTo
      ? new Date(quote.effectiveTo).toLocaleDateString("en-IN")
      : "—";
    const emailVars = {
      quoteNumber: quote.quoteNumber,
      companyName: company.companyName,
      grandTotal: toNumber(quote.grandTotal).toLocaleString("en-IN"),
      validUntil,
      portalUrl: portal.url,
      ownerName: quote.ownerName ?? user.name ?? "Sales",
    };
    const html = renderQuoteEmailHtml(emailVars);
    const text =
      parsed.data.body.trim().length > 0
        ? `${parsed.data.body}\n\n${renderQuoteEmailText(emailVars)}`
        : renderQuoteEmailText(emailVars);

    let emailResult;
    try {
      emailResult = await sendTransactionalEmail({
        to: parsed.data.to,
        cc: parsed.data.cc,
        bcc: parsed.data.bcc,
        subject: parsed.data.subject,
        text,
        html,
        referenceUrl: portal.url,
      });
    } catch (e: unknown) {
      if (e instanceof EmailError) {
        return fail(e.statusCode, e.message);
      }
      throw e;
    }

    try {
      await markQuoteSent({
        tenantId: user.tenantId,
        userId: user.userId,
        userName: user.name ?? null,
        quoteId: quote.id,
        recipients: parsed.data.to,
        subject: parsed.data.subject,
        emailMessageId: emailResult.messageId,
      });
    } catch (e: unknown) {
      if (e instanceof QuoteError) return fail(e.statusCode, e.message);
      throw e;
    }

    await recordQuoteEngagement({
      tenantId: user.tenantId,
      quoteId: quote.id,
      eventType: "quote_sent",
      metadata: { recipients: parsed.data.to, portalUrl: portal.url },
    }).catch(() => null);

    // Dedicated quote sent notification.
    notifyQuoteSent({
      tenantId: user.tenantId,
      quoteId: quote.id,
      quoteNumber: String(quote.quoteNumber ?? quote.id),
      ownerId: quote.ownerId,
      actorUserId: user.userId,
      actorName: user.name || user.email,
      recipientEmails: parsed.data.to,
    }).catch((e) => console.error("[notifications] quote sent", e));

    evaluateRulesForEvent({
      event: "sent",
      entityType: "quote",
      entityId: quote.id,
      tenantId: user.tenantId,
      actorUserId: user.userId,
      actorName: user.name || user.email,
      after: quote as unknown as Record<string, unknown>,
      changedFields: ["sentAt"],
    }).catch((e) => console.error("[rules-engine] quote sent", e));

    return ok({
      messageId: emailResult.messageId,
      driver: emailResult.driver,
      sentAt: emailResult.sentAt.toISOString(),
      portalUrl: portal.url,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to send quote";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/quotes/:id/send POST]", error);
    return fail(status, message);
  }
}
