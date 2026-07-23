/** Shared types, constants, and pure helpers for the estimation detail page. */

export const PILL_TONE = {
  gray:     "bg-gray-50 text-gray-700 border-gray-200",
  blue:     "bg-orange-50 text-orange-700 border-orange-200",
  orange:   "bg-orange-50 text-orange-700 border-orange-200",
  emerald:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  rose:     "bg-rose-50 text-rose-700 border-rose-200",
  amber:    "bg-amber-50 text-amber-700 border-amber-200",
  disabled: "bg-gray-50 text-gray-400 border-gray-200",
} as const;

/** Pick the right tone for the status pill without hard-coding at the call site. */
export function statusPillTone(status: string | null | undefined): string {
  const s = String(status ?? "draft").toLowerCase();
  if (s === "approved" || s === "approved_stock_available" || s === "approved_indent_required") {
    return PILL_TONE.emerald;
  }
  if (s === "rejected") return PILL_TONE.rose;
  if (s === "pending_approval") return PILL_TONE.amber;
  if (s === "inactive") return PILL_TONE.disabled;
  return PILL_TONE.gray;
}

/** Human-readable label so "pending_approval" renders as "Pending Approval". */
export function statusLabel(status: string | null | undefined): string {
  const s = String(status ?? "draft");
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// Same enums the drawer used to expose so form state stays interchangeable
// with existing estimations saved from the drawer.
export const PHASES = [
  "Foundation",
  "Sub-structure",
  "Superstructure",
  "Finishing",
  "MEP",
  "External",
];
export const STATUSES = ["Draft", "Active", "Approved", "Closed"];

/** Form shape per material row during inline edit. */
export interface MaterialLine {
  itemId: string;
  itemName: string;
  uomCode: string;
  qtyPerUnit: string;
  wasteFactor: string;
  standardRate: string;
}

export const newLine = (): MaterialLine => ({
  itemId: "",
  itemName: "",
  uomCode: "",
  qtyPerUnit: "",
  wasteFactor: "0",
  standardRate: "",
});

export function fmtQty(v: unknown, unit?: string | null) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("en-IN", { maximumFractionDigits: 4 })}${unit ? ` ${unit}` : ""}`;
}
export function fmtInr(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `₹ ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** Compute row totals the same way the drawer did on save. */
export function rowTotals(row: MaterialLine, boqQuantity: number) {
  const qtyPerUnit = parseFloat(row.qtyPerUnit) || 0;
  const wastePercent = parseFloat(row.wasteFactor) || 0;
  const rate = parseFloat(row.standardRate) || 0;
  const requiredQty = qtyPerUnit * (boqQuantity || 0);
  const totalQty = requiredQty * (1 + wastePercent / 100);
  return { qtyPerUnit, wastePercent, rate, requiredQty, totalQty, estimatedCost: totalQty * rate };
}
