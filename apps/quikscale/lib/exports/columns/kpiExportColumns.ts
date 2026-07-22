/**
 * Server-side column registry for the KPI export (Individual + Team).
 *
 * Column KEYS match the client table columns (see kpi/hooks/useTableColumns.ts
 * `COL_LABELS`) so the keys the user selects in the Global Export modal line up
 * with what the server renders. Week columns are generated for the selected
 * week range only.
 */
import type { Cell } from "../buildWorkbook";
import { kpiWeekArgb } from "../exportColors";
import { formatScaledKpiValue } from "@/lib/utils/kpiHelpers";

/** Flattened, name-resolved KPI row the column extractors read. */
export interface KpiExportRow {
  /** Which quarter this row belongs to. Populated for the combined
   *  multi-quarter ("Full Year") sheet so a leading Quarter column can
   *  distinguish rows; unused for single-quarter sheets. */
  quarter?: string;
  name: string | null;
  ownerName: string;
  teamName: string;
  teamHeadName: string;
  measurementUnit: string | null;
  /** Currency-display metadata so numeric columns render exactly like the KPI
   *  module's `formatScaledKpiValue` (₹4 Cr / $9 M / 795.6K / "16 lb"). */
  currency: string | null;
  targetScale: string | null;
  scaledDisplay: boolean;
  unit: string | null;
  target: number | null;
  quarterlyGoal: number | null;
  qtdGoal: number | null;
  qtdAchieved: number | null;
  /** Per-week goal for the quarter's current week (weeklyTargets[wk] or flat split). */
  weeklyGoal: number | null;
  progressPercent: number | null;
  description: string | null;
  lastNotes: string | null;
  importedFromOpsp: boolean;
  createdByName: string;
  updatedByName: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  /** weekNumber → aggregated value (null when not entered). */
  weekMap: Record<number, number | null>;
  /** weekNumber → the week's target (drives the traffic-light color). */
  weekTargetMap: Record<number, number>;
  /** KPI reverse-color flag (lower-is-better). */
  reverseColor: boolean;
}

export interface KpiExportColumn {
  key: string;
  label: string;
  value: (row: KpiExportRow) => Cell;
  /** Optional cell fill (ARGB) — used by the weekly traffic-light columns. */
  fill?: (row: KpiExportRow) => string | undefined;
}

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

/**
 * Format a KPI goal/value number exactly as the Individual/Team KPI table does,
 * so exported cells match the on-screen display (currency + scale unit "₹4 Cr" /
 * "$9 M", INR lakh/crore, compact "795.6K", Number-KPI unit suffix "16 lb").
 *
 * `numberFormat: "standard"` mirrors the module pages (only the Dashboard passes
 * "indian"); INR still forces the Indian magnitude internally, matching the UI.
 * Returns "" for null/undefined so the cell renders blank rather than "—".
 */
function fmtVal(row: KpiExportRow, v: number | null | undefined): string {
  if (v == null) return "";
  return formatScaledKpiValue(v, {
    measurementUnit: row.measurementUnit,
    currency: row.currency,
    targetScale: row.targetScale,
    scaledDisplay: row.scaledDisplay,
    unit: row.unit,
    numberFormat: "standard",
  });
}

/** Static (non-week) columns, in table order. */
const STATIC_COLUMNS: KpiExportColumn[] = [
  { key: "progress", label: "Progress", value: (r) => (r.progressPercent != null ? `${r.progressPercent.toFixed(1)}%` : "") },
  { key: "owner", label: "Owner", value: (r) => r.ownerName },
  { key: "kpiName", label: "KPI Name", value: (r) => r.name ?? "" },
  { key: "team", label: "Team", value: (r) => r.teamName },
  { key: "teamHead", label: "Team Head", value: (r) => r.teamHeadName },
  { key: "kpiOwner", label: "KPI Owner", value: (r) => r.ownerName },
  { key: "measurementUnit", label: "Measurement Unit", value: (r) => r.measurementUnit ?? "" },
  { key: "targetValue", label: "Target Value", value: (r) => fmtVal(r, r.target) },
  { key: "quarterlyGoal", label: "Quarterly Goal", value: (r) => fmtVal(r, r.quarterlyGoal) },
  { key: "qtdGoal", label: "QTD Goal", value: (r) => fmtVal(r, r.qtdGoal) },
  // QTD Achieved shows "0" (not blank) when null — matches the module's cell.
  { key: "qtdAchieved", label: "QTD Achieved", value: (r) => fmtVal(r, r.qtdAchieved ?? 0) },
  { key: "weeklyGoal", label: "Weekly Goal", value: (r) => fmtVal(r, r.weeklyGoal) },
  { key: "description", label: "Description", value: (r) => r.description ?? "" },
  { key: "lastNotes", label: "Last Notes", value: (r) => r.lastNotes ?? "" },
  { key: "importedFromOpsp", label: "Imported from OPSP", value: (r) => (r.importedFromOpsp ? "Yes" : "No") },
  { key: "createdBy", label: "Created By", value: (r) => r.createdByName },
  { key: "updatedBy", label: "Updated By", value: (r) => r.updatedByName },
  { key: "createdAt", label: "Created Date", value: (r) => fmtDate(r.createdAt) },
  { key: "updatedAt", label: "Updated Date", value: (r) => fmtDate(r.updatedAt) },
];

/** Week columns for the selected range (e.g. weeks [4..13] → "Week 4".."Week 13"). */
export function kpiWeekColumns(weeks: number[]): KpiExportColumn[] {
  return weeks.map((w) => ({
    key: `week${w}`,
    label: `Week ${w}`,
    // Text matches the module cell (compact/currency); the fill below still
    // derives the traffic-light color from the RAW value, so colors are unchanged.
    value: (r: KpiExportRow) => fmtVal(r, r.weekMap[w]),
    fill: (r: KpiExportRow) => {
      const raw = r.weekMap[w];
      const updated = raw != null;
      const value = typeof raw === "number" ? raw : 0;
      return kpiWeekArgb(value, r.weekTargetMap[w] ?? 0, updated, r.reverseColor);
    },
  }));
}

/**
 * Resolve the ordered column set for an export. `columnKeys` empty → all
 * columns (static + the selected week range). Order always follows the table
 * registry so exported sheets read consistently regardless of checkbox order.
 */
export function kpiExportColumns(columnKeys: string[], weeks: number[]): KpiExportColumn[] {
  const all = [...STATIC_COLUMNS, ...kpiWeekColumns(weeks)];
  if (columnKeys.length === 0) return all;
  const wanted = new Set(columnKeys);
  return all.filter((c) => wanted.has(c.key));
}

/** The default column key set (used when the caller wants "everything"). */
export function kpiAllColumnKeys(weeks: number[]): string[] {
  return [...STATIC_COLUMNS.map((c) => c.key), ...weeks.map((w) => `week${w}`)];
}
