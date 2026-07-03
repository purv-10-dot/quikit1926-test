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

export type SalesOrderPdfData = {
  companyName: string;
  companyAddress: string[];
  companyGstin: string;
  companyEmail: string;
  customerName: string;
  customerEmail: string;
  customerAddress: string[];
  salesOrderNumber: string;
  referenceNumber: string;
  issueDate: string;
  expectedShipmentDate: string;
  paymentTerms: string;
  deliveryMethod: string;
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

export async function loadSalesOrderPdfData(db: DbLike, orgId: string, soId: string): Promise<SalesOrderPdfData> {
  const [{ data: so, error }, { data: organization }] = await Promise.all([
    db.from("sales_orders")
      .select("id, contact_id, sales_order_number, reference_number, issue_date, expected_shipment_date, payment_terms, delivery_method, salesperson, subtotal, discount_total, adjustment, total, notes, terms, currency")
      .eq("org_id", orgId).eq("id", soId).single(),
    db.from("organizations").select("name, gstin, email, address, date_format").eq("id", orgId).single()
  ]);
  if (error || !so) throw new Error("Sales order was not found.");

  const [{ data: contact }, { data: lineItems }] = await Promise.all([
    db.from("contacts").select("display_name, email, billing_address, date_format").eq("org_id", orgId).eq("id", so.contact_id).maybeSingle(),
    db.from("sales_order_lines").select("description, quantity, rate, discount, line_total").eq("sales_order_id", soId).order("display_order", { ascending: true })
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
    salesOrderNumber: asString(so.sales_order_number),
    referenceNumber: asString(so.reference_number),
    issueDate: formatDateForPattern(asString(so.issue_date), dateFmt),
    expectedShipmentDate: so.expected_shipment_date ? formatDateForPattern(asString(so.expected_shipment_date), dateFmt) : "",
    paymentTerms: asString(so.payment_terms),
    deliveryMethod: asString(so.delivery_method),
    salesperson: asString(so.salesperson),
    currency: asString(so.currency, "INR"),
    subtotal: asNumber(so.subtotal),
    discountTotal: asNumber(so.discount_total),
    adjustment: asNumber(so.adjustment),
    total: asNumber(so.total),
    notes: asString(so.notes),
    terms: asString(so.terms),
    lineItems: ((lineItems ?? []) as Array<Record<string, unknown>>).map((l) => ({
      description: asString(l.description),
      quantity: asNumber(l.quantity),
      rate: asNumber(l.rate),
      discount: asNumber(l.discount),
      lineTotal: asNumber(l.line_total)
    }))
  };
}
