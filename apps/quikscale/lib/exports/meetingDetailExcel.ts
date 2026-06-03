/**
 * ExcelJS builder for the Weekly Meeting / Daily Huddle "detail" exports.
 *
 * Sheet layout (matches the spec the user signed off on):
 *
 *   Row 1: Client Name        | <client name>
 *   Row 2: Planned Start Time | <weekly/dailyStartTime in 12h>
 *   Row 3: Planned End Time   | <weekly/dailyEndTime in 12h>
 *   Row 4: (blank)
 *   Row 5: column headers (light-green header style)
 *   Row 6+: data
 *
 * Sheet tab name is always "Export".
 */
import ExcelJS from "exceljs";
import { applyHeader, workbookToBuffer } from "./clientMeetingsExcel";

export interface DetailExportColumn<Row> {
  label: string;
  value: (row: Row) => string | number | null | undefined;
  /** Optional width hint (chars). Default 18, capped 60. */
  width?: number;
}

export interface DetailExportInput<Row> {
  clientName: string;
  plannedStartTime: string | null | undefined;
  plannedEndTime: string | null | undefined;
  columns: DetailExportColumn<Row>[];
  rows: Row[];
}

/**
 * Convert "HH:mm" (24h) to "h:mm AM/PM". Returns "—" for null/empty.
 */
export function fmt12h(t: string | null | undefined): string {
  if (!t) return "—";
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return t;
  const h = parseInt(m[1], 10);
  const min = m[2];
  const period = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${min} ${period}`;
}

/**
 * Sanitise a string for use in a downloaded filename. Strips path separators
 * and characters Windows / macOS treat as reserved.
 */
export function sanitizeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "").trim() || "Client";
}

/**
 * Strip HTML tags from a rich-text field and decode the common entities the
 * tiptap / contentEditable editors emit. Used for Notes columns so the export
 * shows readable plain text instead of "<p>new Working Data.</p>".
 */
export function stripHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/<br\s*\/?>(?=\S)/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function buildDetailExport<Row>(
  input: DetailExportInput<Row>,
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Export");

  // ── Rows 1-3: header block ──────────────────────────────────────────────
  const headerBlock: Array<[string, string]> = [
    ["Client Name", input.clientName],
    ["Planned Start Time", fmt12h(input.plannedStartTime)],
    ["Planned End Time", fmt12h(input.plannedEndTime)],
  ];
  for (const [label, value] of headerBlock) {
    const r = ws.addRow([label, value]);
    r.getCell(1).font = { bold: true };
    r.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  }

  // ── Row 4: blank spacer ─────────────────────────────────────────────────
  ws.addRow([]);

  // ── Row 5: column headers ───────────────────────────────────────────────
  const headerRow = ws.addRow(input.columns.map((c) => c.label));
  headerRow.eachCell(applyHeader);
  headerRow.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

  // ── Row 6+: data ────────────────────────────────────────────────────────
  for (const row of input.rows) {
    const r = ws.addRow(
      input.columns.map((c) => {
        const v = c.value(row);
        if (v === null || v === undefined) return "";
        return v;
      }),
    );
    r.alignment = { vertical: "top", wrapText: true };
  }

  // ── Column widths ───────────────────────────────────────────────────────
  // Auto-fit each column to the wider of its caller-hint OR the header label
  // (+2 padding). Capped at 60 so a long notes column can't blow the sheet.
  ws.columns = input.columns.map((c) => ({
    width: Math.min(60, Math.max(8, c.label.length + 2, c.width ?? 18)),
  }));

  return workbookToBuffer(wb);
}
