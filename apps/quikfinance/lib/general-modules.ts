/**
 * Optional modules that can be enabled/disabled in Setup & Configurations → General.
 * `hrefs` are the nav destinations hidden when the module is turned off. Core
 * modules (invoices, bills, customers, banking, reports…) are always on.
 */
export type ModuleToggle = { key: string; label: string; hrefs: string[]; hint?: string };

export const MODULE_TOGGLES: ModuleToggle[] = [
  { key: "quotes", label: "Quotes", hrefs: ["/quotations"] },
  { key: "sales_orders", label: "Sales Orders", hrefs: ["/sales-orders"] },
  { key: "delivery_challans", label: "Delivery Challans", hrefs: ["/delivery-challans"] },
  { key: "purchase_orders", label: "Purchase Orders", hrefs: ["/purchase-orders"] },
  { key: "goods_receipts", label: "Goods Receipts", hrefs: ["/goods-receipts"] },
  { key: "time_tracking", label: "Time Tracking", hrefs: ["/time-tracking"], hint: "Track billable hours against projects." },
  { key: "projects", label: "Projects", hrefs: ["/projects"] },
  { key: "recurring", label: "Recurring (Invoices, Bills, Journals)", hrefs: ["/recurring"] },
  { key: "credit_notes", label: "Credit Notes", hrefs: ["/credit-notes"] },
  { key: "vendor_credits", label: "Vendor Credits", hrefs: ["/vendor-credits"] },
  { key: "budgets", label: "Budgets", hrefs: ["/budgets"] },
  { key: "fixed_assets", label: "Fixed Assets", hrefs: ["/fixed-assets"] }
];

export const MODULE_KEYS = MODULE_TOGGLES.map((m) => m.key);

export const WEEK_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Given the set of disabled module keys, the nav hrefs that should be hidden. */
export function disabledHrefs(disabled: string[]): Set<string> {
  const set = new Set<string>();
  for (const m of MODULE_TOGGLES) if (disabled.includes(m.key)) m.hrefs.forEach((h) => set.add(h));
  return set;
}
