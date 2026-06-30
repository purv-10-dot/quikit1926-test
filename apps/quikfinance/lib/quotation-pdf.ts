import { formatDateForPattern } from "@/lib/utils/dates";

type DbLike = { from: (table: string) => any };

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function asNumber(value: unknown) {
  return Number(value ?? 0);
}
function formatAddress(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const r = value as Record<string, unknown>;
  return [r.line1, r.line2, r.city, r.state, r.postal_code ?? r.zip, r.country]
    .filter((i) => typeof i === "string" && i.trim().length > 0)
    .map((i) => String(i));
}

export type QuotationPdfData = {
  companyName: string;
  companyAddress: string[];
  companyGstin: string;
  companyEmail: string;
  customerName: string;
  customerEmail: string;
  customerAddress: string[];
  quotationNumber: string;
  referenceNumber: string;
  issueDate: string;
  expiryDate: string;
  salesperson: string;
  currency: string;
  subtotal: number;
  discountTotal: number;
  adjustment: number;
  total: number;
  notes: string;
  terms: string;
  lineItems: { description: string; quantity: number; rate: number; discount: number; lineTotal: number }[];
};

export async function loadQuotationPdfData(db: DbLike, orgId: string, quotationId: string): Promise<QuotationPdfData> {
  const [{ data: quote, error: quoteError }, { data: organization }] = await Promise.all([
    db.from("quotations")
      .select("id, contact_id, quotation_number, reference_number, issue_date, expiry_date, salesperson, subtotal, discount_total, adjustment, total, notes, terms, currency")
      .eq("org_id", orgId).eq("id", quotationId).single(),
    db.from("organizations").select("name, gstin, email, address, date_format").eq("id", orgId).single()
  ]);
  if (quoteError || !quote) throw new Error("Quote was not found.");

  const [{ data: contact }, { data: lineItems }] = await Promise.all([
    db.from("contacts").select("display_name, email, billing_address, date_format").eq("org_id", orgId).eq("id", quote.contact_id).maybeSingle(),
    db.from("quotation_lines").select("description, quantity, rate, discount, line_total").eq("quotation_id", quotationId).order("display_order", { ascending: true })
  ]);

  const dateFmt = asString(contact?.date_format) || asString(organization?.date_format) || "DD/MM/YYYY";

  return {
    companyName: asString(organization?.name, "Your Company"),
    companyAddress: formatAddress(organization?.address),
    companyGstin: asString(organization?.gstin),
    companyEmail: asString(organization?.email),
    customerName: asString(contact?.display_name, "Customer"),
    customerEmail: asString(contact?.email),
    customerAddress: formatAddress(contact?.billing_address),
    quotationNumber: asString(quote.quotation_number),
    referenceNumber: asString(quote.reference_number),
    issueDate: formatDateForPattern(asString(quote.issue_date), dateFmt),
    expiryDate: quote.expiry_date ? formatDateForPattern(asString(quote.expiry_date), dateFmt) : "",
    salesperson: asString(quote.salesperson),
    currency: asString(quote.currency, "INR"),
    subtotal: asNumber(quote.subtotal),
    discountTotal: asNumber(quote.discount_total),
    adjustment: asNumber(quote.adjustment),
    total: asNumber(quote.total),
    notes: asString(quote.notes),
    terms: asString(quote.terms),
    lineItems: ((lineItems ?? []) as Array<Record<string, unknown>>).map((l) => ({
      description: asString(l.description),
      quantity: asNumber(l.quantity),
      rate: asNumber(l.rate),
      discount: asNumber(l.discount),
      lineTotal: asNumber(l.line_total)
    }))
  };
}
