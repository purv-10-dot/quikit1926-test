/**
 * PO PDF generator.
 *
 * Sibling of `rfq-pdf.ts` — loads the Aakar Constructions letterhead
 * from `public/letterhead/aakar-letterhead.pdf`, clones its first page
 * as the template, and draws the Purchase Order body:
 * supplier + buyer info blocks, subject, items table with
 * Rate/Disc%/Total, totals breakdown (Amount / Discount / Net /
 * GST / Other Charges / Freight / Total Amount), and Terms &
 * Conditions.
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

export interface PoPdfLine {
  description: string;
  qty: string;
  unit: string;
  rate: number;
  discountPct: number;
}

export interface PoPdfInput {
  po: {
    poNumber: string;
    poDate: string;
    deliveryDate?: string | null;
    projectName?: string | null;
    purpose?: string | null;
    contactPerson?: string | null;
    contactMobile?: string | null;
    paymentTerms?: string | null;
    /** Buyer-side delivery location (where materials ship to). Rendered
        as a multi-line row in the buyer block — distinct from the
        vendor's supplier address on the left. */
    deliveryAddress?: string | null;
    // Aakar-side GST details — hard-coded here as fallback when the
    // org master doesn't surface them via the API.
    buyerGstin?: string | null;
    buyerBillingAddress?: string | null;
    buyerName?: string | null;
  };
  vendor: {
    vendorName: string;
    email?: string | null;
    gstin?: string | null;
    address?: string | null;
    contactPerson?: string | null;
    phone?: string | null;
  };
  items: PoPdfLine[];
  totals: {
    amount: number;
    discount: number;
    net: number;
    gst: number;
    otherCharges: number;
    freight: number;
    grandTotal: number;
    // GST split — when present, the totals block renders either an
    // IGST row (inter-state) or CGST + SGST rows (intra-state) in place
    // of the combined GST row. Omitted for legacy rows with no split.
    gstType?: "IGST" | "CGST+SGST" | string | null;
    igst?: number;
    cgst?: number;
    sgst?: number;
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

// ─── Info blocks (supplier left, buyer right) ─────────────────────

function drawInfoBlocks(ctx: Ctx, input: PoPdfInput) {
  const { page, font, bold, width } = ctx;
  const left = PAGE_MARGIN;
  const right = width - PAGE_MARGIN;
  const midGap = 10;
  const colWidth = (right - left - midGap) / 2;
  const rightColX = left + colWidth + midGap;
  const labelColW = 75;
  const valueW = colWidth - labelColW - 8;
  const minRowH = 15;
  const lineH = 10;

  const supplierRows: Array<[string, string]> = [
    ["Name of Supplier", input.vendor.vendorName || "—"],
    ["Supplier GST NO.", input.vendor.gstin || "—"],
    ["Vendor Address", input.vendor.address || "—"],
    ["Vendor Email", input.vendor.email || "—"],
  ];
  const buyerRows: Array<[string, string]> = [
    ["PO No.", input.po.poNumber],
    ["Date", fmtDate(input.po.poDate)],
    ["GST NO.", input.po.buyerGstin || "—"],
    [
      // Shortened from "Billing Name & Address" — the full label
      // was wider than the 75pt label column, causing it to spill
      // into the value area on the rendered PDF.
      "Billing Address",
      input.po.buyerBillingAddress || "—",
    ],
    [
      "Delivery Address",
      input.po.deliveryAddress || input.po.projectName || "—",
    ],
    ["Project", input.po.projectName || "—"],
    ["Contact Person", input.po.contactPerson || "—"],
    ["Mobile", input.po.contactMobile || "—"],
  ];

  // Precompute per-row wrapped lines + height so multi-line values
  // (addresses) render fully instead of being truncated to the
  // first line. Labels are wrapped too — if a future config adds a
  // label wider than `labelColW`, it will break across lines rather
  // than spill into the value column.
  const prep = (rows: Array<[string, string]>) =>
    rows.map(([label, value]) => {
      const labelWrapped = wrap(label, bold, 8, labelColW - 8);
      const valueWrapped = wrap(value, font, 8, valueW);
      const maxLines = Math.max(labelWrapped.length, valueWrapped.length);
      const h = Math.max(minRowH, maxLines * lineH + 4);
      return { labelLines: labelWrapped, wrapped: valueWrapped, h };
    });
  const rawSupplier = prep(supplierRows);
  const rawBuyer = prep(buyerRows);
  const blockH = Math.max(
    rawSupplier.reduce((s, r) => s + r.h, 0),
    rawBuyer.reduce((s, r) => s + r.h, 0),
  );
  const topY = ctx.y;

  // Both boxes fill the SAME height (the taller column) by scaling each
  // row proportionally — heights only grow, so wrapped addresses still
  // fit, and the two bordered boxes line up evenly instead of one
  // ending short below the other.
  const fill = (
    rows: Array<{ labelLines: string[]; wrapped: string[]; h: number }>,
  ) => {
    const sum = rows.reduce((s, r) => s + r.h, 0) || 1;
    const k = blockH / sum;
    return rows.map((r) => ({ ...r, h: r.h * k }));
  };
  const supplier = fill(rawSupplier);
  const buyer = fill(rawBuyer);

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
  drawCol(rightColX, buyer);
  ctx.y = topY - blockH - 10;
}

// ─── Subject bar ───────────────────────────────────────────────────

function drawSubject(ctx: Ctx, subject: string) {
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
    (subject || "").toUpperCase(),
    left + 62, topY - h + 5, bold, 9, BRAND_ORANGE,
  );
  ctx.y = topY - h - 10;
}

// ─── Items table ──────────────────────────────────────────────────

// Widths sum to 515pt = the A4 content width (595.28 − 2×40 margin), so
// the items table spans exactly the same rail as the info blocks and
// subject bar above it.
const COLS = [
  { key: "sno", label: "S.NO.", width: 32, align: "center" as const },
  { key: "desc", label: "DESCRIPTION", width: 218, align: "left" as const },
  { key: "qty", label: "QTY", width: 35, align: "right" as const },
  { key: "unit", label: "UNIT", width: 40, align: "center" as const },
  { key: "rate", label: "RATE", width: 60, align: "right" as const },
  { key: "disc", label: "DISC%", width: 50, align: "right" as const },
  { key: "total", label: "TOTAL", width: 80, align: "right" as const },
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
  ctx: Ctx, startX: number, index: number, line: PoPdfLine,
) {
  const { page, font } = ctx;
  const totalW = COLS.reduce((s, c) => s + c.width, 0);
  const descLines = wrap(line.description || "—", font, 9, COLS[1].width - 10);
  const h = Math.max(18, descLines.length * 11 + 6);
  const topY = ctx.y;
  const qty = parseFloat(line.qty) || 0;
  const gross = qty * line.rate;
  const afterDisc = gross - (gross * line.discountPct) / 100;

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
  drawText(
    page, String(index),
    alignedX(String(index), colX(startX, 0), COLS[0].width, font, 9, "center"),
    baseY, font, 9,
  );
  for (let i = 0; i < descLines.length; i++) {
    drawText(page, descLines[i], colX(startX, 1) + 5, topY - 12 - i * 11, font, 9);
  }
  const qtyT = line.qty || "—";
  drawText(page, qtyT, alignedX(qtyT, colX(startX, 2), COLS[2].width, font, 9, "right"), baseY, font, 9);
  const unitT = (line.unit || "—").toUpperCase();
  drawText(page, unitT, alignedX(unitT, colX(startX, 3), COLS[3].width, font, 9, "center"), baseY, font, 9);
  const rateT = fmtINR(line.rate);
  drawText(page, rateT, alignedX(rateT, colX(startX, 4), COLS[4].width, font, 9, "right"), baseY, font, 9);
  const discT = line.discountPct ? `${line.discountPct}%` : "0%";
  drawText(page, discT, alignedX(discT, colX(startX, 5), COLS[5].width, font, 9, "right"), baseY, font, 9);
  const totalT = fmtINR(afterDisc);
  drawText(page, totalT, alignedX(totalT, colX(startX, 6), COLS[6].width, font, 9, "right"), baseY, font, 9);
  ctx.y = topY - h;
}

// ─── Totals block ─────────────────────────────────────────────────

function drawTotals(ctx: Ctx, startX: number, totals: PoPdfInput["totals"]) {
  const { page, font, bold } = ctx;
  const totalW = COLS.reduce((s, c) => s + c.width, 0);
  // Totals align under the table's right-hand columns: label spans
  // cols 0..4, value lives in col 5+6.
  const labelW = COLS.slice(0, 5).reduce((s, c) => s + c.width, 0);
  const valueW = COLS[5].width + COLS[6].width;
  const labelX = startX;
  const valueX = startX + labelW;
  // GST rows: show the split first (IGST for inter-state, CGST + SGST for
  // intra-state), then the combined GST total beneath it. Legacy POs with
  // no stored split show just the combined GST row.
  const igst = totals.igst ?? 0;
  const cgst = totals.cgst ?? 0;
  const sgst = totals.sgst ?? 0;
  const hasSplit = igst + cgst + sgst > 0;
  const gstRows: Array<[string, number, boolean?]> = [];
  if (hasSplit) {
    if (totals.gstType === "IGST" || igst > 0) {
      gstRows.push(["IGST", igst]);
    } else {
      gstRows.push(["CGST", cgst], ["SGST", sgst]);
    }
  }
  gstRows.push(["GST", totals.gst]);
  const rows: Array<[string, number, boolean?]> = [
    ["AMOUNT", totals.amount],
    ["DISCOUNT", totals.discount],
    ["NET", totals.net],
    ...gstRows,
    ["OTHER CHARGES", totals.otherCharges],
    ["FREIGHT", totals.freight],
    ["TOTAL AMOUNT", totals.grandTotal, true],
  ];
  const rowH = 16;
  for (const [label, value, isGrand] of rows) {
    const topY = ctx.y;
    // Row border
    page.drawRectangle({
      x: labelX, y: topY - rowH, width: totalW, height: rowH,
      borderColor: GRID, borderWidth: 0.4,
      color: isGrand ? SOFT_BG : undefined,
    });
    // Separator between label and value columns
    page.drawLine({
      start: { x: valueX, y: topY },
      end: { x: valueX, y: topY - rowH },
      thickness: 0.3, color: GRID,
    });
    const fnt = isGrand ? bold : bold;
    const sz = isGrand ? 10 : 9;
    drawText(
      page, label,
      alignedX(label, labelX, labelW, fnt, sz, "right") - 5,
      topY - rowH + 5, fnt, sz,
    );
    const valT = fmtINR(value);
    const valColor = isGrand ? BRAND_ORANGE : BLACK;
    drawText(
      page, valT,
      alignedX(valT, valueX, valueW, bold, sz, "right"),
      topY - rowH + 5, bold, sz, valColor,
    );
    ctx.y = topY - rowH;
  }
}

// ─── Terms & Conditions ───────────────────────────────────────────

const DEFAULT_TERMS = [
  "1. GST will be charged at applicable rates as mentioned above.",
  "2. Payment terms will be as per the agreement.",
  "3. Delivery schedule must be strictly followed.",
  "4. Delivery address as per contact person on this PO.",
  "5. PO number must be mentioned in every invoice.",
  "6. All applicable taxes to be mentioned separately.",
  "7. Transportation and other charges as actual.",
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

// ─── Public API ───────────────────────────────────────────────────

export async function generatePoPdf(input: PoPdfInput): Promise<Buffer> {
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

  // Centered "Purchase Order" title sits just above the info blocks.
  const titleText = "Purchase Order";
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
  drawSubject(ctx, input.po.purpose || "");

  const tableStartX = PAGE_MARGIN;
  drawTableHeader(ctx, tableStartX);
  for (let i = 0; i < input.items.length; i++) {
    await ensureSpace(ctx, 40, template);
    if (ctx.y === ctx.height - 260) drawTableHeader(ctx, tableStartX);
    drawTableRow(ctx, tableStartX, i + 1, input.items[i]);
  }

  await ensureSpace(ctx, 120, template);
  drawTotals(ctx, tableStartX, input.totals);

  await ensureSpace(ctx, 100, template);
  drawTerms(ctx, input.termsBody);

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
