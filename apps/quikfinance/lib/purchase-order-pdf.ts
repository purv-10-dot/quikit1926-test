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

export type PurchaseOrderPdfData = {
  companyName: string;
  companyAddress: string[];
  companyGstin: string;
  companyEmail: string;
  vendorName: string;
  vendorEmail: string;
  vendorAddress: string[];
  purchaseOrderNumber: string;
  referenceNumber: string;
  issueDate: string;
  expectedDeliveryDate: string;
  paymentTerms: string;
  deliveryMethod: string;
  currency: string;
  subtotal: number;
  discountTotal: number;
  adjustment: number;
  total: number;
  notes: string;
  terms: string;
  lineItems: { description: string; quantity: number; rate: number; discount: number; lineTotal: number }[];
};

export async function loadPurchaseOrderPdfData(db: DbLike, orgId: string, poId: string): Promise<PurchaseOrderPdfData> {
  const [{ data: po, error }, { data: organization }] = await Promise.all([
    db.from("purchase_orders")
      .select("id, contact_id, purchase_order_number, reference_number, issue_date, expected_delivery_date, payment_terms, delivery_method, subtotal, discount_total, adjustment, total, notes, terms, currency")
      .eq("org_id", orgId).eq("id", poId).single(),
    db.from("organizations").select("name, gstin, email, address, date_format").eq("id", orgId).single()
  ]);
  if (error || !po) throw new Error("Purchase order was not found.");

  const [{ data: contact }, { data: lineItems }] = await Promise.all([
    db.from("contacts").select("display_name, email, billing_address, date_format").eq("org_id", orgId).eq("id", po.contact_id).maybeSingle(),
    db.from("purchase_order_lines").select("description, quantity, rate, discount, line_total").eq("purchase_order_id", poId).order("display_order", { ascending: true })
  ]);

  const dateFmt = asString(contact?.date_format) || asString(organization?.date_format) || "DD/MM/YYYY";

  return {
    companyName: asString(organization?.name, "Your Company"),
    companyAddress: formatAddress(organization?.address),
    companyGstin: asString(organization?.gstin),
    companyEmail: asString(organization?.email),
    vendorName: asString(contact?.display_name, "Vendor"),
    vendorEmail: asString(contact?.email),
    vendorAddress: formatAddress(contact?.billing_address),
    purchaseOrderNumber: asString(po.purchase_order_number),
    referenceNumber: asString(po.reference_number),
    issueDate: formatDateForPattern(asString(po.issue_date), dateFmt),
    expectedDeliveryDate: po.expected_delivery_date ? formatDateForPattern(asString(po.expected_delivery_date), dateFmt) : "",
    paymentTerms: asString(po.payment_terms),
    deliveryMethod: asString(po.delivery_method),
    currency: asString(po.currency, "INR"),
    subtotal: asNumber(po.subtotal),
    discountTotal: asNumber(po.discount_total),
    adjustment: asNumber(po.adjustment),
    total: asNumber(po.total),
    notes: asString(po.notes),
    terms: asString(po.terms),
    lineItems: ((lineItems ?? []) as Array<Record<string, unknown>>).map((l) => ({
      description: asString(l.description),
      quantity: asNumber(l.quantity),
      rate: asNumber(l.rate),
      discount: asNumber(l.discount),
      lineTotal: asNumber(l.line_total)
    }))
  };
}
