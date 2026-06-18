/**
 * RA Bill PDF generator.
 *
 * Clones the Aakar letterhead and draws the RA Bill body:
 *   • centred title + bill no / date / status,
 *   • two info boxes (Contractor / Sub-Contractor + the issuing company),
 *   • a section bar naming the project,
 *   • the billed-quantity table (cum. qty / rate / current amt / cumulative),
 *   • a right-aligned deduction-waterfall summary box, and
 *   • Terms & Conditions + Notes.
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
const SECTION_BG = rgb(1, 0.95, 0.9);
const GRID = rgb(0.55, 0.55, 0.55);
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const SOFT_BG = rgb(0.96, 0.96, 0.96);

export interface RABillPdfLine {
  itemCode: string;
  description: string;
  uom: string;
  quantity: number;
  cumulativeQty: number;
  rate: number;
  amount: number;
  cumulativeAmount: number;
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
  /** The tenant company that issues the bill (right-hand info box). */
  issuer?: {
    name?: string | null;
    gstin?: string | null;
    address?: string | null;
  };
  items: RABillPdfLine[];
  amounts: {
    gross: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    retentionPercent: number;
    retentionAmount: number;
    tdsRate: number;
    tdsAmount: number;
    mobilisationRecovery: number;
    liquidatedDamages: number;
    labourCess: number;
    otherDeductions: number;
    netPayable: number;
    previousBillAmount: number;
    cumulativeAmount: number;
  };
  /** Body of the selected T&C template (null → built-in default). */
  termsBody?: string | null;
  /** Title of the selected T&C template, appended to the heading. */
  termsTitle?: string | null;
  /** When true, the Terms & Conditions section is omitted entirely. */
  hideTerms?: boolean;
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
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtQty(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function fmtPct(n: number): string {
  return Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

const BILL_TYPE_LABEL: Record<string, string> = {
  ra_bill: "Running Account Bill",
  final_bill: "Final Bill",
  deviation_bill: "Deviation Bill",
};

// ─── Title + bill meta (top-right) ─────────────────────────────────────

function drawTitleAndMeta(ctx: Ctx, input: RABillPdfInput) {
  const { page, font, bold, width } = ctx;
  const titleText =
    BILL_TYPE_LABEL[input.rab.billType ?? ""] ?? "Running Account Bill";
  const titleSize = 14;
  const titleWidth = bold.widthOfTextAtSize(titleText, titleSize);
  drawText(page, titleText, (width - titleWidth) / 2, ctx.y, bold, titleSize, BRAND_ORANGE);

  const right = width - PAGE_MARGIN;
  const meta: Array<[string, string]> = [
    ["Bill No: ", input.rab.rabNumber || "—"],
    ["Bill Date: ", fmtDate(input.rab.rabDate) || "—"],
    ["Status: ", (input.rab.status || "draft").toUpperCase()],
  ];
  let my = ctx.y - 20;
  for (const [label, value] of meta) {
    const text = label + value;
    const w = font.widthOfTextAtSize(text, 9);
    drawText(page, text, right - w, my, font, 9);
    my -= 12;
  }
  ctx.y = Math.min(ctx.y - 24, my) - 8;
}

// ─── Two info boxes ────────────────────────────────────────────────────

function drawInfoBoxes(ctx: Ctx, input: RABillPdfInput) {
  const { page, font, bold, width } = ctx;
  const left = PAGE_MARGIN;
  const right = width - PAGE_MARGIN;
  const gap = 12;
  const colW = (right - left - gap) / 2;
  const rightX = left + colW + gap;
  const headerH = 16;
  const labelW = 82;
  const valueW = colW - labelW - 8;
  const lineH = 10;
  const minRowH = 14;

  const period =
    input.rab.periodFrom || input.rab.periodTo
      ? `${fmtDate(input.rab.periodFrom) || "—"} – ${fmtDate(input.rab.periodTo) || "—"}`
      : "—";

  const leftTitle = "Contractor / Sub-Contractor";
  const leftRows: Array<[string, string]> = [
    ["Name", input.contractor.name || "—"],
    ["Project", input.rab.projectName || "—"],
    ["Bill Type", BILL_TYPE_LABEL[input.rab.billType ?? ""] ?? "Running Account Bill"],
    ["Period", period],
  ];

  const rightTitle = input.issuer?.name || "Issued By";
  const rightRows: Array<[string, string]> = [
    ["GSTIN", input.issuer?.gstin || "—"],
    ["Address", input.issuer?.address || "—"],
    ["Cumulative Billed", fmtINR(input.amounts.cumulativeAmount)],
    ["Previous Bill", fmtINR(input.amounts.previousBillAmount)],
  ];

  const prep = (rows: Array<[string, string]>) =>
    rows.map(([label, value]) => {
      const wrapped = wrap(value, font, 8, valueW);
      const h = Math.max(minRowH, wrapped.length * lineH + 4);
      return { label, wrapped, h };
    });
  const leftPrepped = prep(leftRows);
  const rightPrepped = prep(rightRows);
  const bodyH = Math.max(
    leftPrepped.reduce((s, r) => s + r.h, 0),
    rightPrepped.reduce((s, r) => s + r.h, 0),
  );

  const topY = ctx.y;

  const drawBox = (
    x: number,
    title: string,
    rows: Array<{ label: string; wrapped: string[]; h: number }>,
  ) => {
    // Header band.
    page.drawRectangle({
      x, y: topY - headerH, width: colW, height: headerH, color: BRAND_ORANGE,
    });
    drawText(page, title, x + 6, topY - headerH + 5, bold, 9, WHITE);
    // Body outline.
    page.drawRectangle({
      x, y: topY - headerH - bodyH, width: colW, height: bodyH,
      borderColor: GRID, borderWidth: 0.6,
    });
    let cursor = topY - headerH;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (i > 0) {
        page.drawLine({
          start: { x, y: cursor }, end: { x: x + colW, y: cursor },
          thickness: 0.3, color: GRID,
        });
      }
      page.drawLine({
        start: { x: x + labelW, y: cursor },
        end: { x: x + labelW, y: cursor - r.h },
        thickness: 0.3, color: GRID,
      });
      const textY = cursor - 10;
      drawText(page, r.label, x + 4, textY, bold, 8);
      for (let li = 0; li < r.wrapped.length; li++) {
        drawText(page, r.wrapped[li], x + labelW + 4, textY - li * lineH, font, 8);
      }
      cursor -= r.h;
    }
  };

  drawBox(left, leftTitle, leftPrepped);
  drawBox(rightX, rightTitle, rightPrepped);
  ctx.y = topY - headerH - bodyH - 16;
}

// ─── Section bar ───────────────────────────────────────────────────────

function drawSectionBar(ctx: Ctx, input: RABillPdfInput) {
  const { page, bold, width } = ctx;
  const left = PAGE_MARGIN;
  const right = width - PAGE_MARGIN;
  const h = 18;
  const billLabel =
    (BILL_TYPE_LABEL[input.rab.billType ?? ""] ?? "Running Account Bill").toUpperCase();
  const project = (input.rab.projectName || "").toUpperCase();
  const title = project ? `${billLabel} — ${project}` : billLabel;
  const topY = ctx.y;
  page.drawRectangle({
    x: left, y: topY - h, width: right - left, height: h, color: SECTION_BG,
  });
  const lines = wrap(title, bold, 9, right - left - 12);
  drawText(page, lines[0] ?? title, left + 6, topY - h + 5, bold, 9, BRAND_ORANGE);
  ctx.y = topY - h - 10;
}

// ─── Billed-quantity table ─────────────────────────────────────────────

const COLS = [
  { key: "desc", label: "Description", width: 195, align: "left" as const },
  { key: "cumQty", label: "Cum. Qty", width: 70, align: "right" as const },
  { key: "rate", label: "Rate", width: 75, align: "right" as const },
  { key: "curAmt", label: "Current Amt", width: 85, align: "right" as const },
  { key: "cumAmt", label: "Cumulative", width: 90, align: "right" as const },
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
    drawText(page, c.label, tx, topY - h + 5, bold, 9, WHITE);
    if (i > 0) {
      page.drawLine({
        start: { x, y: topY }, end: { x, y: topY - h },
        thickness: 0.4, color: WHITE,
      });
    }
  });
  ctx.y = topY - h;
}

function drawTableRow(ctx: Ctx, startX: number, line: RABillPdfLine) {
  const { page, font } = ctx;
  const totalW = COLS.reduce((s, c) => s + c.width, 0);
  const descLines = wrap(line.description || "—", font, 9, COLS[0].width - 10);
  const h = Math.max(18, descLines.length * 11 + 6);
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
  for (let i = 0; i < descLines.length; i++) {
    drawText(page, descLines[i], colX(startX, 0) + 5, topY - 12 - i * 11, font, 9);
  }
  const cells: Array<[number, string]> = [
    [1, fmtQty(line.cumulativeQty)],
    [2, fmtINR(line.rate)],
    [3, fmtINR(line.amount)],
    [4, fmtINR(line.cumulativeAmount)],
  ];
  for (const [idx, text] of cells) {
    drawText(page, text, alignedX(text, colX(startX, idx), COLS[idx].width, font, 9, "right"), baseY, font, 9);
  }
  ctx.y = topY - h;
}

// ─── Deduction-waterfall summary (right-aligned box) ───────────────────

function drawSummary(ctx: Ctx, a: RABillPdfInput["amounts"]) {
  const { page, font, bold, width } = ctx;
  const boxW = 250;
  const right = width - PAGE_MARGIN;
  const startX = right - boxW;
  const valueW = 110;
  const valueX = startX + boxW - valueW;
  const labelW = boxW - valueW;

  const gstTotal = a.cgstAmount + a.sgstAmount + a.igstAmount;
  const rows: Array<[string, number, boolean]> = [
    ["Gross Bill Amount", a.gross, true],
  ];
  if (a.retentionAmount)
    rows.push([`Less: Retention (${fmtPct(a.retentionPercent)}%)`, -a.retentionAmount, false]);
  if (a.tdsAmount)
    rows.push([`Less: TDS (${fmtPct(a.tdsRate)}%)`, -a.tdsAmount, false]);
  if (a.mobilisationRecovery)
    rows.push(["Less: Mobilisation Recovery", -a.mobilisationRecovery, false]);
  if (a.liquidatedDamages)
    rows.push(["Less: Liquidated Damages", -a.liquidatedDamages, false]);
  if (a.labourCess) rows.push(["Less: Labour Cess", -a.labourCess, false]);
  if (a.otherDeductions) rows.push(["Less: Other Deductions", -a.otherDeductions, false]);
  if (gstTotal) rows.push(["Add: GST", gstTotal, false]);

  const rowH = 16;
  for (const [label, value, strong] of rows) {
    const topY = ctx.y;
    page.drawRectangle({
      x: startX, y: topY - rowH, width: boxW, height: rowH,
      borderColor: GRID, borderWidth: 0.3,
    });
    page.drawLine({
      start: { x: valueX, y: topY }, end: { x: valueX, y: topY - rowH },
      thickness: 0.3, color: GRID,
    });
    const f = strong ? bold : font;
    drawText(page, label, alignedX(label, startX, labelW, f, 9, "right") - 5, topY - rowH + 5, f, 9);
    const valT = fmtINR(Math.abs(value));
    drawText(page, valT, alignedX(valT, valueX, valueW, f, 9, "right"), topY - rowH + 5, f, 9);
    ctx.y = topY - rowH;
  }

  // Net payable — emphasised.
  const topY = ctx.y;
  const netH = 20;
  page.drawRectangle({
    x: startX, y: topY - netH, width: boxW, height: netH,
    borderColor: GRID, borderWidth: 0.5, color: SOFT_BG,
  });
  page.drawLine({
    start: { x: valueX, y: topY }, end: { x: valueX, y: topY - netH },
    thickness: 0.3, color: GRID,
  });
  const netLabel = "Net Payable";
  drawText(page, netLabel, alignedX(netLabel, startX, labelW, bold, 10, "right") - 5, topY - netH + 6, bold, 10);
  const netT = fmtINR(a.netPayable);
  drawText(page, netT, alignedX(netT, valueX, valueW, bold, 10, "right"), topY - netH + 6, bold, 10, BRAND_ORANGE);
  ctx.y = topY - netH;
}

// ─── Terms & Notes ─────────────────────────────────────────────────────

const DEFAULT_TERMS = [
  "1. This running account bill certifies work executed and measured up to the period stated above.",
  "2. Quantities billed are net of all previously billed quantities; no work is billed twice.",
  "3. Retention is released after the defect-liability period as per the agreement.",
  "4. TDS and statutory deductions are made as per prevailing law.",
  "5. Payment shall be released subject to certification by the Engineer-in-Charge.",
];

const DEFAULT_NOTES = [
  "This is a system-generated Running Account Bill.",
  "Deductions are applied as per the contract terms.",
];

function parseLines(body: string | null | undefined, fallback: string[]): string[] {
  const raw = String(body ?? "").trim();
  if (!raw) return fallback;
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.length > 0 ? lines : fallback;
}

function drawTerms(ctx: Ctx, input: RABillPdfInput) {
  const { page, bold, font, width } = ctx;
  const left = PAGE_MARGIN;
  const right = width - PAGE_MARGIN;
  const terms = parseLines(input.termsBody, DEFAULT_TERMS);
  const heading = input.termsTitle
    ? `TERMS & CONDITIONS — ${input.termsTitle} :-`
    : "TERMS & CONDITIONS :-";
  const topY = ctx.y - 20;
  drawText(page, heading, left, topY, bold, 9, BRAND_ORANGE);
  let cursor = topY - 14;
  for (const t of terms) {
    for (const w of wrap(t, font, 9, right - left - 10)) {
      drawText(page, w, left + 4, cursor, font, 9);
      cursor -= 12;
    }
  }
  ctx.y = cursor;
}

function drawNotes(ctx: Ctx) {
  const { page, bold, font, width } = ctx;
  const left = PAGE_MARGIN;
  const right = width - PAGE_MARGIN;
  const topY = ctx.y - 18;
  drawText(page, "NOTES :-", left, topY, bold, 9, BRAND_ORANGE);
  let cursor = topY - 14;
  for (const t of DEFAULT_NOTES) {
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

  const ctx: Ctx = { doc, page, font, bold, width, height, y: height - 250 };

  drawTitleAndMeta(ctx, input);
  drawInfoBoxes(ctx, input);
  drawSectionBar(ctx, input);

  const tableStartX = PAGE_MARGIN;
  drawTableHeader(ctx, tableStartX);
  for (let i = 0; i < input.items.length; i++) {
    await ensureSpace(ctx, 40, template);
    if (ctx.y === ctx.height - 260) drawTableHeader(ctx, tableStartX);
    drawTableRow(ctx, tableStartX, input.items[i]);
  }

  await ensureSpace(ctx, 180, template);
  ctx.y -= 8;
  drawSummary(ctx, input.amounts);

  if (!input.hideTerms) {
    await ensureSpace(ctx, 120, template);
    drawTerms(ctx, input);
  }

  await ensureSpace(ctx, 80, template);
  drawNotes(ctx);

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
