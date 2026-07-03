import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { NextRequest } from "next/server";
import { QuotationPDFTemplate } from "@/components/quotations/QuotationPDFTemplate";
import { requireApiContext } from "@/lib/api/auth";
import { fail } from "@/lib/api/responses";
import { loadQuotationPdfData } from "@/lib/quotation-pdf";
import { loadQuoteSettings } from "@/lib/settings/quote";
import { pdfFileName } from "@/lib/utils/pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });

  let quote;
  try {
    quote = await loadQuotationPdfData(auth.context.db as never, auth.context.orgId, params.id);
  } catch {
    return fail(404, { code: "NOT_FOUND", message: "Quote was not found." });
  }

  // Hide zero-value lines in the PDF when enabled (unless the quote totals zero).
  const settings = await loadQuoteSettings(auth.context.prisma, auth.context.orgId);
  if (settings.hide_zero_value_lines && quote.total !== 0) {
    quote = { ...quote, lineItems: quote.lineItems.filter((l) => l.lineTotal !== 0) };
  }

  const document = React.createElement(QuotationPDFTemplate, { quote }) as Parameters<typeof renderToBuffer>[0];
  const buffer = await renderToBuffer(document);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfFileName("quote", quote.quotationNumber)}"`
    }
  });
}
