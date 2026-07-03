import { z } from "zod";

/** Transaction modules a PDF template can be built for (Zoho's left sub-nav). */
export const PDF_MODULES = [
  { key: "invoice", label: "Invoices", title: "TAX INVOICE", wired: true },
  { key: "quote", label: "Quotes", title: "QUOTE", wired: false },
  { key: "sales_order", label: "Sales Orders", title: "SALES ORDER", wired: false },
  { key: "delivery_challan", label: "Delivery Challans", title: "DELIVERY CHALLAN", wired: false },
  { key: "credit_note", label: "Credit Notes", title: "CREDIT NOTE", wired: false },
  { key: "purchase_order", label: "Purchase Orders", title: "PURCHASE ORDER", wired: false },
  { key: "payment_receipt", label: "Payment Receipts", title: "PAYMENT RECEIPT", wired: false },
  { key: "bill", label: "Bills", title: "BILL", wired: false },
  { key: "expense", label: "Expenses", title: "EXPENSE", wired: false },
  { key: "vendor_credit", label: "Vendor Credits", title: "VENDOR CREDIT", wired: false },
  { key: "vendor_payment", label: "Vendor Payments", title: "PAYMENT", wired: false },
  { key: "journal", label: "Journals", title: "JOURNAL", wired: false }
] as const;

export type PdfModuleKey = (typeof PDF_MODULES)[number]["key"];
export const PDF_MODULE_KEYS = PDF_MODULES.map((m) => m.key);
export function moduleMeta(key: string) {
  return PDF_MODULES.find((m) => m.key === key) ?? PDF_MODULES[0];
}

export const COLUMN_KEYS = ["sno", "item", "description", "hsn", "qty", "unit", "rate", "discount", "tax", "amount"] as const;
export type ColumnKey = (typeof COLUMN_KEYS)[number];

export type TableColumn = { key: ColumnKey; label: string; show: boolean; width: number };

export type TemplateConfig = {
  layout: "standard" | "spreadsheet";
  paperSize: "A4" | "A5" | "Letter";
  orientation: "portrait" | "landscape";
  margins: { top: number; bottom: number; left: number; right: number };
  accentColor: string;
  titleColor: string;
  headerBg: string;
  // Header
  showOrgName: boolean;
  showOrgAddress: boolean;
  showLogo: boolean;
  // Document details
  showDocumentTitle: boolean;
  documentTitle: string;
  titleFontSize: number;
  fields: { number: boolean; date: boolean; terms: boolean; dueDate: boolean; reference: boolean; subject: boolean };
  showBillTo: boolean;
  showShipTo: boolean;
  // Table
  columns: TableColumn[];
  // Totals
  showSubTotal: boolean;
  showDiscount: boolean;
  showShipping: boolean;
  showTaxDetails: boolean;
  showAmountInWords: boolean;
  currencyPosition: "before" | "after";
  // Other details
  showNotes: boolean;
  notesLabel: string;
  showTerms: boolean;
  termsLabel: string;
  showSignature: boolean;
  signatureLabel: string;
  footerText: string;
};

export const DEFAULT_COLUMNS: TableColumn[] = [
  { key: "sno", label: "#", show: true, width: 5 },
  { key: "item", label: "Item & Description", show: true, width: 34 },
  { key: "hsn", label: "HSN/SAC", show: false, width: 11 },
  { key: "qty", label: "Qty", show: true, width: 10 },
  { key: "rate", label: "Rate", show: true, width: 12 },
  { key: "discount", label: "Discount", show: false, width: 10 },
  { key: "tax", label: "Tax", show: true, width: 11 },
  { key: "amount", label: "Amount", show: true, width: 13 }
];

export function defaultConfig(): TemplateConfig {
  return {
    layout: "standard",
    paperSize: "A4",
    orientation: "portrait",
    margins: { top: 0.7, bottom: 0.7, left: 0.55, right: 0.4 },
    accentColor: "#0F766E",
    titleColor: "#0F172A",
    headerBg: "#ffffff",
    showOrgName: true,
    showOrgAddress: true,
    showLogo: false,
    showDocumentTitle: true,
    documentTitle: "TAX INVOICE",
    titleFontSize: 22,
    fields: { number: true, date: true, terms: true, dueDate: true, reference: true, subject: false },
    showBillTo: true,
    showShipTo: true,
    columns: DEFAULT_COLUMNS.map((c) => ({ ...c })),
    showSubTotal: true,
    showDiscount: true,
    showShipping: false,
    showTaxDetails: true,
    showAmountInWords: true,
    currencyPosition: "before",
    showNotes: true,
    notesLabel: "Notes",
    showTerms: true,
    termsLabel: "Terms & Conditions",
    showSignature: true,
    signatureLabel: "Authorized Signature",
    footerText: ""
  };
}

/** Coerce a partial/legacy stored config into a complete, valid one. */
export function normalizeConfig(raw: unknown): TemplateConfig {
  const base = defaultConfig();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<TemplateConfig>;
  const cols = Array.isArray(r.columns) && r.columns.length
    ? base.columns.map((bc) => {
        const found = (r.columns as TableColumn[]).find((c) => c?.key === bc.key);
        return found ? { ...bc, ...found } : bc;
      })
    : base.columns;
  return {
    ...base,
    ...r,
    margins: { ...base.margins, ...(r.margins ?? {}) },
    fields: { ...base.fields, ...(r.fields ?? {}) },
    columns: cols
  };
}

const columnSchema = z.object({
  key: z.enum(COLUMN_KEYS),
  label: z.string().max(60),
  show: z.boolean(),
  width: z.coerce.number().min(0).max(100)
});

export const templateConfigSchema = z.object({
  layout: z.enum(["standard", "spreadsheet"]),
  paperSize: z.enum(["A4", "A5", "Letter"]),
  orientation: z.enum(["portrait", "landscape"]),
  margins: z.object({ top: z.coerce.number(), bottom: z.coerce.number(), left: z.coerce.number(), right: z.coerce.number() }),
  accentColor: z.string(),
  titleColor: z.string(),
  headerBg: z.string(),
  showOrgName: z.boolean(),
  showOrgAddress: z.boolean(),
  showLogo: z.boolean(),
  showDocumentTitle: z.boolean(),
  documentTitle: z.string().max(60),
  titleFontSize: z.coerce.number().min(8).max(48),
  fields: z.object({ number: z.boolean(), date: z.boolean(), terms: z.boolean(), dueDate: z.boolean(), reference: z.boolean(), subject: z.boolean() }),
  showBillTo: z.boolean(),
  showShipTo: z.boolean(),
  columns: z.array(columnSchema),
  showSubTotal: z.boolean(),
  showDiscount: z.boolean(),
  showShipping: z.boolean(),
  showTaxDetails: z.boolean(),
  showAmountInWords: z.boolean(),
  currencyPosition: z.enum(["before", "after"]),
  showNotes: z.boolean(),
  notesLabel: z.string().max(60),
  showTerms: z.boolean(),
  termsLabel: z.string().max(60),
  showSignature: z.boolean(),
  signatureLabel: z.string().max(60),
  footerText: z.string().max(500)
});

export const createTemplateSchema = z.object({
  module: z.enum(PDF_MODULE_KEYS as [string, ...string[]]),
  name: z.string().trim().min(1).max(80),
  base: z.string().trim().min(1).max(60).default("standard"),
  config: templateConfigSchema.partial().optional(),
  clone_from: z.string().uuid().optional()
});

export const updateTemplateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  config: templateConfigSchema.optional()
});
