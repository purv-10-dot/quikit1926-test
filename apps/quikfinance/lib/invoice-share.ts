import type { ApiContext } from "@/lib/api/auth";
import { createPortalUrl } from "@/lib/portals";
import { resolveGstSplit } from "@/lib/india";

export type InvoiceShareData = {
  pdfUrl: string;
  whatsappUrl: string;
  upiUri: string | null;
  paymentUrl: string | null;
  customerPortalUrl: string | null;
  einvoice: {
    irn: string;
    ackNumber: string;
    ackDate: string;
  };
  taxBreakup: {
    cgst: number;
    sgst: number;
    igst: number;
  };
};

export async function buildInvoiceShareData(context: ApiContext, invoiceId: string) {
  const [{ data: invoice, error: invoiceError }, { data: org }] = await Promise.all([
    context.db
      .from("invoices")
      .select("id, invoice_number, total, tax_total, due_date, place_of_supply, contact_id")
      .eq("org_id", context.orgId)
      .eq("id", invoiceId)
      .single(),
    context.db
      .from("organizations")
      .select("id, name, state_code, default_upi_id")
      .eq("id", context.orgId)
      .single()
  ]);

  if (invoiceError || !invoice) {
    throw new Error("Invoice was not found.");
  }

  const [{ data: contact }, { data: paymentLink }, { data: customerPortal }] = await Promise.all([
    context.db
      .from("contacts")
      .select("display_name")
      .eq("org_id", context.orgId)
      .eq("id", invoice.contact_id)
      .maybeSingle(),
    context.db
      .from("invoice_payment_links")
      .select("short_url")
      .eq("org_id", context.orgId)
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    context.db
      .from("portal_links")
      .select("access_token")
      .eq("org_id", context.orgId)
      .eq("portal_type", "customer")
      .eq("contact_id", invoice.contact_id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  const paymentUrl = typeof paymentLink?.short_url === "string" ? paymentLink.short_url : null;
  const customerPortalUrl = typeof customerPortal?.access_token === "string" ? createPortalUrl("customer", customerPortal.access_token) : null;
  const pdfUrl = `/api/v1/invoices/${invoiceId}/pdf`;
  const upiUri =
    org?.default_upi_id && paymentUrl
      ? `upi://pay?pa=${encodeURIComponent(org.default_upi_id)}&pn=${encodeURIComponent(org.name ?? "QuikFinance")}&am=${encodeURIComponent(String(invoice.total))}&cu=INR&tn=${encodeURIComponent(`Invoice ${invoice.invoice_number}`)}`
      : null;

  const shareText = encodeURIComponent(
    `Invoice ${invoice.invoice_number} for ${contact?.display_name ?? "customer"} is ready. Pay here: ${paymentUrl ?? customerPortalUrl ?? pdfUrl}`
  );

  return {
    pdfUrl,
    whatsappUrl: `https://wa.me/?text=${shareText}`,
    upiUri,
    paymentUrl,
    customerPortalUrl,
    einvoice: {
      irn: `IRN-PENDING-${invoice.invoice_number}`,
      ackNumber: `ACK-${invoice.invoice_number}`,
      ackDate: invoice.due_date
    },
    taxBreakup: resolveGstSplit({
      taxableValue: Number(invoice.total ?? 0) - Number(invoice.tax_total ?? 0),
      taxAmount: Number(invoice.tax_total ?? 0),
      companyStateCode: typeof org?.state_code === "string" ? org.state_code : null,
      placeOfSupply: typeof invoice.place_of_supply === "string" ? invoice.place_of_supply : null
    })
  } satisfies InvoiceShareData;
}
