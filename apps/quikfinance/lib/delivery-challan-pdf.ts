type DbLike = { from: (table: string) => any };

const CHALLAN_TYPE_LABELS: Record<string, string> = {
  supply_on_approval: "Supply on Approval",
  job_work: "Job Work",
  supply_of_liquid_gas: "Supply of Liquid Gas",
  lines_sales: "Line Sales",
  others: "Others"
};

function asString(value: unknown, fallback = "") { return typeof value === "string" ? value : fallback; }
function asNumber(value: unknown) { return Number(value ?? 0); }
function formatAddress(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const r = value as Record<string, unknown>;
  return [r.line1, r.line2, r.city, r.state, r.postal_code ?? r.zip, r.country].filter((i) => typeof i === "string" && i.trim().length > 0).map((i) => String(i));
}

export type DeliveryChallanPdfData = {
  companyName: string; companyAddress: string[]; companyGstin: string; companyEmail: string;
  customerName: string; customerAddress: string[];
  challanNumber: string; referenceNumber: string; challanDate: string; challanType: string;
  currency: string; subtotal: number; discountTotal: number; adjustment: number; total: number; notes: string; terms: string;
  lineItems: { description: string; quantity: number; rate: number; discount: number; lineTotal: number }[];
};

export async function loadDeliveryChallanPdfData(db: DbLike, orgId: string, id: string): Promise<DeliveryChallanPdfData> {
  const [{ data: dc, error }, { data: organization }] = await Promise.all([
    db.from("delivery_challans").select("id, contact_id, challan_number, reference, challan_date, challan_type, subtotal, discount_total, adjustment, total, notes, terms").eq("org_id", orgId).eq("id", id).single(),
    db.from("organizations").select("name, gstin, email, address").eq("id", orgId).single()
  ]);
  if (error || !dc) throw new Error("Delivery challan was not found.");

  const [{ data: contact }, { data: lineItems }] = await Promise.all([
    db.from("contacts").select("display_name, billing_address").eq("org_id", orgId).eq("id", dc.contact_id).maybeSingle(),
    db.from("delivery_challan_lines").select("description, quantity, rate, discount, line_total").eq("challan_id", id).order("display_order", { ascending: true })
  ]);

  return {
    companyName: asString(organization?.name, "Your Company"),
    companyAddress: formatAddress(organization?.address),
    companyGstin: asString(organization?.gstin),
    companyEmail: asString(organization?.email),
    customerName: asString(contact?.display_name, "Customer"),
    customerAddress: formatAddress(contact?.billing_address),
    challanNumber: asString(dc.challan_number),
    referenceNumber: asString(dc.reference),
    challanDate: asString(dc.challan_date).slice(0, 10),
    challanType: CHALLAN_TYPE_LABELS[asString(dc.challan_type)] ?? asString(dc.challan_type),
    currency: "INR",
    subtotal: asNumber(dc.subtotal),
    discountTotal: asNumber(dc.discount_total),
    adjustment: asNumber(dc.adjustment),
    total: asNumber(dc.total),
    notes: asString(dc.notes),
    terms: asString(dc.terms),
    lineItems: ((lineItems ?? []) as Array<Record<string, unknown>>).map((l) => ({
      description: asString(l.description), quantity: asNumber(l.quantity), rate: asNumber(l.rate), discount: asNumber(l.discount), lineTotal: asNumber(l.line_total)
    }))
  };
}
