import { defaultConfig, normalizeConfig, type TemplateConfig } from "./config";

export type TemplatePreset = {
  key: string;
  name: string;
  category: "Standard" | "Spreadsheet" | "Premium" | "Universal" | "Retail";
  /** Base render style. */
  layout: "standard" | "spreadsheet";
  /** Short blurb shown under the thumbnail. */
  blurb: string;
  config: TemplateConfig;
};

function preset(
  partial: Pick<TemplatePreset, "key" | "name" | "category" | "layout" | "blurb"> & { config?: Partial<TemplateConfig> }
): TemplatePreset {
  return {
    key: partial.key,
    name: partial.name,
    category: partial.category,
    layout: partial.layout,
    blurb: partial.blurb,
    config: normalizeConfig({ ...defaultConfig(), layout: partial.layout, ...(partial.config ?? {}) })
  };
}

const SPREADSHEET_COLUMNS = [
  { key: "sno", label: "#", show: true, width: 5 },
  { key: "item", label: "Item & Description", show: true, width: 30 },
  { key: "qty", label: "Qty", show: true, width: 10 },
  { key: "rate", label: "Rate", show: true, width: 12 },
  { key: "discount", label: "Discount", show: true, width: 11 },
  { key: "tax", label: "Tax %", show: true, width: 10 },
  { key: "amount", label: "Amount", show: true, width: 14 }
] as const;

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  // ---- Standard (6) ----
  preset({ key: "standard", name: "Standard", category: "Standard", layout: "standard", blurb: "Clean, classic layout with a coloured brand name.", config: { accentColor: "#0F766E" } }),
  preset({ key: "standard-japanese", name: "Standard - Japanese Style", category: "Standard", layout: "standard", blurb: "Compact header with seal boxes for stamps.", config: { accentColor: "#1E3A8A", titleColor: "#1E3A8A" } }),
  preset({ key: "standard-japanese-noseal", name: "Standard - Japanese (No Seal)", category: "Standard", layout: "standard", blurb: "Japanese layout without the seal boxes.", config: { accentColor: "#1E3A8A" } }),
  preset({ key: "standard-european", name: "Standard - European Style", category: "Standard", layout: "standard", blurb: "European fields and date formatting.", config: { accentColor: "#334155" } }),
  preset({ key: "standard-india-gst", name: "Standard - India GST Style", category: "Standard", layout: "standard", blurb: "Shows HSN/SAC and a GST tax breakup.", config: { accentColor: "#B45309", documentTitle: "TAX INVOICE", columns: [
    { key: "sno", label: "#", show: true, width: 5 },
    { key: "item", label: "Item & Description", show: true, width: 28 },
    { key: "hsn", label: "HSN/SAC", show: true, width: 11 },
    { key: "qty", label: "Qty", show: true, width: 9 },
    { key: "rate", label: "Rate", show: true, width: 11 },
    { key: "discount", label: "Discount", show: false, width: 10 },
    { key: "tax", label: "Tax", show: true, width: 11 },
    { key: "amount", label: "Amount", show: true, width: 14 }
  ] } }),
  preset({ key: "pos-standard", name: "POS Standard", category: "Standard", layout: "standard", blurb: "Narrow receipt-style layout for retail counters.", config: { paperSize: "A5", accentColor: "#0F172A", showShipTo: false } }),

  // ---- Spreadsheet (4) ----
  preset({ key: "spreadsheet", name: "Spreadsheet", category: "Spreadsheet", layout: "spreadsheet", blurb: "Full gridlines, every column visible.", config: { columns: SPREADSHEET_COLUMNS.map((c) => ({ ...c })) } }),
  preset({ key: "spreadsheet-plus", name: "Spreadsheet - Plus", category: "Spreadsheet", layout: "spreadsheet", blurb: "Spreadsheet with tax % and tax amount split.", config: { showTaxDetails: true, columns: [
    { key: "sno", label: "#", show: true, width: 5 },
    { key: "item", label: "Item & Description", show: true, width: 26 },
    { key: "qty", label: "Qty", show: true, width: 9 },
    { key: "rate", label: "Rate", show: true, width: 11 },
    { key: "discount", label: "Discount", show: true, width: 11 },
    { key: "tax", label: "Tax %", show: true, width: 10 },
    { key: "amount", label: "Amount", show: true, width: 14 }
  ] } }),
  preset({ key: "spreadsheet-lite", name: "Spreadsheet - Lite", category: "Spreadsheet", layout: "spreadsheet", blurb: "Fewer columns for simple line items.", config: { columns: [
    { key: "sno", label: "#", show: true, width: 6 },
    { key: "item", label: "Item & Description", show: true, width: 48 },
    { key: "qty", label: "Qty", show: true, width: 12 },
    { key: "rate", label: "Rate", show: true, width: 16 },
    { key: "amount", label: "Amount", show: true, width: 18 }
  ] } }),
  preset({ key: "spreadsheet-compact", name: "Spreadsheet - Compact", category: "Spreadsheet", layout: "spreadsheet", blurb: "Dense rows to fit more items per page.", config: { titleFontSize: 18, columns: SPREADSHEET_COLUMNS.map((c) => ({ ...c })) } }),

  // ---- Premium (3) ----
  preset({ key: "minimalist", name: "Minimalist", category: "Premium", layout: "standard", blurb: "Bold accent band, lots of whitespace.", config: { accentColor: "#E11D48", titleColor: "#E11D48", showOrgAddress: true } }),
  preset({ key: "grand", name: "Grand", category: "Premium", layout: "standard", blurb: "Dark full-width header banner.", config: { accentColor: "#0F172A", headerBg: "#0F172A", titleColor: "#0F172A" } }),
  preset({ key: "continental", name: "Continental", category: "Premium", layout: "standard", blurb: "Right-aligned logo, refined typography.", config: { accentColor: "#15803D" } }),

  // ---- Universal (4) ----
  preset({ key: "universal", name: "Universal", category: "Universal", layout: "standard", blurb: "Works for any region, neutral styling.", config: { accentColor: "#2563EB" } }),
  preset({ key: "universal-bold", name: "Universal - Bold", category: "Universal", layout: "standard", blurb: "Heavier headings and dividers.", config: { accentColor: "#7C3AED", titleColor: "#7C3AED" } }),
  preset({ key: "universal-classic", name: "Universal - Classic", category: "Universal", layout: "standard", blurb: "Serif-leaning classic business look.", config: { accentColor: "#374151" } }),
  preset({ key: "universal-slim", name: "Universal - Slim", category: "Universal", layout: "standard", blurb: "Slim margins for more content.", config: { margins: { top: 0.5, bottom: 0.5, left: 0.4, right: 0.4 }, accentColor: "#0891B2" } }),

  // ---- Retail (4) ----
  preset({ key: "retail", name: "Retail", category: "Retail", layout: "standard", blurb: "Retail-friendly with prominent totals.", config: { paperSize: "A5", accentColor: "#DB2777" } }),
  preset({ key: "retail-thermal", name: "Retail - Thermal", category: "Retail", layout: "standard", blurb: "Thermal-printer receipt style.", config: { paperSize: "A5", accentColor: "#0F172A", showShipTo: false, showBillTo: false } }),
  preset({ key: "retail-counter", name: "Retail - Counter", category: "Retail", layout: "spreadsheet", blurb: "Counter sales with itemised grid.", config: { paperSize: "A5", columns: SPREADSHEET_COLUMNS.map((c) => ({ ...c })) } }),
  preset({ key: "retail-gst", name: "Retail - GST", category: "Retail", layout: "standard", blurb: "Retail bill with GST summary.", config: { paperSize: "A5", accentColor: "#B45309" } })
];

export const PRESET_CATEGORIES = ["Standard", "Spreadsheet", "Premium", "Universal", "Retail"] as const;

export function presetByKey(key: string): TemplatePreset | undefined {
  return TEMPLATE_PRESETS.find((p) => p.key === key);
}
