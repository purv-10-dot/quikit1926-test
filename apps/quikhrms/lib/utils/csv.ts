/**
 * Shared CSV export helpers.
 *
 * Every list/table in the HRMS previously hand-rolled its own CSV escaping and
 * an arbitrary subset of columns — so downloads dropped most of the record's
 * fields. These helpers give one consistent, correctly-escaped path and make it
 * easy to export EVERY captured field, including nested/repeating groups
 * (addresses, emergency contacts, education, etc.) as a single readable cell.
 *
 * Formatting decisions (repo convention):
 *  - Nested groups → one column, human-readable text (see `formatGroup`).
 *  - `null` / `undefined` / empty → empty cell (never the string "null").
 *  - Dates → local `yyyy-mm-dd`.
 *  - Booleans → "Yes" / "No".
 *  - A UTF-8 BOM is prepended so Excel opens Unicode (₹, names) correctly.
 */

/** A single export column: header text + how to pull its value from a row. */
export interface CsvColumn<T> {
  header: string;
  /** Return the cell value; it is normalised + escaped by the writer. */
  value: (row: T) => CsvCell;
}

type CsvCell = string | number | boolean | Date | null | undefined;

/** Escape one cell to a CSV field per RFC 4180 (quote + double inner quotes). */
function escapeCsvValue(value: CsvCell): string {
  let s = normalizeCell(value);
  // Defend against CSV formula injection: a cell starting with = + - @ (or a
  // leading tab/CR) is interpreted as a formula by Excel/Sheets. Prefix a single
  // quote so it's shown as literal text and can't execute.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  // Always quote — simplest correct behaviour; handles commas, quotes, newlines.
  return `"${s.replace(/"/g, '""')}"`;
}

/** Coerce any supported cell type to its display string. */
function normalizeCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return isNaN(value.getTime()) ? "" : toLocalDate(value);
  return String(value);
}

/** Local `yyyy-mm-dd` (avoids the UTC day-shift that toISOString would cause). */
function toLocalDate(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** Format an ISO / date-ish value to `yyyy-mm-dd`, or "" if unparseable. */
export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? String(value) : toLocalDate(d);
}

/**
 * Render a list of nested records into ONE cell of readable text.
 * Each item is turned into a string by `render`, then joined with " ; ".
 * Blank items are dropped. Returns "" for an empty/absent list.
 *
 * @example
 *   formatGroup(emergencyContacts, c => `${c.name} (${c.relationship}) ${c.phone}`)
 *   // → "Priya (Spouse) 9876543210 ; Ravi (Father) 9812345678"
 */
export function formatGroup<T>(
  items: T[] | null | undefined,
  render: (item: T) => string,
): string {
  if (!Array.isArray(items) || items.length === 0) return "";
  return items
    .map(render)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ; ");
}

/** Format an address-like object into one cell. Skips empty parts. */
export function formatAddress(
  addr:
    | { line1?: string | null; line2?: string | null; city?: string | null; state?: string | null; country?: string | null; postalCode?: string | null }
    | null
    | undefined,
): string {
  if (!addr) return "";
  return [addr.line1, addr.line2, addr.city, addr.state, addr.country, addr.postalCode]
    .map((p) => (p ?? "").toString().trim())
    .filter(Boolean)
    .join(", ");
}

/** Build the full CSV text (with BOM) from column defs + rows. */
function buildCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const headerLine = columns.map((c) => escapeCsvValue(c.header)).join(",");
  const dataLines = rows.map((row) =>
    columns.map((c) => escapeCsvValue(c.value(row))).join(","),
  );
  // ﻿ = UTF-8 BOM so Excel detects Unicode; \r\n line endings per RFC 4180.
  return "﻿" + [headerLine, ...dataLines].join("\r\n");
}

/** Trigger a browser download of `content` as `filename`. Client-side only. */
function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Suffix a base name with today's date: `candidates` → `candidates-2026-07-03.csv`. */
function datedFilename(base: string, ext = "csv"): string {
  return `${base}-${toLocalDate(new Date())}.${ext}`;
}

/**
 * One-call export: build CSV from column defs + rows and download it.
 * This is the preferred entry point for every list export in the app.
 */
export function exportCsv<T>(baseName: string, columns: CsvColumn<T>[], rows: T[]): void {
  downloadTextFile(datedFilename(baseName), buildCsv(columns, rows));
}
