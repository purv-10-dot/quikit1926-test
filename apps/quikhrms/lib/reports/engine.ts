// Renders a ReportResult to CSV / XLSX / PDF. Shared by every report; report
// definitions never touch rendering. XLSX uses the existing `xlsx` (SheetJS) dep,
// PDF uses `pdf-lib` (same as payslip/Form-16 generators).

import { utils, write } from "xlsx";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { ReportColumn, ReportResult } from "./types";

export interface RenderedFile {
  buffer: Buffer;
  contentType: string;
  ext: "csv" | "xlsx" | "pdf";
}

function cellValue(v: unknown): string | number {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return v;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// ── CSV ─────────────────────────────────────────────────
function toCsv(result: ReportResult): string {
  const esc = (v: unknown) => {
    const s = String(cellValue(v));
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [result.columns.map((c) => esc(c.label)).join(",")];
  for (const r of result.rows) lines.push(result.columns.map((c) => esc(r[c.key])).join(","));
  return lines.join("\n");
}

// ── XLSX ────────────────────────────────────────────────
function toXlsx(result: ReportResult): Buffer {
  const { columns, rows } = result;
  const aoa: (string | number)[][] = [
    columns.map((c) => c.label),
    ...rows.map((r) => columns.map((c) => cellValue(r[c.key]))),
  ];
  const ws = utils.aoa_to_sheet(aoa);
  (ws as { "!cols"?: { wch: number }[] })["!cols"] = columns.map((c) => ({
    wch: c.width ?? Math.max(10, c.label.length + 2),
  }));
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, "Report");
  return write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// ── PDF ─────────────────────────────────────────────────
// StandardFonts (WinAnsi) can't encode ₹ or non-Latin glyphs — sanitize first.
function sanitize(s: string): string {
  return s
    .replace(/₹/g, "Rs.")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x00-\xFF…]/g, "?");
}

function clip(raw: string, maxWidth: number, size: number, font: PDFFont): string {
  let s = sanitize(raw);
  if (font.widthOfTextAtSize(s, size) <= maxWidth) return s;
  while (s.length > 1 && font.widthOfTextAtSize(s + "…", size) > maxWidth) s = s.slice(0, -1);
  return s + "…";
}

const NUM = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

async function toPdf(result: ReportResult): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 842, PAGE_H = 595, MARGIN = 28; // A4 landscape
  const usableW = PAGE_W - MARGIN * 2;
  const cols = result.columns;
  const weightTotal = cols.reduce((s, c) => s + (c.width ?? 12), 0);
  const colW = cols.map((c) => ((c.width ?? 12) / weightTotal) * usableW);
  const ROW_H = 15, FS = 7, HFS = 7.5;

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  page.drawText(sanitize(result.title), { x: MARGIN, y: y - 2, size: 13, font: bold });
  y -= 20;
  page.drawText(`Generated ${new Date().toISOString().slice(0, 10)}  -  ${result.rows.length} rows`, {
    x: MARGIN, y, size: 8, font, color: rgb(0.45, 0.45, 0.45),
  });
  y -= 14;

  const drawHeader = () => {
    page.drawRectangle({ x: MARGIN, y: y - ROW_H + 3, width: usableW, height: ROW_H, color: rgb(0.086, 0.141, 0.227) });
    let x = MARGIN;
    cols.forEach((c, i) => {
      page.drawText(clip(c.label, colW[i] - 6, HFS, bold), { x: x + 3, y: y - ROW_H + 8, size: HFS, font: bold, color: rgb(1, 1, 1) });
      x += colW[i];
    });
    y -= ROW_H;
  };
  drawHeader();

  for (const r of result.rows) {
    if (y < MARGIN + ROW_H) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
      drawHeader();
    }
    let x = MARGIN;
    cols.forEach((c, i) => {
      const v = r[c.key];
      const s = v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "number" ? NUM.format(v) : String(v);
      page.drawText(clip(s, colW[i] - 6, FS, font), { x: x + 3, y: y - ROW_H + 8, size: FS, font, color: rgb(0.12, 0.12, 0.12) });
      x += colW[i];
    });
    page.drawLine({ start: { x: MARGIN, y: y - ROW_H + 2 }, end: { x: MARGIN + usableW, y: y - ROW_H + 2 }, thickness: 0.3, color: rgb(0.86, 0.86, 0.86) });
    y -= ROW_H;
  }

  return Buffer.from(await pdf.save());
}

export async function renderReport(result: ReportResult, format: "csv" | "xlsx" | "pdf"): Promise<RenderedFile> {
  if (format === "csv") {
    return { buffer: Buffer.from("﻿" + toCsv(result), "utf-8"), contentType: "text/csv; charset=utf-8", ext: "csv" };
  }
  if (format === "xlsx") {
    return { buffer: toXlsx(result), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" };
  }
  return { buffer: await toPdf(result), contentType: "application/pdf", ext: "pdf" };
}
