import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { fail } from "@/lib/api/responses";
import { InvoicePDFTemplate } from "@/components/invoice/InvoicePDFTemplate";
import { db } from "@/lib/db";
import { getPortalLinkByToken } from "@/lib/portals";
import { loadInvoicePdfData } from "@/lib/invoice-pdf";
import { pdfFileName } from "@/lib/utils/pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) {
    return fail(401, { code: "TOKEN_REQUIRED", message: "Portal token is required." });
  }

  const portal = await getPortalLinkByToken(token);
  if (!portal || portal.portal_type !== "customer" || !portal.contact_id) {
    return fail(403, { code: "PORTAL_ACCESS_DENIED", message: "This portal does not have access to the invoice." });
  }

  const admin = db;
  const { data: invoiceRow } = await admin.from("invoices").select("contact_id").eq("org_id", portal.org_id).eq("id", params.id).maybeSingle();
  if (!invoiceRow || String(invoiceRow.contact_id) !== portal.contact_id) {
    return fail(404, { code: "NOT_FOUND", message: "Invoice was not found." });
  }

  const invoice = await loadInvoicePdfData(admin as never, portal.org_id, params.id);
  const document = React.createElement(InvoicePDFTemplate, { invoice }) as Parameters<typeof renderToBuffer>[0];
  const buffer = await renderToBuffer(document);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfFileName("invoice", invoice.invoiceNumber)}"`
    }
  });
}
