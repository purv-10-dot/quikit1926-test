import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/services/quotes/decimal";
import { resolvePortalToken } from "@/lib/services/quotes/enterprise/portal-service";
import { recordQuoteEngagement } from "@/lib/services/quotes/enterprise/engagement-service";
import { getTenantCompanyBranding } from "@/lib/services/company-profile";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const resolved = await resolvePortalToken(token);
    if (!resolved) {
      return NextResponse.json({ success: false, error: "Invalid or expired link" }, { status: 404 });
    }

    const quote = await db.qcfQuote.findFirst({
      where: { id: resolved.quoteId, tenantId: resolved.tenantId, deletedAt: null },
      include: { lines: { orderBy: { lineNumber: "asc" } } },
    });
    if (!quote) {
      return NextResponse.json({ success: false, error: "Quote not found" }, { status: 404 });
    }

    await recordQuoteEngagement({
      tenantId: resolved.tenantId,
      quoteId: quote.id,
      eventType: "quote_viewed",
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent"),
    });

    const [account, company] = await Promise.all([
      db.qcfAccount.findFirst({
        where: { id: quote.accountId, tenantId: resolved.tenantId },
        select: { name: true },
      }),
      getTenantCompanyBranding(resolved.tenantId),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        quoteNumber: quote.quoteNumber,
        versionNumber: quote.versionNumber,
        status: quote.status,
        engagementStatus: quote.engagementStatus,
        effectiveTo: quote.effectiveTo,
        grandTotal: toNumber(quote.grandTotal),
        grandTotalInWords: quote.grandTotalInWords,
        termsText: quote.termsText,
        companyName: company.companyName,
        accountName: account?.name ?? null,
        lines: quote.lines.map((l) => ({
          lineNumber: l.lineNumber,
          productName: l.productName,
          quantity: toNumber(l.quantity),
          unitPrice: toNumber(l.unitPrice),
          lineTotal: toNumber(l.lineTotal),
        })),
        acceptedAt: quote.acceptedAt,
        rejectedAt: quote.rejectedAt,
        signedAt: quote.signedAt,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Portal load failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
