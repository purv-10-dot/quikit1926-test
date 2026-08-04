/**
 * Work Order PDF generator.
 *
 * Mirrors `po-pdf.ts` / `grn-pdf.ts` — clones the Aakar letterhead and
 * draws the WO body: contractor + WO info blocks, BOQ scope table
 * (qty / rate / amount), grand total, and Terms & Conditions block.
 */

import fs from "fs/promises";
import path from "path";
import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
} from "pdf-lib";

const LETTERHEAD_PATH = path.join(
  process.cwd(),
  "public",
  "letterhead",
  "aakar-letterhead.pdf",
);

const A4: [number, number] = [595.28, 841.89];
const PAGE_MARGIN = 40;

const BRAND_ORANGE = rgb(0.95, 0.4, 0.15);
const GRID = rgb(0.55, 0.55, 0.55);
const BLACK = rgb(0, 0, 0);
const SOFT_BG = rgb(0.96, 0.96, 0.96);

export interface WorkOrderPdfLine {
  itemCode: string;
  description: string;
  /** Days on a labour line; measured quantity on a BOQ line. */
  quantity: number;
  rate: number;
  amount: number;
  /** Labour lines only — resolved CnLabourCategory name. */
  labourCategory?: string | null;
  /** Labour lines only — workers on the line. */
  labourCount?: number | null;
}

export interface WorkOrderPdfInput {
  wo: {
    woNumber: string;
    woDate?: string | null;
    projectName?: string | null;
    title?: string | null;
    type?: string | null;
    workType?: string | null;
    plannedStart?: string | null;
    plannedEnd?: string | null;
  };
  contractor: {
    name: string;
    gstin?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    contactPerson?: string | null;
  };
  items: WorkOrderPdfLine[];
  grandTotal: number;
  termsBody?: string | null;
}

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  width: number;
  height: number;
  y: number;
}

async function loadTemplate(): Promise<PDFDocument | null> {
  try {
    const bytes = await fs.readFile(LETTERHEAD_PATH);
    return await PDFDocument.load(bytes);
  } catch {
    return null;
  }
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = BLACK,
) {
  page.drawText(text ?? "", { x, y, size, font, color });
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of (text ?? "").split(/\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      const width = font.widthOfTextAtSize(candidate, size);
      if (width > maxWidth && line) {
        out.push(line);
        line = w;
      } else {
        line = candidate;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function fmtDate(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = String(raw).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const d = parseInt(m[3], 10);
  const mon = MONTHS_SHORT[parseInt(m[2], 10) - 1] ?? "";
  return `${d} ${mon} ${m[1]}`;
}

function fmtINR(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function fmtQty(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 4 });
}

function drawInfoBlocks(ctx: Ctx, input: WorkOrderPdfInput) {
  const { page, font, bold, width } = ctx;
  const left = PAGE_MARGIN;
  const right = width - PAGE_MARGIN;
  const midGap = 10;
  const colWidth = (right - left - midGap) / 2;
  const rightColX = left + colWidth + midGap;
  const labelColW = 85;
  const valueW = colWidth - labelColW - 8;
  const minRowH = 15;
  const lineH = 10;

  const contractorRows: Array<[string, string]> = [
    ["Contractor", input.contractor.name || "—"],
    ["GSTIN", input.contractor.gstin || "—"],
    ["Address", input.contractor.address || "—"],
    ["Contact Person", input.contractor.contactPerson || "—"],
    ["Phone", input.contractor.phone || "—"],
    ["Email", input.contractor.email || "—"],
  ];
  const woRows: Array<[string, string]> = [
    ["WO No.", input.wo.woNumber],
    ["WO Date", fmtDate(input.wo.woDate) || "—"],
    ["Project", input.wo.projectName || "—"],
    ["WO Type", input.wo.type || "—"],
    ["Work Type", input.wo.workType || "—"],
    ["Planned Start", fmtDate(input.wo.plannedStart) || "—"],
    ["Planned End", fmtDate(input.wo.plannedEnd) || "—"],
  ];

  const prep = (rows: Array<[string, string]>) =>
    rows.map(([label, value]) => {
      const labelWrapped = wrap(label, bold, 8, labelColW - 8);
      const valueWrapped = wrap(value, font, 8, valueW);
      const maxLines = Math.max(labelWrapped.length, valueWrapped.length);
      const h = Math.max(minRowH, maxLines * lineH + 4);
      return { labelLines: labelWrapped, wrapped: valueWrapped, h };
    });
  const contractor = prep(contractorRows);
  const wo = prep(woRows);
  const blockH = Math.max(
    contractor.reduce((s, r) => s + r.h, 0),
    wo.reduce((s, r) => s + r.h, 0),
  );
  const topY = ctx.y;

  page.drawRectangle({
    x: left, y: topY - blockH, width: colWidth, height: blockH,
    borderColor: GRID, borderWidth: 0.6,
  });
  page.drawRectangle({
    x: rightColX, y: topY - blockH, width: colWidth, height: blockH,
    borderColor: GRID, borderWidth: 0.6,
  });

  const drawCol = (
    x: number,
    rows: Array<{ labelLines: string[]; wrapped: string[]; h: number }>,
  ) => {
    let cursor = topY;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (i > 0) {
        page.drawLine({
          start: { x, y: cursor },
          end: { x: x + colWidth, y: cursor },
          thickness: 0.3, color: GRID,
        });
      }
      page.drawLine({
        start: { x: x + labelColW, y: cursor },
        end: { x: x + labelColW, y: cursor - r.h },
        thickness: 0.3, color: GRID,
      });
      const topTextY = cursor - 10;
      for (let li = 0; li < r.labelLines.length; li++) {
        drawText(page, r.labelLines[li], x + 4, topTextY - li * lineH, bold, 8);
      }
      for (let li = 0; li < r.wrapped.length; li++) {
        drawText(
          page,
          r.wrapped[li],
          x + labelColW + 4,
          topTextY - li * lineH,
          font,
          8,
        );
      }
      cursor -= r.h;
    }
  };
  drawCol(left, contractor);
  drawCol(rightColX, wo);
  ctx.y = topY - blockH - 10;
}

function drawSubject(ctx: Ctx, subject: string) {
  if (!subject) return;
  const { page, bold, width } = ctx;
  const left = PAGE_MARGIN;
  const right = width - PAGE_MARGIN;
  const h = 18;
  const topY = ctx.y;
  page.drawRectangle({
    x: left, y: topY - h, width: right - left, height: h,
    color: SOFT_BG, borderColor: GRID, borderWidth: 0.5,
  });
  drawText(page, "Subject :-", left + 6, topY - h + 5, bold, 9, BLACK);
  drawText(
    page,
    `Scope :- ${subject.toUpperCase()}`,
    left + 62, topY - h + 5, bold, 9, BRAND_ORANGE,
  );
  ctx.y = topY - h - 10;
}

interface PdfCol {
  key: "sno" | "code" | "desc" | "category" | "count" | "qty" | "rate" | "amt";
  label: string;
  width: number;
  align: "left" | "center" | "right";
  /** Long free text — wraps and grows the row height. */
  wraps?: boolean;
}

// Total width must stay at 514 (CONTENT_W) in both layouts so the table lines
// up with the info blocks above it.
const BOQ_COLS: PdfCol[] = [
  { key: "sno", label: "S.NO.", width: 32, align: "center" },
  { key: "code", label: "ITEM CODE", width: 87, align: "left", wraps: true },
  { key: "desc", label: "DESCRIPTION", width: 205, align: "left", wraps: true },
  { key: "qty", label: "QTY", width: 55, align: "right" },
  { key: "rate", label: "RATE", width: 55, align: "right" },
  { key: "amt", label: "AMOUNT", width: 80, align: "right" },
];

// Labour layout drops ITEM CODE (labour lines carry no BOQ item) and spends the
// space on the category + worker count. QTY is relabelled DAYS because that is
// what `quantity` holds on a labour line — with COUNT alongside it, the reader
// can verify COUNT × DAYS × RATE = AMOUNT. Without the count column the total
// looks like an arithmetic error on the face of the document.
const LABOUR_COLS: PdfCol[] = [
  { key: "sno", label: "S.NO.", width: 32, align: "center" },
  { key: "desc", label: "DESCRIPTION", width: 152, align: "left", wraps: true },
  { key: "category", label: "LABOUR CATEGORY", width: 105, align: "left", wraps: true },
  { key: "count", label: "COUNT", width: 45, align: "right" },
  { key: "qty", label: "DAYS", width: 45, align: "right" },
  { key: "rate", label: "RATE", width: 55, align: "right" },
  { key: "amt", label: "AMOUNT", width: 80, align: "right" },
];

/**
 * "Labour Only" work orders bill workers × days × rate instead of measured
 * quantity × rate, so they need the labour layout. Matched case-insensitively —
 * the field is free-ish text and has arrived as "Labour Only" / "labour only".
 */
export function isLabourWorkType(workType?: string | null): boolean {
  return String(workType ?? "").toLowerCase().includes("labour");
}

function colsFor(workType?: string | null): PdfCol[] {
  return isLabourWorkType(workType) ? LABOUR_COLS : BOQ_COLS;
}

function colX(cols: PdfCol[], start: number, idx: number): number {
  let x = start;
  for (let i = 0; i < idx; i++) x += cols[i].width;
  return x;
}

/** Display text per column for one line. */
function cellText(col: PdfCol, line: WorkOrderPdfLine, index: number): string {
  switch (col.key) {
    case "sno": return String(index);
    case "code": return line.itemCode || "—";
    case "desc": return line.description || "—";
    // Null/blank category must read as "—", never "undefined".
    case "category": return line.labourCategory?.trim() || "—";
    case "count": return line.labourCount != null ? fmtQty(line.labourCount) : "—";
    case "qty": return fmtQty(line.quantity);
    case "rate": return fmtINR(line.rate);
    case "amt": return fmtINR(line.amount);
  }
}

function alignedX(
  text: string, cx: number, cw: number, font: PDFFont, size: number,
  align: "left" | "center" | "right",
): number {
  if (align === "left") return cx + 5;
  const w = font.widthOfTextAtSize(text, size);
  if (align === "right") return cx + cw - w - 5;
  return cx + (cw - w) / 2;
}

function drawTableHeader(ctx: Ctx, startX: number, cols: PdfCol[]) {
  const { page, bold } = ctx;
  const h = 18;
  const topY = ctx.y;
  const totalW = cols.reduce((s, c) => s + c.width, 0);
  page.drawRectangle({
    x: startX, y: topY - h, width: totalW, height: h, color: BRAND_ORANGE,
  });
  cols.forEach((c, i) => {
    const x = colX(cols, startX, i);
    // Headers are drawn at 8pt: "LABOUR CATEGORY" does not fit its column at 9.
    const size = c.label.length > 10 ? 8 : 9;
    const tx = alignedX(c.label, x, c.width, bold, size, c.align);
    drawText(page, c.label, tx, topY - h + 5, bold, size, rgb(1, 1, 1));
    if (i > 0) {
      page.drawLine({
        start: { x, y: topY }, end: { x, y: topY - h },
        thickness: 0.4, color: rgb(1, 1, 1),
      });
    }
  });
  ctx.y = topY - h;
}

/** Row height this line needs, so the caller can page-break before drawing. */
function rowHeight(ctx: Ctx, cols: PdfCol[], index: number, line: WorkOrderPdfLine): number {
  const maxLines = cols.reduce((m, c) => {
    if (!c.wraps) return m;
    return Math.max(m, wrap(cellText(c, line, index), ctx.font, 9, c.width - 10).length);
  }, 1);
  return Math.max(18, maxLines * 11 + 6);
}

function drawTableRow(
  ctx: Ctx, startX: number, index: number, line: WorkOrderPdfLine, cols: PdfCol[],
) {
  const { page, font } = ctx;
  const totalW = cols.reduce((s, c) => s + c.width, 0);
  const h = rowHeight(ctx, cols, index, line);
  const topY = ctx.y;

  page.drawRectangle({
    x: startX, y: topY - h, width: totalW, height: h,
    borderColor: GRID, borderWidth: 0.4,
  });
  for (let i = 1; i < cols.length; i++) {
    const x = colX(cols, startX, i);
    page.drawLine({
      start: { x, y: topY }, end: { x, y: topY - h },
      thickness: 0.3, color: GRID,
    });
  }

  cols.forEach((c, i) => {
    const x = colX(cols, startX, i);
    const text = cellText(c, line, index);
    if (c.wraps) {
      const lines = wrap(text, font, 9, c.width - 10);
      for (let li = 0; li < lines.length; li++) {
        drawText(page, lines[li], x + 5, topY - 12 - li * 11, font, 9);
      }
      return;
    }
    drawText(page, text, alignedX(text, x, c.width, font, 9, c.align), topY - 12, font, 9);
  });
  ctx.y = topY - h;
}

function drawGrandTotal(ctx: Ctx, startX: number, total: number, cols: PdfCol[]) {
  const { page, bold } = ctx;
  const totalW = cols.reduce((s, c) => s + c.width, 0);
  const labelW = cols.slice(0, -1).reduce((s, c) => s + c.width, 0);
  const valueW = cols[cols.length - 1].width;
  const labelX = startX;
  const valueX = startX + labelW;
  const rowH = 20;
  const topY = ctx.y;
  page.drawRectangle({
    x: labelX, y: topY - rowH, width: totalW, height: rowH,
    borderColor: GRID, borderWidth: 0.4, color: SOFT_BG,
  });
  page.drawLine({
    start: { x: valueX, y: topY }, end: { x: valueX, y: topY - rowH },
    thickness: 0.3, color: GRID,
  });
  const label = "GRAND TOTAL";
  drawText(
    page, label,
    alignedX(label, labelX, labelW, bold, 10, "right") - 5,
    topY - rowH + 6, bold, 10,
  );
  const valT = fmtINR(total);
  drawText(
    page, valT,
    alignedX(valT, valueX, valueW, bold, 10, "right"),
    topY - rowH + 6, bold, 10, BRAND_ORANGE,
  );
  ctx.y = topY - rowH;
}

const DEFAULT_TERMS = [
  "1. Work shall be executed strictly as per drawings, specifications, and instructions issued by the Engineer-in-Charge.",
  "2. Rates are inclusive of all taxes, levies, and statutory dues unless explicitly stated otherwise.",
  "3. Running bills shall be raised on actual measurements certified by the site engineer.",
  "4. Payment terms shall be as per the agreement; retention is released after the defect-liability period.",
  "5. All safety, statutory, and labour-law obligations rest with the contractor.",
  "6. Time is the essence of this contract; delays attract penalty as per the agreement.",
  "7. Any variation in scope must be approved in writing before execution.",
];

function parseTermsBody(body: string | null | undefined): string[] {
  const raw = String(body ?? "").trim();
  if (!raw) return DEFAULT_TERMS;
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.length > 0 ? lines : DEFAULT_TERMS;
}

function drawTerms(ctx: Ctx, termsBody: string | null | undefined) {
  const { page, bold, font, width } = ctx;
  const left = PAGE_MARGIN;
  const right = width - PAGE_MARGIN;
  const terms = parseTermsBody(termsBody);
  const topY = ctx.y - 20;
  drawText(page, "TERMS & CONDITIONS :-", left, topY, bold, 9, BRAND_ORANGE);
  let cursor = topY - 14;
  for (const t of terms) {
    const wrapped = wrap(t, font, 9, right - left - 10);
    for (const w of wrapped) {
      drawText(page, w, left + 4, cursor, font, 9);
      cursor -= 12;
    }
  }
  ctx.y = cursor;
}

async function ensureSpace(ctx: Ctx, needed: number, template: PDFDocument | null) {
  if (ctx.y - needed > 60) return;
  if (template) {
    const [copy] = await ctx.doc.copyPages(template, [0]);
    ctx.page = ctx.doc.addPage(copy);
  } else {
    ctx.page = ctx.doc.addPage(A4);
  }
  const { width, height } = ctx.page.getSize();
  ctx.width = width;
  ctx.height = height;
  ctx.y = height - 260;
}

export async function generateWorkOrderPdf(
  input: WorkOrderPdfInput,
): Promise<Buffer> {
  const template = await loadTemplate();
  const doc = await PDFDocument.create();
  let page: PDFPage;
  if (template) {
    const [copy] = await doc.copyPages(template, [0]);
    page = doc.addPage(copy);
  } else {
    page = doc.addPage(A4);
  }
  const { width, height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const titleText = "Work Order";
  const titleSize = 11;
  const titleWidth = bold.widthOfTextAtSize(titleText, titleSize);
  drawText(
    page, titleText,
    (width - titleWidth) / 2, height - 250,
    bold, titleSize,
  );

  const ctx: Ctx = {
    doc, page, font, bold, width, height, y: height - 265,
  };

  drawInfoBlocks(ctx, input);
  drawSubject(ctx, input.wo.title || "");

  const tableStartX = PAGE_MARGIN;
  const cols = colsFor(input.wo.workType);
  drawTableHeader(ctx, tableStartX, cols);
  for (let i = 0; i < input.items.length; i++) {
    // Reserve this row's real height — a wrapped category/description can be
    // several lines tall, and a fixed 40pt guess let tall rows overrun the
    // footer instead of breaking cleanly.
    const needed = rowHeight(ctx, cols, i + 1, input.items[i]);
    const yBefore = ctx.y;
    await ensureSpace(ctx, needed, template);
    if (ctx.y !== yBefore) drawTableHeader(ctx, tableStartX, cols);
    drawTableRow(ctx, tableStartX, i + 1, input.items[i], cols);
  }

  await ensureSpace(ctx, 60, template);
  drawGrandTotal(ctx, tableStartX, input.grandTotal, cols);

  await ensureSpace(ctx, 100, template);
  drawTerms(ctx, input.termsBody);

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
