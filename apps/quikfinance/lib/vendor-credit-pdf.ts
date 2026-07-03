type DbLike = { from: (table: string) => any };

function asString(value: unknown, fallback = "") { return typeof value === "string" ? value : fallback; }
function asNumber(value: unknown) { return Number(value ?? 0); }
function formatAddress(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const r = value as Record<string, unknown>;
  return [r.line1, r.line2, r.city, r.state, r.postal_code ?? r.zip, r.country].filter((i) => typeof i === "string" && i.trim().length > 0).map((i) => String(i));
}

export type VendorCreditPdfData = {
  companyName: string; companyAddress: string[]; companyGstin: string; companyEmail: string;
  vendorName: string; vendorAddress: string[];
  vendorCreditNumber: string; referenceNumber: string; issueDate: string; subject: string;
  currency: string; subtotal: number; discountTotal: number; taxTotal: number; total: number; balance: number; notes: string; terms: string;
  lineItems: { description: string; quantity: number; rate: number; discount: number; lineTotal: number }[];
};

export async function loadVendorCreditPdfData(db: DbLike, orgId: string, id: string): Promise<VendorCreditPdfData> {
  const [{ data: vc, error }, { data: organization }] = await Promise.all([
    db.from("vendor_credits").select("id, contact_id, vendor_credit_number, reference_number, issue_date, subject, subtotal, discount_total, tax_total, total, balance, notes, terms, currency").eq("org_id", orgId).eq("id", id).single(),
    db.from("organizations").select("name, gstin, email, address").eq("id", orgId).single()
  ]);
  if (error || !vc) throw new Error("Vendor credit was not found.");

  const [{ data: contact }, { data: lineItems }] = await Promise.all([
    db.from("contacts").select("display_name, billing_address").eq("org_id", orgId).eq("id", vc.contact_id).maybeSingle(),
    db.from("vendor_credit_lines").select("description, quantity, rate, discount, line_total").eq("vendor_credit_id", id).order("display_order", { ascending: true })
  ]);

  return {
    companyName: asString(organization?.name, "Your Company"),
    companyAddress: formatAddress(organization?.address),
    companyGstin: asString(organization?.gstin),
    companyEmail: asString(organization?.email),
    vendorName: asString(contact?.display_name, "Vendor"),
    vendorAddress: formatAddress(contact?.billing_address),
    vendorCreditNumber: asString(vc.vendor_credit_number),
    referenceNumber: asString(vc.reference_number),
    issueDate: asString(vc.issue_date).slice(0, 10),
    subject: asString(vc.subject),
    currency: asString(vc.currency, "INR"),
    subtotal: asNumber(vc.subtotal),
    discountTotal: asNumber(vc.discount_total),
    taxTotal: asNumber(vc.tax_total),
    total: asNumber(vc.total),
    balance: asNumber(vc.balance),
    notes: asString(vc.notes),
    terms: asString(vc.terms),
    lineItems: ((lineItems ?? []) as Array<Record<string, unknown>>).map((l) => ({
      description: asString(l.description), quantity: asNumber(l.quantity), rate: asNumber(l.rate), discount: asNumber(l.discount), lineTotal: asNumber(l.line_total)
    }))
  };
}
