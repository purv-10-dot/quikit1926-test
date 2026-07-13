import type { Prisma } from "@prisma/client";
import type { EInvoiceContact, EInvoiceInvoice, EInvoiceLine, EInvoiceOrg } from "@/lib/gst/einvoice";

type Tx = Prisma.TransactionClient | { $queryRaw: Prisma.TransactionClient["$queryRaw"] };

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export type LoadedInvoice = {
  org: EInvoiceOrg;
  contact: EInvoiceContact;
  invoice: EInvoiceInvoice;
  lines: EInvoiceLine[];
};

/**
 * Load an invoice with everything the e-Invoice / e-Way builders need: org GST
 * profile, customer GST details, and per-line CGST/SGST/IGST split derived from
 * the seller state vs place-of-supply.
 */
export async function loadInvoiceForGst(prisma: Tx, orgId: string, invoiceId: string): Promise<LoadedInvoice | null> {
  const invRows = (await prisma.$queryRaw`
    SELECT invoice_number, to_char(issue_date,'YYYY-MM-DD') AS issue_date, total, subtotal, discount_total,
           tax_total, round_off, place_of_supply, currency, contact_id
    FROM invoices WHERE id = ${invoiceId}::uuid AND org_id = ${orgId}::uuid LIMIT 1
  `) as Array<Record<string, unknown>>;
  if (!invRows.length) return null;
  const inv = invRows[0];

  const orgRows = (await prisma.$queryRaw`
    SELECT gstin, legal_name, name, state_code, pin_code, address_line, city, phone, email
    FROM organizations WHERE id = ${orgId}::uuid LIMIT 1
  `) as Array<Record<string, unknown>>;
  const o = orgRows[0] ?? {};

  const contactRows = (await prisma.$queryRaw`
    SELECT display_name, company_name, tax_id, state_code, gst_treatment, phone, email, billing_address, shipping_address
    FROM contacts WHERE id = ${inv.contact_id as string}::uuid LIMIT 1
  `) as Array<Record<string, unknown>>;
  const c = contactRows[0] ?? {};

  const lineRows = (await prisma.$queryRaw`
    SELECT il.description, il.quantity, il.rate, il.discount, il.line_total, il.tax_amount,
           il.tax_rate_id, tr.rate AS gst_rate, i.hsn_sac_code, i.unit
    FROM invoice_lines il
    LEFT JOIN tax_rates tr ON tr.id = il.tax_rate_id
    LEFT JOIN items i ON i.id = il.item_id
    WHERE il.invoice_id = ${invoiceId}::uuid AND il.org_id = ${orgId}::uuid
    ORDER BY il.display_order ASC
  `) as Array<Record<string, unknown>>;

  const org: EInvoiceOrg = {
    gstin: (o.gstin as string) ?? null,
    legal_name: (o.legal_name as string) ?? null,
    name: (o.name as string) ?? "Organization",
    state_code: (o.state_code as string) ?? null,
    pin_code: (o.pin_code as string) ?? null,
    address_line: (o.address_line as string) ?? null,
    city: (o.city as string) ?? null,
    phone: (o.phone as string) ?? null,
    email: (o.email as string) ?? null
  };

  const contact: EInvoiceContact = {
    display_name: (c.display_name as string) ?? "Customer",
    company_name: (c.company_name as string) ?? null,
    tax_id: (c.tax_id as string) ?? null,
    state_code: (c.state_code as string) ?? null,
    gst_treatment: (c.gst_treatment as string) ?? "registered",
    phone: (c.phone as string) ?? null,
    email: (c.email as string) ?? null,
    billing_address: (c.billing_address as Record<string, unknown>) ?? null,
    shipping_address: (c.shipping_address as Record<string, unknown>) ?? null
  };

  const invoice: EInvoiceInvoice = {
    invoice_number: (inv.invoice_number as string) ?? "",
    issue_date: (inv.issue_date as string) ?? "",
    total: Number(inv.total ?? 0),
    subtotal: Number(inv.subtotal ?? 0),
    discount_total: Number(inv.discount_total ?? 0),
    tax_total: Number(inv.tax_total ?? 0),
    round_off: Number(inv.round_off ?? 0),
    place_of_supply: (inv.place_of_supply as string) ?? null,
    currency: (inv.currency as string) ?? "INR"
  };

  // Intra-state (seller state == POS) splits GST into CGST + SGST; otherwise IGST.
  const sellerState = org.gstin && org.gstin.length >= 2 ? org.gstin.slice(0, 2) : org.state_code ?? "";
  const pos = invoice.place_of_supply ?? (contact.tax_id && contact.tax_id.length >= 2 ? contact.tax_id.slice(0, 2) : contact.state_code ?? "");
  const intraState = Boolean(sellerState && pos && sellerState === pos);

  const lines: EInvoiceLine[] = lineRows.map((row) => {
    const taxAmount = Number(row.tax_amount ?? 0);
    const half = round2(taxAmount / 2);
    return {
      description: (row.description as string) ?? "",
      hsn_sac_code: (row.hsn_sac_code as string) ?? null,
      quantity: Number(row.quantity ?? 0),
      unit: (row.unit as string) ?? null,
      rate: Number(row.rate ?? 0),
      discount: Number(row.discount ?? 0),
      line_total: Number(row.line_total ?? 0),
      tax_amount: taxAmount,
      gst_rate: Number(row.gst_rate ?? 0),
      cgst: intraState ? half : 0,
      sgst: intraState ? round2(taxAmount - half) : 0,
      igst: intraState ? 0 : taxAmount
    };
  });

  return { org, contact, invoice, lines };
}
