/**
 * RA Bill PDF generator.
 *
 * Mirrors `work-order-pdf.ts` — clones the Aakar letterhead and draws the
 * RA Bill body: contractor + bill info blocks, billed-quantity table
 * (current qty / rate / amount), a deduction-waterfall summary
 * (gross → +GST → −deductions → net payable), and Terms & Conditions.
 */

import fs from "fs/promises";
import path from "path";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

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

export interface RABillPdfLine {
  itemCode: string;
  description: string;
  uom: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface RABillPdfInput {
  rab: {
    rabNumber: string;
    rabDate?: string | null;
    billType?: string | null;
    projectName?: string | null;
    woNumber?: string | null;
    periodFrom?: string | null;
    periodTo?: string | null;
    status?: string | null;
  };
  contractor: {
    name: string;
    gstin?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    contactPerson?: string | null;
  };
  items: RABillPdfLine[];
  amounts: {
    gross: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    retentionAmount: number;
    tdsAmount: number;
    mobilisationRecovery: number;
    liquidatedDamages: number;
    labourCess: number;
    otherDeductions: number;
    netPayable: number;
    previousBillAmount: number;
    cumulativeAmount: number;
  };
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
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
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

const BILL_TYPE_LABEL: Record<string, string> = {
  ra_bill: "Running Account Bill",
  final_bill: "Final Bill",
  deviation_bill: "Deviation Bill",
};

function drawInfoBlocks(ctx: Ctx, input: RABillPdfInput) {
  const { page, font, bold, width } = ctx;
  const left = PAGE_MARGIN;
  const right = width - PAGE_MARGIN;
  const midGap = 10;
  const colWidth = (right - left - midGap) / 2;
  const rightColX = left + colWidth + midGap;
  const labelColW = 90;
  const valueW = colWidth - labelColW - 8;
  const minRowH = 15;
  const lineH = 10;

  const period =
    input.rab.periodFrom || input.rab.periodTo
      ? `${fmtDate(input.rab.periodFrom) || "—"} to ${fmtDate(input.rab.periodTo) || "—"}`
      : "—";

  const contractorRows: Array<[string, string]> = [
    ["Contractor", input.contractor.name || "—"],
    ["GSTIN", input.contractor.gstin || "—"],
    ["Address", input.contractor.address || "—"],
    ["Contact Person", input.contractor.contactPerson || "—"],
    ["Phone", input.contractor.phone || "—"],
    ["Email", input.contractor.email || "—"],
  ];
  const billRows: Array<[string, string]> = [
    ["RAB No.", input.rab.rabNumber],
    ["Bill Date", fmtDate(input.rab.rabDate) || "—"],
    ["Bill Type", BILL_TYPE_LABEL[input.rab.billType ?? ""] ?? "Running Account Bill"],
    ["Project", input.rab.projectName || "—"],
    ["Work Order", input.rab.woNumber || "—"],
    ["Bill Period", period],
    ["Status", (input.rab.status || "draft").toUpperCase()],
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
  const bill = prep(billRows);
  const blockH = Math.max(
    contractor.reduce((s, r) => s + r.h, 0),
    bill.reduce((s, r) => s + r.h, 0),
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
          start: { x, y: cursor }, end: { x: x + colWidth, y: cursor },
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
        drawText(page, r.wrapped[li], x + labelColW + 4, topTextY - li * lineH, font, 8);
      }
      cursor -= r.h;
    }
  };
  drawCol(left, contractor);
  drawCol(rightColX, bill);
  ctx.y = topY - blockH - 12;
}

const COLS = [
  { key: "sno", label: "S.NO.", width: 32, align: "center" as const },
  { key: "code", label: "BOQ NO.", width: 75, align: "left" as const },
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
  page.drawRectangle({ x: startX, y: topY - h, width: totalW, height: h, color: BRAND_ORANGE });
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

function drawTableRow(ctx: Ctx, startX: number, index: number, line: RABillPdfLine) {
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

function drawSummary(ctx: Ctx, startX: number, a: RABillPdfInput["amounts"]) {
  const { page, font, bold } = ctx;
  const totalW = COLS.reduce((s, c) => s + c.width, 0);
  const valueW = COLS[6].width;
  const valueX = startX + totalW - valueW;
  const labelX = startX;
  const labelW = totalW - valueW;

  const rows: Array<[string, number, boolean]> = [
    ["Gross Bill Amount", a.gross, true],
  ];
  if (a.cgstAmount) rows.push(["Add: CGST", a.cgstAmount, false]);
  if (a.sgstAmount) rows.push(["Add: SGST", a.sgstAmount, false]);
  if (a.igstAmount) rows.push(["Add: IGST", a.igstAmount, false]);
  if (a.retentionAmount) rows.push(["Less: Retention", -a.retentionAmount, false]);
  if (a.tdsAmount) rows.push(["Less: TDS", -a.tdsAmount, false]);
  if (a.mobilisationRecovery) rows.push(["Less: Mobilisation Recovery", -a.mobilisationRecovery, false]);
  if (a.liquidatedDamages) rows.push(["Less: Liquidated Damages", -a.liquidatedDamages, false]);
  if (a.labourCess) rows.push(["Less: Labour Cess", -a.labourCess, false]);
  if (a.otherDeductions) rows.push(["Less: Other Deductions", -a.otherDeductions, false]);

  const rowH = 16;
  for (const [label, value, strong] of rows) {
    const topY = ctx.y;
    page.drawRectangle({
      x: labelX, y: topY - rowH, width: totalW, height: rowH,
      borderColor: GRID, borderWidth: 0.3,
    });
    page.drawLine({
      start: { x: valueX, y: topY }, end: { x: valueX, y: topY - rowH },
      thickness: 0.3, color: GRID,
    });
    const f = strong ? bold : font;
    drawText(page, label, alignedX(label, labelX, labelW, f, 9, "right") - 5, topY - rowH + 5, f, 9);
    const valT = (value < 0 ? "(" : "") + fmtINR(Math.abs(value)) + (value < 0 ? ")" : "");
    drawText(page, valT, alignedX(valT, valueX, valueW, f, 9, "right"), topY - rowH + 5, f, 9);
    ctx.y = topY - rowH;
  }

  // Net payable — emphasised.
  const topY = ctx.y;
  const netH = 20;
  page.drawRectangle({
    x: labelX, y: topY - netH, width: totalW, height: netH,
    borderColor: GRID, borderWidth: 0.5, color: SOFT_BG,
  });
  page.drawLine({
    start: { x: valueX, y: topY }, end: { x: valueX, y: topY - netH },
    thickness: 0.3, color: GRID,
  });
  const netLabel = "NET PAYABLE";
  drawText(page, netLabel, alignedX(netLabel, labelX, labelW, bold, 10, "right") - 5, topY - netH + 6, bold, 10);
  const netT = fmtINR(a.netPayable);
  drawText(page, netT, alignedX(netT, valueX, valueW, bold, 10, "right"), topY - netH + 6, bold, 10, BRAND_ORANGE);
  ctx.y = topY - netH;
}

const DEFAULT_TERMS = [
  "1. This running account bill certifies work executed and measured up to the period stated above.",
  "2. Quantities billed are net of all previously billed quantities; no work is billed twice.",
  "3. Retention is released after the defect-liability period as per the agreement.",
  "4. TDS and statutory deductions are made as per prevailing law.",
  "5. Payment shall be released subject to certification by the Engineer-in-Charge.",
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
    for (const w of wrap(t, font, 9, right - left - 10)) {
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

export async function generateRABillPdf(input: RABillPdfInput): Promise<Buffer> {
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

  const titleText =
    BILL_TYPE_LABEL[input.rab.billType ?? ""] ?? "Running Account Bill";
  const titleSize = 11;
  const titleWidth = bold.widthOfTextAtSize(titleText, titleSize);
  drawText(page, titleText, (width - titleWidth) / 2, height - 250, bold, titleSize);

  const ctx: Ctx = { doc, page, font, bold, width, height, y: height - 265 };

  drawInfoBlocks(ctx, input);

  const tableStartX = PAGE_MARGIN;
  drawTableHeader(ctx, tableStartX);
  for (let i = 0; i < input.items.length; i++) {
    await ensureSpace(ctx, 40, template);
    if (ctx.y === ctx.height - 260) drawTableHeader(ctx, tableStartX);
    drawTableRow(ctx, tableStartX, i + 1, input.items[i]);
  }

  await ensureSpace(ctx, 160, template);
  drawSummary(ctx, tableStartX, input.amounts);

  await ensureSpace(ctx, 120, template);
  drawTerms(ctx, input.termsBody);

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
