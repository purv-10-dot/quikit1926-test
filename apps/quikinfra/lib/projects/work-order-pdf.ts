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
  uom: string;
  quantity: number;
  rate: number;
  amount: number;
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

const COLS = [
  { key: "sno", label: "S.NO.", width: 32, align: "center" as const },
  { key: "code", label: "ITEM CODE", width: 75, align: "left" as const },
  { key: "desc", label: "DESCRIPTION", width: 175, align: "left" as const },
  { key: "uom", label: "UOM", width: 42, align: "center" as const },
  { key: "qty", label: "QTY", width: 55, align: "right" as const },
  { key: "rate", label: "RATE", width: 55, align: "right" as const },
  { key: "amt", label: "AMOUNT", width: 80, align: "right" as const },
];

function colX(start: number, idx: number): number {
  let x = start;
  for (let i = 0; i < idx; i++) x += COLS[i].width;
  return x;
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

function drawTableHeader(ctx: Ctx, startX: number) {
  const { page, bold } = ctx;
  const h = 18;
  const topY = ctx.y;
  const totalW = COLS.reduce((s, c) => s + c.width, 0);
  page.drawRectangle({
    x: startX, y: topY - h, width: totalW, height: h, color: BRAND_ORANGE,
  });
  COLS.forEach((c, i) => {
    const x = colX(startX, i);
    const tx = alignedX(c.label, x, c.width, bold, 9, c.align);
    drawText(page, c.label, tx, topY - h + 5, bold, 9, rgb(1, 1, 1));
    if (i > 0) {
      page.drawLine({
        start: { x, y: topY }, end: { x, y: topY - h },
        thickness: 0.4, color: rgb(1, 1, 1),
      });
    }
  });
  ctx.y = topY - h;
}

function drawTableRow(
  ctx: Ctx, startX: number, index: number, line: WorkOrderPdfLine,
) {
  const { page, font } = ctx;
  const totalW = COLS.reduce((s, c) => s + c.width, 0);
  const descLines = wrap(line.description || "—", font, 9, COLS[2].width - 10);
  const codeLines = wrap(line.itemCode || "—", font, 9, COLS[1].width - 10);
  const maxLines = Math.max(descLines.length, codeLines.length);
  const h = Math.max(18, maxLines * 11 + 6);
  const topY = ctx.y;

  page.drawRectangle({
    x: startX, y: topY - h, width: totalW, height: h,
    borderColor: GRID, borderWidth: 0.4,
  });
  for (let i = 1; i < COLS.length; i++) {
    const x = colX(startX, i);
    page.drawLine({
      start: { x, y: topY }, end: { x, y: topY - h },
      thickness: 0.3, color: GRID,
    });
  }
  const baseY = topY - 12;
  const sno = String(index);
  drawText(page, sno, alignedX(sno, colX(startX, 0), COLS[0].width, font, 9, "center"), baseY, font, 9);
  for (let i = 0; i < codeLines.length; i++) {
    drawText(page, codeLines[i], colX(startX, 1) + 5, topY - 12 - i * 11, font, 9);
  }
  for (let i = 0; i < descLines.length; i++) {
    drawText(page, descLines[i], colX(startX, 2) + 5, topY - 12 - i * 11, font, 9);
  }
  const uomT = (line.uom || "—").toUpperCase();
  drawText(page, uomT, alignedX(uomT, colX(startX, 3), COLS[3].width, font, 9, "center"), baseY, font, 9);
  const qtyT = fmtQty(line.quantity);
  drawText(page, qtyT, alignedX(qtyT, colX(startX, 4), COLS[4].width, font, 9, "right"), baseY, font, 9);
  const rateT = fmtINR(line.rate);
  drawText(page, rateT, alignedX(rateT, colX(startX, 5), COLS[5].width, font, 9, "right"), baseY, font, 9);
  const amtT = fmtINR(line.amount);
  drawText(page, amtT, alignedX(amtT, colX(startX, 6), COLS[6].width, font, 9, "right"), baseY, font, 9);
  ctx.y = topY - h;
}

function drawGrandTotal(ctx: Ctx, startX: number, total: number) {
  const { page, bold } = ctx;
  const totalW = COLS.reduce((s, c) => s + c.width, 0);
  const labelW = COLS.slice(0, 6).reduce((s, c) => s + c.width, 0);
  const valueW = COLS[6].width;
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
  drawTableHeader(ctx, tableStartX);
  for (let i = 0; i < input.items.length; i++) {
    await ensureSpace(ctx, 40, template);
    if (ctx.y === ctx.height - 260) drawTableHeader(ctx, tableStartX);
    drawTableRow(ctx, tableStartX, i + 1, input.items[i]);
  }

  await ensureSpace(ctx, 60, template);
  drawGrandTotal(ctx, tableStartX, input.grandTotal);

  await ensureSpace(ctx, 100, template);
  drawTerms(ctx, input.termsBody);

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
