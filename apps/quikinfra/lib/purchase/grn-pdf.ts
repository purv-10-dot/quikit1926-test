/**
 * GRN PDF generator.
 *
 * Sibling of `po-pdf.ts` / `rfq-pdf.ts` — clones the Aakar letterhead
 * from `public/letterhead/aakar-letterhead.pdf` and draws the Goods
 * Receipt Note body: supplier + GRN receipt info blocks, line table
 * (received / accepted / rejected / rate / amount), total ex GST, and
 * a remarks footer.
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

export interface GrnPdfLine {
  description: string;
  uom: string;
  receivedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  unitRate: number;
  amount: number;
}

export interface GrnPdfInput {
  grn: {
    grnNumber: string;
    grnDate: string;
    poNumber?: string | null;
    projectName?: string | null;
    supplierInvoiceNo?: string | null;
    supplierInvoiceDate?: string | null;
    challanNo?: string | null;
    challanDate?: string | null;
    vehicleNo?: string | null;
    receivedByName?: string | null;
    remarks?: string | null;
  };
  vendor: {
    vendorName: string;
    gstin?: string | null;
  };
  items: GrnPdfLine[];
  totalExGst: number;
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

function drawInfoBlocks(ctx: Ctx, input: GrnPdfInput) {
  const { page, font, bold, width } = ctx;
  const left = PAGE_MARGIN;
  const right = width - PAGE_MARGIN;
  const midGap = 10;
  const colWidth = (right - left - midGap) / 2;
  const rightColX = left + colWidth + midGap;
  const labelColW = 95;
  const valueW = colWidth - labelColW - 8;
  const minRowH = 15;
  const lineH = 10;

  const supplierRows: Array<[string, string]> = [
    ["Supplier", input.vendor.vendorName || "—"],
    ["Supplier GSTIN", input.vendor.gstin || "—"],
    ["Source PO No.", input.grn.poNumber || "—"],
    ["Project", input.grn.projectName || "—"],
  ];
  const grnRows: Array<[string, string]> = [
    ["GRN No.", input.grn.grnNumber],
    ["GRN Date", fmtDate(input.grn.grnDate)],
    ["Vendor Invoice No.", input.grn.supplierInvoiceNo || "—"],
    ["Vendor Invoice Date", fmtDate(input.grn.supplierInvoiceDate) || "—"],
    ["Challan No.", input.grn.challanNo || "—"],
    ["Challan Date", fmtDate(input.grn.challanDate) || "—"],
    ["Vehicle No.", input.grn.vehicleNo || "—"],
    ["Received By", input.grn.receivedByName || "—"],
  ];

  const prep = (rows: Array<[string, string]>) =>
    rows.map(([label, value]) => {
      const labelWrapped = wrap(label, bold, 8, labelColW - 8);
      const valueWrapped = wrap(value, font, 8, valueW);
      const maxLines = Math.max(labelWrapped.length, valueWrapped.length);
      const h = Math.max(minRowH, maxLines * lineH + 4);
      return { labelLines: labelWrapped, wrapped: valueWrapped, h };
    });
  const supplier = prep(supplierRows);
  const grn = prep(grnRows);
  const blockH = Math.max(
    supplier.reduce((s, r) => s + r.h, 0),
    grn.reduce((s, r) => s + r.h, 0),
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
  drawCol(left, supplier);
  drawCol(rightColX, grn);
  ctx.y = topY - blockH - 10;
}

const COLS = [
  { key: "sno", label: "S.NO.", width: 30, align: "center" as const },
  { key: "desc", label: "MATERIAL", width: 160, align: "left" as const },
  { key: "uom", label: "UOM", width: 38, align: "center" as const },
  { key: "rcvd", label: "RECEIVED", width: 60, align: "right" as const },
  { key: "acc", label: "ACCEPTED", width: 60, align: "right" as const },
  { key: "rej", label: "REJECTED", width: 60, align: "right" as const },
  { key: "rate", label: "RATE", width: 50, align: "right" as const },
  { key: "amt", label: "AMOUNT", width: 60, align: "right" as const },
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
    const tx = alignedX(c.label, x, c.width, bold, 8, c.align);
    drawText(page, c.label, tx, topY - h + 5, bold, 8, rgb(1, 1, 1));
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
  ctx: Ctx, startX: number, index: number, line: GrnPdfLine,
) {
  const { page, font } = ctx;
  const totalW = COLS.reduce((s, c) => s + c.width, 0);
  const descLines = wrap(line.description || "—", font, 8, COLS[1].width - 10);
  const h = Math.max(18, descLines.length * 10 + 6);
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
  drawText(page, sno, alignedX(sno, colX(startX, 0), COLS[0].width, font, 8, "center"), baseY, font, 8);
  for (let i = 0; i < descLines.length; i++) {
    drawText(page, descLines[i], colX(startX, 1) + 5, topY - 12 - i * 10, font, 8);
  }
  const uomT = (line.uom || "—").toUpperCase();
  drawText(page, uomT, alignedX(uomT, colX(startX, 2), COLS[2].width, font, 8, "center"), baseY, font, 8);
  const rcvdT = fmtQty(line.receivedQty);
  drawText(page, rcvdT, alignedX(rcvdT, colX(startX, 3), COLS[3].width, font, 8, "right"), baseY, font, 8);
  const accT = fmtQty(line.acceptedQty);
  drawText(page, accT, alignedX(accT, colX(startX, 4), COLS[4].width, font, 8, "right"), baseY, font, 8);
  const rejT = fmtQty(line.rejectedQty);
  drawText(page, rejT, alignedX(rejT, colX(startX, 5), COLS[5].width, font, 8, "right"), baseY, font, 8);
  const rateT = fmtINR(line.unitRate);
  drawText(page, rateT, alignedX(rateT, colX(startX, 6), COLS[6].width, font, 8, "right"), baseY, font, 8);
  const amtT = fmtINR(line.amount);
  drawText(page, amtT, alignedX(amtT, colX(startX, 7), COLS[7].width, font, 8, "right"), baseY, font, 8);
  ctx.y = topY - h;
}

function drawTotal(ctx: Ctx, startX: number, total: number) {
  const { page, bold } = ctx;
  const totalW = COLS.reduce((s, c) => s + c.width, 0);
  const labelW = COLS.slice(0, 7).reduce((s, c) => s + c.width, 0);
  const valueW = COLS[7].width;
  const labelX = startX;
  const valueX = startX + labelW;
  const rowH = 18;
  const topY = ctx.y;
  page.drawRectangle({
    x: labelX, y: topY - rowH, width: totalW, height: rowH,
    borderColor: GRID, borderWidth: 0.4, color: SOFT_BG,
  });
  page.drawLine({
    start: { x: valueX, y: topY }, end: { x: valueX, y: topY - rowH },
    thickness: 0.3, color: GRID,
  });
  const label = "TOTAL (EX. GST)";
  drawText(
    page, label,
    alignedX(label, labelX, labelW, bold, 9, "right") - 5,
    topY - rowH + 5, bold, 9,
  );
  const valT = fmtINR(total);
  drawText(
    page, valT,
    alignedX(valT, valueX, valueW, bold, 9, "right"),
    topY - rowH + 5, bold, 9, BRAND_ORANGE,
  );
  ctx.y = topY - rowH;
}

function drawRemarks(ctx: Ctx, remarks: string | null | undefined) {
  if (!remarks || !remarks.trim()) return;
  const { page, bold, font, width } = ctx;
  const left = PAGE_MARGIN;
  const right = width - PAGE_MARGIN;
  const topY = ctx.y - 20;
  drawText(page, "REMARKS :-", left, topY, bold, 9, BRAND_ORANGE);
  let cursor = topY - 14;
  const wrapped = wrap(remarks, font, 9, right - left - 10);
  for (const w of wrapped) {
    drawText(page, w, left + 4, cursor, font, 9);
    cursor -= 12;
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

export async function generateGrnPdf(input: GrnPdfInput): Promise<Buffer> {
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

  const titleText = "Goods Receipt Note";
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

  const tableStartX = PAGE_MARGIN;
  drawTableHeader(ctx, tableStartX);
  for (let i = 0; i < input.items.length; i++) {
    await ensureSpace(ctx, 40, template);
    if (ctx.y === ctx.height - 260) drawTableHeader(ctx, tableStartX);
    drawTableRow(ctx, tableStartX, i + 1, input.items[i]);
  }

  await ensureSpace(ctx, 60, template);
  drawTotal(ctx, tableStartX, input.totalExGst);

  if (input.grn.remarks) {
    await ensureSpace(ctx, 80, template);
    drawRemarks(ctx, input.grn.remarks);
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
