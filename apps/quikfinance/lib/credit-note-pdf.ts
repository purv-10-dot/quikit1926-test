type DbLike = { from: (table: string) => any };

function asString(value: unknown, fallback = "") { return typeof value === "string" ? value : fallback; }
function asNumber(value: unknown) { return Number(value ?? 0); }
function formatAddress(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const r = value as Record<string, unknown>;
  return [r.line1, r.line2, r.city, r.state, r.postal_code ?? r.zip, r.country].filter((i) => typeof i === "string" && i.trim().length > 0).map((i) => String(i));
}

export type CreditNotePdfData = {
  companyName: string; companyAddress: string[]; companyGstin: string; companyEmail: string;
  customerName: string; customerAddress: string[];
  creditNoteNumber: string; referenceNumber: string; issueDate: string; subject: string;
  currency: string; subtotal: number; discountTotal: number; adjustment: number; taxTotal: number; total: number; balance: number; notes: string; terms: string;
  lineItems: { description: string; quantity: number; rate: number; discount: number; lineTotal: number }[];
};

export async function loadCreditNotePdfData(db: DbLike, orgId: string, id: string): Promise<CreditNotePdfData> {
  const [{ data: cn, error }, { data: organization }] = await Promise.all([
    db.from("credit_notes").select("id, contact_id, credit_note_number, reference_number, issue_date, subject, subtotal, discount_total, round_off, tax_total, total, balance, notes, terms, currency").eq("org_id", orgId).eq("id", id).single(),
    db.from("organizations").select("name, gstin, email, address").eq("id", orgId).single()
  ]);
  if (error || !cn) throw new Error("Credit note was not found.");

  const [{ data: contact }, { data: lineItems }] = await Promise.all([
    db.from("contacts").select("display_name, billing_address").eq("org_id", orgId).eq("id", cn.contact_id).maybeSingle(),
    db.from("credit_note_lines").select("description, quantity, rate, discount, line_total").eq("credit_note_id", id).order("display_order", { ascending: true })
  ]);

  return {
    companyName: asString(organization?.name, "Your Company"),
    companyAddress: formatAddress(organization?.address),
    companyGstin: asString(organization?.gstin),
    companyEmail: asString(organization?.email),
    customerName: asString(contact?.display_name, "Customer"),
    customerAddress: formatAddress(contact?.billing_address),
    creditNoteNumber: asString(cn.credit_note_number),
    referenceNumber: asString(cn.reference_number),
    issueDate: asString(cn.issue_date).slice(0, 10),
    subject: asString(cn.subject),
    currency: asString(cn.currency, "INR"),
    subtotal: asNumber(cn.subtotal),
    discountTotal: asNumber(cn.discount_total),
    adjustment: asNumber(cn.round_off),
    taxTotal: asNumber(cn.tax_total),
    total: asNumber(cn.total),
    balance: asNumber(cn.balance),
    notes: asString(cn.notes),
    terms: asString(cn.terms),
    lineItems: ((lineItems ?? []) as Array<Record<string, unknown>>).map((l) => ({
      description: asString(l.description), quantity: asNumber(l.quantity), rate: asNumber(l.rate), discount: asNumber(l.discount), lineTotal: asNumber(l.line_total)
    }))
  };
}
