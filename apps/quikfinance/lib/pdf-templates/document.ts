import type { InvoicePdfData } from "@/lib/invoice-pdf";

/** Normalised data shape every template renders from, regardless of module. */
export type DocLine = {
  sno: number;
  item: string;
  description: string;
  hsn: string;
  qty: number;
  unit: string;
  rate: number;
  discount: number;
  taxPct: number;
  tax: number;
  amount: number;
};

export type DocumentData = {
  company: { name: string; subtitle: string; address: string[]; gstin: string; pan: string; email: string };
  billTo: { label: string; name: string; address: string[]; email: string; gstin: string };
  shipTo: { name: string; address: string[] } | null;
  meta: { number: string; date: string; dueDate: string; terms: string; reference: string; subject: string };
  currency: string;
  lines: DocLine[];
  totals: { subTotal: number; discount: number; shipping: number; tax: number; roundOff: number; total: number };
  taxBreakup: { cgst: number; sgst: number; igst: number };
  notes: string;
  terms: string;
};

const LOCALE_BY_CURRENCY: Record<string, string> = { INR: "en-IN", USD: "en-US", EUR: "en-IE", GBP: "en-GB", AUD: "en-AU", CAD: "en-CA", JPY: "ja-JP" };

export function makeMoney(currency: string) {
  const code = currency && currency.length === 3 ? currency.toUpperCase() : "INR";
  const locale = LOCALE_BY_CURRENCY[code] ?? "en-IN";
  return (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(value || 0);
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigit(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ""}`;
}

/** Indian numbering (lakh/crore) words for the rupee part. */
function indianWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const hundred = Math.floor(n / 100); n %= 100;
  if (crore) parts.push(`${indianWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigit(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigit(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (n) parts.push(twoDigit(n));
  return parts.join(" ");
}

export function amountInWords(amount: number, currency: string): string {
  const code = currency && currency.length === 3 ? currency.toUpperCase() : "INR";
  const unit = code === "INR" ? "Indian Rupee" : code;
  const sub = code === "INR" ? "Paise" : "Cents";
  const rupees = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - rupees) * 100);
  let words = `${unit} ${indianWords(rupees)}`;
  if (paise) words += ` and ${twoDigit(paise)} ${sub}`;
  return `${words} Only`;
}

/** Map a loaded invoice into the generic document shape. */
export function invoiceToDocument(inv: InvoicePdfData): DocumentData {
  return {
    company: { name: inv.companyName, subtitle: inv.companySubtitle, address: inv.companyAddress, gstin: inv.companyGstin, pan: inv.companyPan, email: inv.companyEmail },
    billTo: { label: "Bill To", name: inv.customerName, address: inv.customerAddress, email: inv.customerEmail, gstin: inv.customerGstin },
    shipTo: inv.customerAddress.length ? { name: inv.customerName, address: inv.customerAddress } : null,
    meta: { number: inv.invoiceNumber, date: inv.issueDate, dueDate: inv.dueDate, terms: "", reference: "", subject: "" },
    currency: inv.currency,
    lines: inv.lineItems.map((l, i) => ({
      sno: i + 1, item: l.description, description: "", hsn: l.hsnSac, qty: l.quantity, unit: "",
      rate: l.rate, discount: l.discount, taxPct: 0, tax: l.taxAmount, amount: l.lineTotal
    })),
    totals: { subTotal: inv.subtotal, discount: inv.discountTotal, shipping: 0, tax: inv.taxTotal, roundOff: inv.roundOff, total: inv.total },
    taxBreakup: inv.taxBreakup,
    notes: inv.notes,
    terms: inv.terms
  };
}

/** Built-in sample document used for gallery previews and the editor canvas. */
export function sampleDocument(title: string): DocumentData {
  return {
    company: { name: "Zylker Inc.", subtitle: "", address: ["#11 Avenue Drive", "Pleasanton, CA 94560", "USA"], gstin: "29ABCDE1234F1Z5", pan: "ABCDE1234F", email: "billing@zylker.com" },
    billTo: { label: title.includes("PURCHASE") || title.includes("BILL") || title.includes("VENDOR") ? "Vendor" : "Bill To", name: "Rob & Joe Traders", address: ["34, Riche Street", "Chennai", "631603 Tamil Nadu", "India"], email: "accounts@robjoe.com", gstin: "33AAAAA0000A1Z5" },
    shipTo: { name: "Rob & Joe Traders", address: ["34, Riche Street", "Chennai", "631603 Tamil Nadu", "India"] },
    meta: { number: "INV-17", date: "24/06/2026", dueDate: "24/06/2026", terms: "Due on Receipt", reference: "SO-17", subject: "Design project" },
    currency: "INR",
    lines: [
      { sno: 1, item: "Brochure Design", description: "Brochure Design Single Sided Color", hsn: "998391", qty: 1, unit: "Nos", rate: 300, discount: 0, taxPct: 7, tax: 21, amount: 300 },
      { sno: 2, item: "Web Design Package (Basic)", description: "Custom themes for your business.", hsn: "998314", qty: 1, unit: "Nos", rate: 250, discount: 0, taxPct: 4.7, tax: 11.75, amount: 250 },
      { sno: 3, item: "Print Ad - Basic - Color", description: "Print Ad 1/8 size Color", hsn: "998365", qty: 1, unit: "Nos", rate: 80, discount: 0, taxPct: 0, tax: 0, amount: 80 }
    ],
    totals: { subTotal: 630, discount: 0, shipping: 0, tax: 32.75, roundOff: 0, total: 662.75 },
    taxBreakup: { cgst: 16.38, sgst: 16.37, igst: 0 },
    notes: "Thanks for your business.",
    terms: "Your company's Terms and Conditions will be displayed here."
  };
}
