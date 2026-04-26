/**
 * Shared Excel styling helpers for Client Meetings exports (spec §7.7 + §7.10).
 *
 * Uses `exceljs` for rich cell formatting (fill colours + merged cells). The
 * hex palette is locked to spec §10:
 *   >=98     blue   #3B86F6
 *   90–97    green  #22AC20
 *   80–89    yellow #FFCD00
 *   <80      red    #DC2626
 *   no data  gray   #BDBDBD
 */
import ExcelJS from "exceljs";

export const EXCEL_COLORS = {
  BLUE:   "FF3B86F6",
  GREEN:  "FF22AC20",
  YELLOW: "FFFFCD00",
  RED:    "FFDC2626",
  GRAY:   "FFBDBDBD",
  HEADER: "FFB6D7A8", // spec's light-green header row
  TOTAL:  "FFF0F0F0",
} as const;

export function fillColorForPct(pct: number, isUpdate: boolean): string {
  if (!isUpdate) return EXCEL_COLORS.GRAY;
  if (pct >= 98) return EXCEL_COLORS.BLUE;
  if (pct >= 90) return EXCEL_COLORS.GREEN;
  if (pct >= 80) return EXCEL_COLORS.YELLOW;
  return EXCEL_COLORS.RED;
}

export function applyPctFill(cell: ExcelJS.Cell, pct: number, isUpdate: boolean) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillColorForPct(pct, isUpdate) } };
  cell.font = { bold: true, color: { argb: pct >= 80 && pct < 90 ? "FF000000" : "FFFFFFFF" } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

export function applyHeader(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXCEL_COLORS.HEADER } };
  cell.font = { bold: true };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
}

/**
 * Serialise a workbook to an ArrayBuffer. Next.js's `NextResponse` typing
 * accepts `ArrayBuffer` directly as a BodyInit, but not `Buffer` or
 * `Uint8Array` with non-SharedArrayBuffer backings — so we explicitly slice
 * out a fresh ArrayBuffer.
 */
export async function workbookToBuffer(wb: ExcelJS.Workbook): Promise<ArrayBuffer> {
  const arr = await wb.xlsx.writeBuffer();
  // ExcelJS types say Buffer; in practice Node 18+ returns a Buffer/Uint8Array.
  // Copy into a fresh ArrayBuffer to satisfy Response's BodyInit.
  const u8 = arr as unknown as Uint8Array;
  const out = new ArrayBuffer(u8.byteLength);
  new Uint8Array(out).set(u8);
  return out;
}
