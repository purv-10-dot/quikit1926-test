/**
 * Generic ExcelJS workbook builder for the Global Export feature.
 *
 * Takes a header (column labels) + a matrix of row cells and returns an
 * ArrayBuffer ready to hand to `fileResponse`. Reuses the shared header style
 * and buffer serialisation from the client-meetings export helpers so every
 * module's .xlsx looks consistent.
 */
import ExcelJS from "exceljs";
import { applyHeader, workbookToBuffer } from "./clientMeetingsExcel";

export type Cell = string | number | null | undefined;

/** ARGB hex per cell (aligned to `rows`), or undefined for no fill. */
export type FillMatrix = (string | undefined)[][];

/** Hover-comment text per cell (aligned to `rows`), or undefined for no note. */
export type NoteMatrix = (string | undefined)[][];

export interface WorkbookSheet {
  sheetName: string;
  headers: string[];
  rows: Cell[][];
  /** Optional per-cell fill colors (ARGB), aligned to `rows` by [row][col]. */
  fills?: FillMatrix;
  /** Optional per-cell hover comments (Excel cell notes), aligned to `rows` by [row][col]. */
  notes?: NoteMatrix;
}

export type BuildWorkbookOptions = WorkbookSheet;

function safeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1";
}

/** Paint a data cell with a solid fill + white bold centered text (matches the
 *  UI's filled status/traffic-light cells). */
function applyFilledCell(cell: ExcelJS.Cell, argb: string): void {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
  cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

function addSheet(wb: ExcelJS.Workbook, { sheetName, headers, rows, fills, notes }: WorkbookSheet): void {
  const ws = wb.addWorksheet(safeSheetName(sheetName));
  ws.addRow(headers).eachCell(applyHeader);
  rows.forEach((r, ri) => {
    const row = ws.addRow(headers.map((_, i) => normalizeCell(r[i])));
    const rowFills = fills?.[ri];
    const rowNotes = notes?.[ri];
    if (rowFills || rowNotes) {
      headers.forEach((_, i) => {
        const argb = rowFills?.[i];
        if (argb) applyFilledCell(row.getCell(i + 1), argb);
        const note = rowNotes?.[i];
        // A cell note renders as an Excel hover comment (matches the grid's tooltips).
        if (note) row.getCell(i + 1).note = note;
      });
    }
  });
  // Auto-width guess, capped at 40 chars — same heuristic as the client
  // runExport so both paths produce similarly-sized columns.
  ws.columns = headers.map((h, i) => {
    const maxLen = Math.max(
      h.length,
      ...rows.map((r) => String(normalizeCell(r[i])).length),
    );
    return { width: Math.min(40, Math.max(8, maxLen + 2)) };
  });
}

export async function buildWorkbook(opts: BuildWorkbookOptions): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  addSheet(wb, opts);
  return workbookToBuffer(wb);
}

/**
 * Multi-sheet workbook — one worksheet per entry. Used by the Full-Year KPI /
 * Priority export (one tab per quarter). Falls back to a single empty "Sheet1"
 * if given no sheets.
 */
export async function buildWorkbookSheets(sheets: WorkbookSheet[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  if (sheets.length === 0) {
    addSheet(wb, { sheetName: "Sheet1", headers: [], rows: [] });
  } else {
    for (const s of sheets) addSheet(wb, s);
  }
  return workbookToBuffer(wb);
}

function normalizeCell(v: Cell): string | number {
  if (v == null) return "";
  return v;
}
