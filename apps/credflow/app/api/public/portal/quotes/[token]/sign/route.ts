import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { resolvePortalToken } from "@/lib/services/quotes/enterprise/portal-service";
import { recordQuoteEngagement } from "@/lib/services/quotes/enterprise/engagement-service";
import { generateQuotePdfSnapshot } from "@/lib/services/quotes/enterprise/pdf/generate-pdf";

export const runtime = "nodejs";

const schema = z.object({
  signatureDataUrl: z.string().min(10),
  signerName: z.string().min(1).max(200),
  otpVerified: z.boolean().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const resolved = await resolvePortalToken(token);
    if (!resolved) {
      return NextResponse.json({ success: false, error: "Invalid or expired link" }, { status: 404 });
    }
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid signature payload" }, { status: 400 });
    }

    const now = new Date();
    await db.qcfQuote.update({
      where: { id: resolved.quoteId },
      data: {
        signedAt: now,
        signatureJson: {
          dataUrl: parsed.data.signatureDataUrl.slice(0, 500_000),
          signerName: parsed.data.signerName,
          signedAt: now.toISOString(),
        },
        signatureOtpVerified: parsed.data.otpVerified ?? false,
        engagementStatus: "Signed",
      },
    });

    await recordQuoteEngagement({
      tenantId: resolved.tenantId,
      quoteId: resolved.quoteId,
      eventType: "quote_signed",
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent"),
      metadata: { signerName: parsed.data.signerName },
    });

    await generateQuotePdfSnapshot({
      tenantId: resolved.tenantId,
      quoteId: resolved.quoteId,
      userId: "portal",
      userName: parsed.data.signerName,
    }).catch(() => null);

    return NextResponse.json({ success: true, data: { signed: true } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Sign failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
