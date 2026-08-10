import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  buildQuotePreviewHtml,
  buildQuotePreviewPdfBuffer,
  generateQuotePdfSnapshot,
  QuotePdfError,
} from "@/lib/services/quotes/enterprise/pdf/generate-pdf";

export const runtime = "nodejs";

function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ success: true, data }, init);
}
function fail(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "view");

    const format = (req.nextUrl.searchParams.get("format") ?? "").toLowerCase();
    if (format === "html") {
      const html = await buildQuotePreviewHtml(user.tenantId, id);
      return new NextResponse(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const { fileName, buffer } = await buildQuotePreviewPdfBuffer(user.tenantId, id);
    // NextResponse BodyInit typing doesn't accept Buffer, but runtime does accept Uint8Array.
    const bytes = new Uint8Array(buffer);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        // inline for preview; download flow can override via <a download>
        "Content-Disposition": `inline; filename="${fileName}"`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Preview failed";
    const status = error instanceof QuotePdfError ? error.statusCode : 500;
    if (status >= 500) {
      console.error("[api/quotes/:id/pdf GET]", error);
    }
    return fail(status, message);
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "edit");

    const result = await generateQuotePdfSnapshot({
      tenantId: user.tenantId,
      quoteId: id,
      userId: user.userId,
      userName: user.name ?? null,
    });
    return ok(result, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "PDF generation failed";
    const status = error instanceof QuotePdfError ? error.statusCode : 500;
    return fail(status, message);
  }
}
