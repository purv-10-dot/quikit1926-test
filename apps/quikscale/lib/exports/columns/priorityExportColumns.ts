/**
 * Server-side column registry for the Priority export.
 *
 * Column KEYS match the Priority table (see priority/page.tsx
 * `PRIORITY_COL_LABELS`). Priority is week-based: the interval selects a
 * sub-range of WEEK COLUMNS whose cells hold that week's status.
 */
import type { Cell } from "../buildWorkbook";
import { statusArgb } from "../exportColors";

export interface PriorityExportRow {
  name: string | null;
  teamName: string;
  ownerName: string;
  startWeek: number | null;
  endWeek: number | null;
  lastNote: string;
  importedFromOpsp: boolean;
  createdByName: string;
  updatedByName: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  /** weekNumber → status label ("on-track", "completed", …). */
  weekStatusMap: Record<number, string>;
}

export interface PriorityExportColumn {
  key: string;
  label: string;
  value: (row: PriorityExportRow) => Cell;
  /** Optional cell fill (ARGB) — used by the weekly-status columns. */
  fill?: (row: PriorityExportRow) => string | undefined;
}

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

const STATIC_COLUMNS: PriorityExportColumn[] = [
  { key: "team", label: "Team", value: (r) => r.teamName },
  { key: "priorityName", label: "Priority Name", value: (r) => r.name ?? "" },
  { key: "owner", label: "Owner", value: (r) => r.ownerName },
  { key: "startWeek", label: "Start Week", value: (r) => r.startWeek ?? "" },
  { key: "endWeek", label: "End Week", value: (r) => r.endWeek ?? "" },
  { key: "lastNote", label: "Last Note", value: (r) => r.lastNote },
  { key: "importedFromOpsp", label: "Imported from OPSP", value: (r) => (r.importedFromOpsp ? "Yes" : "No") },
  { key: "createdBy", label: "Created By", value: (r) => r.createdByName },
  { key: "updatedBy", label: "Updated By", value: (r) => r.updatedByName },
  { key: "createdAt", label: "Created Date", value: (r) => fmtDate(r.createdAt) },
  { key: "updatedAt", label: "Updated Date", value: (r) => fmtDate(r.updatedAt) },
];

export function priorityWeekColumns(weeks: number[]): PriorityExportColumn[] {
  return weeks.map((w) => ({
    key: `week${w}`,
    label: `Week ${w}`,
    value: (r: PriorityExportRow) => r.weekStatusMap[w] ?? "",
    fill: (r: PriorityExportRow) => statusArgb(r.weekStatusMap[w]),
  }));
}

export function priorityExportColumns(columnKeys: string[], weeks: number[]): PriorityExportColumn[] {
  const all = [...STATIC_COLUMNS, ...priorityWeekColumns(weeks)];
  if (columnKeys.length === 0) return all;
  const wanted = new Set(columnKeys);
  return all.filter((c) => wanted.has(c.key));
}
