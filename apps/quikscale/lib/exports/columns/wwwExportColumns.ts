/**
 * Server-side column registry for the WWW export.
 *
 * Column KEYS match the WWW table (see www/page.tsx `WWW_COL_LABELS`). WWW is
 * date-based: the interval is a From/To range on the `when` due date, applied
 * as a row filter (not a column range) — so there are no week columns here.
 */
import type { Cell } from "../buildWorkbook";
import { statusArgb } from "../exportColors";
import { WWW_TBD_LABEL } from "@/lib/constants/www";

export interface WwwExportRow {
  whoName: string;
  when: Date | null;
  /** True when the due date is To Be Decided — `when` holds a placeholder. */
  dueDateTBD?: boolean;
  what: string | null;
  /** Latest revised date, "YYYY-MM-DD" or "". */
  revisedDate: string;
  status: string | null;
  notes: string | null;
  createdByName: string;
  updatedByName: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface WwwExportColumn {
  key: string;
  label: string;
  value: (row: WwwExportRow) => Cell;
  /** Optional cell fill (ARGB) — used by the status column. */
  fill?: (row: WwwExportRow) => string | undefined;
}

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

const COLUMNS: WwwExportColumn[] = [
  { key: "who", label: "Who", value: (r) => r.whoName },
  // TBD rows carry a placeholder date, so exporting `when` verbatim would ship
  // a date the user never chose. Print the label instead.
  { key: "when", label: "When", value: (r) => (r.dueDateTBD ? WWW_TBD_LABEL : fmtDate(r.when)) },
  { key: "what", label: "What", value: (r) => r.what ?? "" },
  { key: "revisedDate", label: "Revised Date", value: (r) => r.revisedDate },
  { key: "status", label: "Status", value: (r) => r.status ?? "", fill: (r) => statusArgb(r.status) },
  { key: "notes", label: "Notes", value: (r) => r.notes ?? "" },
  { key: "createdBy", label: "Created By", value: (r) => r.createdByName },
  { key: "updatedBy", label: "Updated By", value: (r) => r.updatedByName },
  { key: "createdAt", label: "Created Date", value: (r) => fmtDate(r.createdAt) },
  { key: "updatedAt", label: "Updated Date", value: (r) => fmtDate(r.updatedAt) },
];

export function wwwExportColumns(columnKeys: string[]): WwwExportColumn[] {
  if (columnKeys.length === 0) return COLUMNS;
  const wanted = new Set(columnKeys);
  return COLUMNS.filter((c) => wanted.has(c.key));
}
