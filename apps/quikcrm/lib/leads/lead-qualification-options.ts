/** Technology options for lead multi-select (Topic / Technology qualification block). */
export const LEAD_TECHNOLOGY_OPTIONS = [
  "Cloud",
  "AI / ML",
  "Cybersecurity",
  "ERP",
  "CRM",
  "Data & Analytics",
  "IoT",
  "Mobile",
  "Web Development",
  "DevOps",
  "SAP",
  "Microsoft",
  "Salesforce",
  "Networking",
  "Other",
] as const;

export const LEAD_PURCHASE_TIMEFRAME_OPTIONS = [
  "Immediate",
  "This Quarter",
  "Next Quarter",
  "This Year",
  "Unknown",
] as const;

export const LEAD_BUDGET_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD"] as const;

export function parseLeadTechnology(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}
