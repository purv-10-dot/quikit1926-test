/**
 * e-Invoice (IRP / GSTN) and e-Way bill (NIC) payload builders.
 *
 * These construct the exact JSON the government portals expect (e-Invoice
 * schema v1.1 / e-Way bill v1.03) from a QuikFinance invoice, its org, and the
 * customer. Building and validating the payload is done entirely here; the
 * actual HTTP submission lives in `irp-client.ts` and runs only when GSTN/NIC
 * credentials are configured. The payloads are correct and submission-ready.
 */

export type EInvoiceOrg = {
  gstin: string | null;
  legal_name: string | null;
  name: string;
  state_code: string | null;
  pin_code: string | null;
  address_line: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
};

export type EInvoiceContact = {
  display_name: string;
  company_name: string | null;
  tax_id: string | null; // GSTIN
  state_code: string | null;
  gst_treatment: string;
  phone: string | null;
  email: string | null;
  billing_address: Record<string, unknown> | null;
  shipping_address: Record<string, unknown> | null;
};

export type EInvoiceInvoice = {
  invoice_number: string;
  issue_date: string; // YYYY-MM-DD
  total: number;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  round_off: number;
  place_of_supply: string | null;
  currency: string;
};

export type EInvoiceLine = {
  description: string;
  hsn_sac_code: string | null;
  quantity: number;
  unit: string | null;
  rate: number;
  discount: number;
  line_total: number;
  tax_amount: number;
  gst_rate: number;
  cgst: number;
  sgst: number;
  igst: number;
};

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const ddmmyyyy = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const gstinState = (gstin: string | null, fallback: string | null) =>
  gstin && gstin.length >= 2 ? gstin.slice(0, 2) : fallback ?? "";

function addressString(address: Record<string, unknown> | null, key: string): string {
  if (!address) return "";
  const value = address[key];
  return typeof value === "string" ? value : "";
}

export type EInvoiceValidation = { ok: boolean; errors: string[] };

/** Pre-flight validation: the IRP rejects payloads missing these. */
export function validateForEInvoice(org: EInvoiceOrg, contact: EInvoiceContact, invoice: EInvoiceInvoice): EInvoiceValidation {
  const errors: string[] = [];
  if (!org.gstin) errors.push("Your organization GSTIN is not set (Settings → Company).");
  if (!org.state_code && !org.gstin) errors.push("Your organization state code is not set.");
  if (contact.gst_treatment !== "consumer" && contact.gst_treatment !== "unregistered" && !contact.tax_id) {
    errors.push("The customer GSTIN is required for B2B e-Invoices.");
  }
  if (!invoice.place_of_supply) errors.push("Place of supply (POS) is required.");
  if (invoice.total <= 0) errors.push("Invoice total must be greater than zero.");
  return { ok: errors.length === 0, errors };
}

/** Build the IRP e-Invoice JSON (schema v1.1). */
export function buildEInvoicePayload(
  org: EInvoiceOrg,
  contact: EInvoiceContact,
  invoice: EInvoiceInvoice,
  lines: EInvoiceLine[]
): Record<string, unknown> {
  const sellerState = gstinState(org.gstin, org.state_code);
  const buyerState = gstinState(contact.tax_id, contact.state_code);
  const pos = invoice.place_of_supply ?? buyerState;
  const isInterState = sellerState !== pos;

  const totalCgst = round2(lines.reduce((sum, l) => sum + l.cgst, 0));
  const totalSgst = round2(lines.reduce((sum, l) => sum + l.sgst, 0));
  const totalIgst = round2(lines.reduce((sum, l) => sum + l.igst, 0));
  const assessableValue = round2(lines.reduce((sum, l) => sum + l.line_total, 0));

  return {
    Version: "1.1",
    TranDtls: {
      TaxSch: "GST",
      SupTyp: contact.tax_id ? "B2B" : "B2C",
      RegRev: "N",
      IgstOnIntra: "N"
    },
    DocDtls: {
      Typ: "INV",
      No: invoice.invoice_number,
      Dt: ddmmyyyy(invoice.issue_date)
    },
    SellerDtls: {
      Gstin: org.gstin ?? "",
      LglNm: org.legal_name ?? org.name,
      Addr1: org.address_line ?? org.name,
      Loc: org.city ?? "NA",
      Pin: Number(org.pin_code ?? 0) || 999999,
      Stcd: sellerState,
      Ph: org.phone ?? undefined,
      Em: org.email ?? undefined
    },
    BuyerDtls: {
      Gstin: contact.tax_id ?? "URP",
      LglNm: contact.company_name ?? contact.display_name,
      Pos: pos,
      Addr1: addressString(contact.billing_address, "line1") || contact.display_name,
      Loc: addressString(contact.billing_address, "city") || "NA",
      Pin: Number(addressString(contact.billing_address, "pin_code")) || 999999,
      Stcd: buyerState,
      Ph: contact.phone ?? undefined,
      Em: contact.email ?? undefined
    },
    ItemList: lines.map((line, index) => ({
      SlNo: String(index + 1),
      PrdDesc: line.description,
      IsServc: line.hsn_sac_code && line.hsn_sac_code.startsWith("99") ? "Y" : "N",
      HsnCd: line.hsn_sac_code ?? "",
      Qty: round2(line.quantity),
      Unit: (line.unit ?? "NOS").toUpperCase().slice(0, 8),
      UnitPrice: round2(line.rate),
      TotAmt: round2(line.quantity * line.rate),
      Discount: round2(line.discount),
      AssAmt: round2(line.line_total),
      GstRt: round2(line.gst_rate),
      IgstAmt: round2(line.igst),
      CgstAmt: round2(line.cgst),
      SgstAmt: round2(line.sgst),
      TotItemVal: round2(line.line_total + line.tax_amount)
    })),
    ValDtls: {
      AssVal: assessableValue,
      CgstVal: totalCgst,
      SgstVal: totalSgst,
      IgstVal: totalIgst,
      Discount: round2(invoice.discount_total),
      RndOffAmt: round2(invoice.round_off),
      TotInvVal: round2(invoice.total)
    },
    // Convenience flag for the caller — not part of the IRP schema.
    _meta: { isInterState, sellerState, pos }
  };
}

export type EWayDetails = {
  transport_mode?: "1" | "2" | "3" | "4"; // road / rail / air / ship
  vehicle_no?: string | null;
  transporter_id?: string | null;
  transporter_name?: string | null;
  distance_km?: number;
  transport_doc_no?: string | null;
  transport_doc_date?: string | null;
};

/** Build the NIC e-Way bill JSON (v1.03). Requires the invoice to be e-Invoiced or carry IRN where applicable. */
export function buildEWayBillPayload(
  org: EInvoiceOrg,
  contact: EInvoiceContact,
  invoice: EInvoiceInvoice,
  lines: EInvoiceLine[],
  details: EWayDetails = {}
): Record<string, unknown> {
  const sellerState = gstinState(org.gstin, org.state_code);
  const buyerState = gstinState(contact.tax_id, contact.state_code);
  const pos = invoice.place_of_supply ?? buyerState;

  const totalCgst = round2(lines.reduce((sum, l) => sum + l.cgst, 0));
  const totalSgst = round2(lines.reduce((sum, l) => sum + l.sgst, 0));
  const totalIgst = round2(lines.reduce((sum, l) => sum + l.igst, 0));
  const assessableValue = round2(lines.reduce((sum, l) => sum + l.line_total, 0));

  return {
    supplyType: "O", // outward
    subSupplyType: "1", // supply
    docType: "INV",
    docNo: invoice.invoice_number,
    docDate: ddmmyyyy(invoice.issue_date),
    fromGstin: org.gstin ?? "",
    fromTrdName: org.legal_name ?? org.name,
    fromAddr1: org.address_line ?? org.name,
    fromPlace: org.city ?? "NA",
    fromPincode: Number(org.pin_code ?? 0) || 999999,
    fromStateCode: Number(sellerState) || 0,
    actFromStateCode: Number(sellerState) || 0,
    toGstin: contact.tax_id ?? "URP",
    toTrdName: contact.company_name ?? contact.display_name,
    toAddr1: addressString(contact.shipping_address, "line1") || addressString(contact.billing_address, "line1") || contact.display_name,
    toPlace: addressString(contact.shipping_address, "city") || "NA",
    toPincode: Number(addressString(contact.shipping_address, "pin_code")) || 999999,
    toStateCode: Number(pos) || 0,
    actToStateCode: Number(buyerState) || 0,
    totalValue: assessableValue,
    cgstValue: totalCgst,
    sgstValue: totalSgst,
    igstValue: totalIgst,
    cessValue: 0,
    totInvValue: round2(invoice.total),
    transactionType: 1,
    transMode: details.transport_mode ?? "1",
    transDistance: String(details.distance_km ?? 0),
    transporterId: details.transporter_id ?? undefined,
    transporterName: details.transporter_name ?? undefined,
    transDocNo: details.transport_doc_no ?? undefined,
    transDocDate: details.transport_doc_date ? ddmmyyyy(details.transport_doc_date) : undefined,
    vehicleNo: details.vehicle_no ?? undefined,
    vehicleType: "R",
    itemList: lines.map((line, index) => ({
      productName: line.description,
      hsnCode: Number(line.hsn_sac_code ?? 0) || 0,
      quantity: round2(line.quantity),
      qtyUnit: (line.unit ?? "NOS").toUpperCase().slice(0, 8),
      taxableAmount: round2(line.line_total),
      cgstRate: round2(line.cgst > 0 ? line.gst_rate / 2 : 0),
      sgstRate: round2(line.sgst > 0 ? line.gst_rate / 2 : 0),
      igstRate: round2(line.igst > 0 ? line.gst_rate : 0),
      cessRate: 0
    }))
  };
}
