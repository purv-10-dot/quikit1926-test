type DbLike = { from: (table: string) => any };

function asString(value: unknown, fallback = "") { return typeof value === "string" ? value : fallback; }
function asNumber(value: unknown) { return Number(value ?? 0); }
function formatAddress(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const r = value as Record<string, unknown>;
  return [r.line1, r.line2, r.city, r.state, r.postal_code ?? r.zip, r.country].filter((i) => typeof i === "string" && i.trim().length > 0).map((i) => String(i));
}

export type PaymentPdfData = {
  companyName: string; companyAddress: string[]; companyEmail: string;
  customerName: string; customerAddress: string[];
  paymentNumber: string; paymentDate: string; referenceNumber: string; mode: string;
  currency: string; amount: number; unused: number;
  allocations: { invoiceNumber: string; amount: number }[];
};

export async function loadPaymentPdfData(db: DbLike, orgId: string, id: string): Promise<PaymentPdfData> {
  const [{ data: p, error }, { data: organization }] = await Promise.all([
    db.from("payments").select("id, contact_id, payment_number, payment_date, reference, method, amount, unapplied_amount, currency").eq("org_id", orgId).eq("id", id).single(),
    db.from("organizations").select("name, email, address").eq("id", orgId).single()
  ]);
  if (error || !p) throw new Error("Payment was not found.");

  const [{ data: contact }, { data: allocations }] = await Promise.all([
    db.from("contacts").select("display_name, billing_address").eq("org_id", orgId).eq("id", p.contact_id).maybeSingle(),
    db.from("payment_allocations").select("amount, invoice_id").eq("payment_id", id)
  ]);

  // Resolve invoice numbers for allocations.
  const allocRows = (allocations ?? []) as Array<Record<string, unknown>>;
  const out: { invoiceNumber: string; amount: number }[] = [];
  for (const a of allocRows) {
    const { data: inv } = await db.from("invoices").select("invoice_number").eq("id", asString(a.invoice_id)).maybeSingle();
    out.push({ invoiceNumber: asString(inv?.invoice_number, "—"), amount: asNumber(a.amount) });
  }

  return {
    companyName: asString(organization?.name, "Your Company"),
    companyAddress: formatAddress(organization?.address),
    companyEmail: asString(organization?.email),
    customerName: asString(contact?.display_name, "Customer"),
    customerAddress: formatAddress(contact?.billing_address),
    paymentNumber: asString(p.payment_number),
    paymentDate: asString(p.payment_date).slice(0, 10),
    referenceNumber: asString(p.reference),
    mode: asString(p.method),
    currency: asString(p.currency, "INR"),
    amount: asNumber(p.amount),
    unused: asNumber(p.unapplied_amount),
    allocations: out
  };
}
