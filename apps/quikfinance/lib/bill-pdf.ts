type DbLike = { from: (table: string) => any };

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function asNumber(value: unknown) {
  return Number(value ?? 0);
}
function formatAddress(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  return [record.line1, record.line2, record.city, record.state, record.zip, record.postal_code, record.country]
    .filter((item) => typeof item === "string" && item.trim().length > 0)
    .map((item) => String(item));
}

export type BillPdfData = {
  companyName: string;
  companyAddress: string[];
  companyGstin: string;
  companyEmail: string;
  vendorName: string;
  vendorAddress: string[];
  billNumber: string;
  orderNumber: string;
  reference: string;
  issueDate: string;
  dueDate: string;
  paymentTerms: string;
  currency: string;
  status: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  paymentsMade: number;
  balanceDue: number;
  notes: string;
  lineItems: { description: string; quantity: number; rate: number; discount: number; lineTotal: number }[];
};

export async function loadBillPdfData(db: DbLike, orgId: string, billId: string): Promise<BillPdfData> {
  const [{ data: bill, error: billError }, { data: organization }] = await Promise.all([
    db.from("bills").select("*").eq("org_id", orgId).eq("id", billId).single(),
    db.from("organizations").select("name, legal_name, gstin, email, address").eq("id", orgId).single()
  ]);
  if (billError || !bill) throw new Error("Bill was not found.");

  const [{ data: contact }, { data: lineItems }, { data: allocations }] = await Promise.all([
    db.from("contacts").select("display_name, email, tax_id, billing_address").eq("org_id", orgId).eq("id", bill.contact_id).maybeSingle(),
    db.from("bill_lines").select("description, quantity, rate, discount, line_total").eq("bill_id", billId).order("display_order", { ascending: true }),
    db.from("payment_allocations").select("amount").eq("org_id", orgId).eq("bill_id", billId)
  ]);

  const paymentsMade = ((allocations ?? []) as Array<{ amount: unknown }>).reduce((sum, a) => sum + asNumber(a.amount), 0);

  return {
    companyName: asString(organization?.name, "Company"),
    companyAddress: formatAddress(organization?.address),
    companyGstin: asString(organization?.gstin),
    companyEmail: asString(organization?.email),
    vendorName: asString(contact?.display_name, "Vendor"),
    vendorAddress: formatAddress(contact?.billing_address),
    billNumber: asString(bill.bill_number),
    orderNumber: asString(bill.order_number),
    reference: asString(bill.vendor_reference),
    issueDate: asString(bill.issue_date).slice(0, 10),
    dueDate: asString(bill.due_date).slice(0, 10),
    paymentTerms: asString(bill.payment_terms),
    currency: asString(bill.currency, "INR"),
    status: asString(bill.status, "draft"),
    subtotal: asNumber(bill.subtotal),
    discountTotal: asNumber(bill.discount_total),
    taxTotal: asNumber(bill.tax_total),
    total: asNumber(bill.total),
    paymentsMade,
    balanceDue: asNumber(bill.balance_due),
    notes: asString(bill.notes),
    lineItems: ((lineItems ?? []) as Array<Record<string, unknown>>).map((line) => ({
      description: asString(line.description),
      quantity: asNumber(line.quantity),
      rate: asNumber(line.rate),
      discount: asNumber(line.discount),
      lineTotal: asNumber(line.line_total)
    }))
  };
}
