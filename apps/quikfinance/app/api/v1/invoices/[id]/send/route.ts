import type { NextRequest } from "next/server";
import { Resend } from "resend";
import { requireApiContext } from "@/lib/api/auth";
import { fail, ok } from "@/lib/api/responses";
import { buildInvoiceShareData } from "@/lib/invoice-share";
import { getServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiContext();
  if (!auth.ok) {
    return fail(auth.status, { code: auth.code, message: auth.message });
  }

  const { resendApiKey } = getServerEnv();
  if (!resendApiKey) {
    return fail(500, { code: "EMAIL_NOT_CONFIGURED", message: "RESEND_API_KEY is required to send invoices." });
  }

  const { data: invoice, error: invoiceError } = await auth.context.db
    .from("invoices")
    .select("id, invoice_number, total, due_date, contact_id")
    .eq("org_id", auth.context.orgId)
    .eq("id", params.id)
    .single();

  if (invoiceError || !invoice) {
    return fail(404, { code: "NOT_FOUND", message: "Invoice was not found." });
  }

  const { data: customer } = await auth.context.db
    .from("contacts")
    .select("display_name, email")
    .eq("org_id", auth.context.orgId)
    .eq("id", invoice.contact_id)
    .single();

  if (!customer?.email) {
    return fail(422, { code: "CUSTOMER_EMAIL_REQUIRED", message: "Add a customer email before sending the invoice." });
  }

  const share = await buildInvoiceShareData(auth.context, params.id);
  const resend = new Resend(resendApiKey);
  const result = await resend.emails.send({
    from: "QuikFinance <billing@quikfinance.app>",
    to: [customer.email],
    subject: `Invoice ${invoice.invoice_number}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Invoice ${invoice.invoice_number}</h2>
        <p>Hello ${customer.display_name ?? "there"},</p>
        <p>Your invoice for ${invoice.total} is ready. The due date is ${invoice.due_date}.</p>
        <p><a href="${share.pdfUrl}">Open invoice PDF</a></p>
        ${share.paymentUrl ? `<p><a href="${share.paymentUrl}">Pay online</a></p>` : ""}
        ${share.customerPortalUrl ? `<p><a href="${share.customerPortalUrl}">Open your customer portal</a></p>` : ""}
        <p>Thank you,<br/>QuikFinance</p>
      </div>
    `
  });

  return ok({ id: params.id, email_id: result.data?.id ?? null });
}
