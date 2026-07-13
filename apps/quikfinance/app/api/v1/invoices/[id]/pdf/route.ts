import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { NextRequest } from "next/server";
import { TemplateDocument } from "@/components/pdf/TemplateDocument";
import { requireApiContext } from "@/lib/api/auth";
import { fail } from "@/lib/api/responses";
import { loadInvoicePdfData } from "@/lib/invoice-pdf";
import { invoiceToDocument } from "@/lib/pdf-templates/document";
import { defaultConfig, normalizeConfig } from "@/lib/pdf-templates/config";
import { pdfFileName } from "@/lib/utils/pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiContext();
  if (!auth.ok) {
    return fail(auth.status, { code: auth.code, message: auth.message });
  }
  const { prisma, orgId } = auth.context;

  let invoice;
  try {
    invoice = await loadInvoicePdfData(auth.context.db as never, orgId, params.id);
  } catch {
    return fail(404, { code: "NOT_FOUND", message: "Invoice was not found." });
  }

  // Use the org's default invoice template if one is configured; otherwise defaults.
  let config = defaultConfig();
  try {
    const rows = (await prisma.$queryRaw`SELECT config FROM pdf_templates WHERE org_id = ${orgId}::uuid AND module = 'invoice' AND is_default = true LIMIT 1`) as Array<{ config: unknown }>;
    if (rows[0]) config = normalizeConfig(rows[0].config);
  } catch {
    // Templates table not available yet — fall back to defaults.
  }

  const doc = invoiceToDocument(invoice);
  const element = React.createElement(TemplateDocument, { config, doc }) as Parameters<typeof renderToBuffer>[0];
  const buffer = await renderToBuffer(element);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfFileName("invoice", invoice.invoiceNumber)}"`
    }
  });
}
