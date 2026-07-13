import { resolveGstSplit } from "@/lib/india";
import { formatDateForPattern } from "@/lib/utils/dates";

type DbLike = {
  from: (table: string) => any;
};

type InvoiceLineRow = {
  description?: unknown;
  quantity?: unknown;
  rate?: unknown;
  discount?: unknown;
  tax_amount?: unknown;
  line_total?: unknown;
  item_id?: unknown;
};

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown) {
  return Number(value ?? 0);
}

function formatAddress(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  const record = value as Record<string, unknown>;
  return [record.line1, record.line2, record.city, record.state, record.zip, record.country]
    .filter((item) => typeof item === "string" && item.trim().length > 0)
    .map((item) => String(item));
}

export type InvoicePdfData = {
  companyName: string;
  companySubtitle: string;
  companyAddress: string[];
  companyGstin: string;
  companyPan: string;
  companyEmail: string;
  customerName: string;
  customerEmail: string;
  customerGstin: string;
  customerAddress: string[];
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  placeOfSupply: string;
  currency: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  roundOff: number;
  total: number;
  notes: string;
  terms: string;
  paymentLinkUrl: string;
  upiId: string;
  upiUri: string;
  irn: string;
  ackNumber: string;
  ackDate: string;
  taxBreakup: { cgst: number; sgst: number; igst: number };
  lineItems: {
    description: string;
    quantity: number;
    rate: number;
    discount: number;
    taxAmount: number;
    lineTotal: number;
    hsnSac: string;
  }[];
};

export async function loadInvoicePdfData(db: DbLike, orgId: string, invoiceId: string) {
  const [{ data: invoice, error: invoiceError }, { data: organization, error: organizationError }] = await Promise.all([
    db
      .from("invoices")
      .select("id, contact_id, invoice_number, issue_date, due_date, subtotal, discount_total, tax_total, round_off, total, notes, terms, place_of_supply, currency")
      .eq("org_id", orgId)
      .eq("id", invoiceId)
      .single(),
    db.from("organizations").select("name, legal_name, gstin, pan, email, address, state_code, default_upi_id, date_format").eq("id", orgId).single()
  ]);

  if (invoiceError || !invoice || organizationError || !organization) {
    throw new Error("Invoice was not found.");
  }

  const [{ data: contact }, { data: lineItems }, { data: paymentLink }] = await Promise.all([
    db
      .from("contacts")
      .select("display_name, email, tax_id, billing_address, date_format")
      .eq("org_id", orgId)
      .eq("id", invoice.contact_id)
      .maybeSingle(),
    db
      .from("invoice_lines")
      .select("description, quantity, rate, discount, tax_amount, line_total, item_id")
      .eq("invoice_id", invoiceId)
      .order("display_order", { ascending: true }),
    db
      .from("invoice_payment_links")
      .select("short_url")
      .eq("org_id", orgId)
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  const invoiceLineRows = (lineItems ?? []) as InvoiceLineRow[];
  const itemIds = invoiceLineRows
    .map((line) => asString(line.item_id))
    .filter((value) => value.length > 0);

  const itemMap = new Map<string, string>();
  if (itemIds.length > 0) {
    const itemsQuery = db.from("items").select("id, hsn_sac_code");
    const itemsResult = itemsQuery.in ? await itemsQuery.in("id", itemIds) : { data: [], error: null };
    for (const item of itemsResult.data ?? []) {
      itemMap.set(asString(item.id), asString(item.hsn_sac_code, "-"));
    }
  }

  // Dates are rendered in the customer's preferred format, falling back to the org's.
  const dateFmt = asString((contact as Record<string, unknown> | null | undefined)?.date_format) || asString(organization.date_format) || "DD/MM/YYYY";
  const fmtDate = (value: unknown) => formatDateForPattern(asString(value), dateFmt);

  const paymentLinkUrl = asString(paymentLink?.short_url);
  const upiId = asString(organization.default_upi_id);
  const upiUri =
    upiId && paymentLinkUrl
      ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(asString(organization.name))}&am=${encodeURIComponent(String(invoice.total ?? 0))}&cu=INR&tn=${encodeURIComponent(`Invoice ${invoice.invoice_number}`)}`
      : "";

  return {
    companyName: asString(organization.name),
    companySubtitle: asString(organization.legal_name),
    companyAddress: formatAddress(organization.address),
    companyGstin: asString(organization.gstin),
    companyPan: asString(organization.pan),
    companyEmail: asString(organization.email),
    customerName: asString(contact?.display_name, "Customer"),
    customerEmail: asString(contact?.email),
    customerGstin: asString(contact?.tax_id),
    customerAddress: formatAddress(contact?.billing_address),
    invoiceNumber: asString(invoice.invoice_number),
    issueDate: fmtDate(invoice.issue_date),
    dueDate: fmtDate(invoice.due_date),
    placeOfSupply: asString(invoice.place_of_supply),
    currency: asString(invoice.currency, "INR"),
    subtotal: asNumber(invoice.subtotal),
    discountTotal: asNumber(invoice.discount_total),
    taxTotal: asNumber(invoice.tax_total),
    roundOff: asNumber(invoice.round_off),
    total: asNumber(invoice.total),
    notes: asString(invoice.notes),
    terms: asString(invoice.terms),
    paymentLinkUrl,
    upiId,
    upiUri,
    irn: `IRN-PENDING-${asString(invoice.invoice_number)}`,
    ackNumber: `ACK-${asString(invoice.invoice_number)}`,
    ackDate: fmtDate(invoice.issue_date),
    taxBreakup: resolveGstSplit({
      taxableValue: asNumber(invoice.subtotal),
      taxAmount: asNumber(invoice.tax_total),
      companyStateCode: asString(organization.state_code),
      placeOfSupply: asString(invoice.place_of_supply)
    }),
    lineItems: invoiceLineRows.map((line) => ({
      description: asString(line.description),
      quantity: asNumber(line.quantity),
      rate: asNumber(line.rate),
      discount: asNumber(line.discount),
      taxAmount: asNumber(line.tax_amount),
      lineTotal: asNumber(line.line_total),
      hsnSac: itemMap.get(asString(line.item_id)) ?? "-"
    }))
  } satisfies InvoicePdfData;
}
