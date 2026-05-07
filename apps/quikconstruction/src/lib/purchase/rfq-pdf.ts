/**
 * RFQ PDF generator.
 *
 * Loads the Aakar Constructions letterhead PDF shipped in
 * `src/lib/purchase/assests/aakar-letterhead.pdf`, clones its first page
 * as the template, and draws the RFQ body (supplier + buyer info blocks,
 * subject, items table, terms) in the empty area below the orange bar.
 *
 * Rate / Disc% / Total columns are intentionally left blank — this is a
 * Request For Quotation, so the vendor fills those in when replying.
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
  "src",
  "lib",
  "purchase",
  "assests",
  "aakar-letterhead.pdf",
);

// A4 page in pt (used as a fallback if the letterhead is missing).
const A4: [number, number] = [595.28, 841.89];

// Single knob for the horizontal centering of the body content. Every
// block (info grid, subject bar, items table, terms) uses this so
// tweaking the centered "rail" is a one-line change.
const PAGE_MARGIN = 50;

// Orange accent used on the letterhead's own bar — matched here so the
// table header and section bars feel like part of the same document.
const BRAND_ORANGE = rgb(0.95, 0.4, 0.15);
const GRID = rgb(0.55, 0.55, 0.55);
const BLACK = rgb(0, 0, 0);
const SOFT_BG = rgb(0.96, 0.96, 0.96);

export interface RfqPdfLine {
  description: string;
  qty: string;
  unit: string;
}

export interface RfqPdfInput {
  rfq: {
    rfqNumber: string;
    rfqDate: string;
    dueDate?: string | null;
    projectName?: string | null;
    purpose?: string | null;
    contactPerson?: string | null;
    contactMobile?: string | null;
  };
  vendor: {
    vendorName: string;
    email?: string | null;
    gstin?: string | null;
    address?: string | null;
    contactPerson?: string | null;
    phone?: string | null;
  };
  items: RfqPdfLine[];
  /**
   * Terms & Conditions body — rendered as-is under the "TERMS &
   * CONDITIONS" heading. Expected to already contain line numbering /
   * bullets from the T&C master template. If omitted or empty, a
   * sensible default list is used.
   */
  termsBody?: string | null;
}

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  templatePageIndex: number;
  width: number;
  height: number;
  y: number;
}

async function loadTemplate(): Promise<PDFDocument | null> {
  try {
    const bytes = await fs.readFile(LETTERHEAD_PATH);
    return await PDFDocument.load(bytes);
  } catch {
    // Letterhead missing — fall back to a plain page so the flow still
    // works. The caller can log the warning; the PDF just looks plainer.
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

/**
 * Wrap `text` to a max pixel width, respecting existing \n breaks.
 * Returns the wrapped lines.
 */
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

// ─── Header info blocks (supplier left, buyer/RFQ right) ──────────

function drawInfoBlocks(ctx: Ctx, input: RfqPdfInput) {
  const { page, font, bold, width } = ctx;
  const left = PAGE_MARGIN;
  const right = width - PAGE_MARGIN;
  const midGap = 14;
  const colWidth = (right - left - midGap) / 2;
  const leftColX = left;
  const rightColX = left + colWidth + midGap;

  const topY = ctx.y;
  const labelSize = 8;
  const valueSize = 9;
  const rowH = 16;

  // Left column — supplier
  const supplierRows: Array<[string, string]> = [
    ["Name of Supplier", input.vendor.vendorName || "—"],
    ["Supplier GST NO.", input.vendor.gstin || "—"],
    ["Address", input.vendor.address || "—"],
    ["E-Mail Address", input.vendor.email || "—"],
    ["Contact Person", input.vendor.contactPerson || "—"],
    ["Contact No", input.vendor.phone || "—"],
  ];

  // Right column — RFQ + buyer
  const buyerRows: Array<[string, string]> = [
    ["RFQ No.", input.rfq.rfqNumber],
    ["Date", input.rfq.rfqDate],
    ["Due Date", input.rfq.dueDate || "—"],
    ["Project", input.rfq.projectName || "—"],
    ["Contact Person", input.rfq.contactPerson || "—"],
    ["Mobile", input.rfq.contactMobile || "—"],
  ];

  const labelColW = 72;
  const rows = Math.max(supplierRows.length, buyerRows.length);

  // Outer + mid-column frame
  page.drawRectangle({
    x: leftColX,
    y: topY - rows * rowH,
    width: colWidth,
    height: rows * rowH,
    borderColor: GRID,
    borderWidth: 0.6,
  });
  page.drawRectangle({
    x: rightColX,
    y: topY - rows * rowH,
    width: colWidth,
    height: rows * rowH,
    borderColor: GRID,
    borderWidth: 0.6,
  });

  const drawCol = (x: number, data: Array<[string, string]>) => {
    for (let i = 0; i < data.length; i++) {
      const [label, value] = data[i];
      const rowY = topY - (i + 1) * rowH + 4;
      // Row separator
      if (i > 0) {
        page.drawLine({
          start: { x, y: topY - i * rowH },
          end: { x: x + colWidth, y: topY - i * rowH },
          thickness: 0.4,
          color: GRID,
        });
      }
      // Label-value divider
      page.drawLine({
        start: { x: x + labelColW, y: topY - i * rowH },
        end: { x: x + labelColW, y: topY - (i + 1) * rowH },
        thickness: 0.4,
        color: GRID,
      });
      drawText(page, label, x + 4, rowY, bold, labelSize);
      const valueLines = wrap(value, font, valueSize, colWidth - labelColW - 8);
      // Only the first line — we keep rows fixed-height to stay tidy.
      drawText(page, valueLines[0] ?? "", x + labelColW + 4, rowY, font, valueSize);
    }
  };
  drawCol(leftColX, supplierRows);
  drawCol(rightColX, buyerRows);

  ctx.y = topY - rows * rowH - 14;
}

// ─── Subject bar ──────────────────────────────────────────────────

function drawSubject(ctx: Ctx, subject: string) {
  const { page, bold, width } = ctx;
  const left = PAGE_MARGIN;
  const right = width - PAGE_MARGIN;
  const h = 18;
  const topY = ctx.y;

  page.drawRectangle({
    x: left,
    y: topY - h,
    width: right - left,
    height: h,
    color: SOFT_BG,
    borderColor: GRID,
    borderWidth: 0.6,
  });
  drawText(page, "Subject :-", left + 6, topY - h + 5, bold, 9, BLACK);
  drawText(
    page,
    `Supply For :- ${subject || ""}`.toUpperCase(),
    left + 62,
    topY - h + 5,
    bold,
    9,
    BRAND_ORANGE,
  );
  ctx.y = topY - h - 10;
}

// ─── Items table ──────────────────────────────────────────────────

// Column widths sum to 495 so the table sits flush inside the
// centered rail (595pt A4 width − 2 × PAGE_MARGIN).
const COLS = [
  { key: "sno", label: "S.NO.", width: 36, align: "center" as const },
  { key: "desc", label: "DESCRIPTION", width: 185, align: "left" as const },
  { key: "qty", label: "QTY", width: 40, align: "right" as const },
  { key: "unit", label: "UNIT", width: 44, align: "center" as const },
  { key: "rate", label: "RATE", width: 56, align: "right" as const },
  { key: "disc", label: "DISC%", width: 48, align: "right" as const },
  { key: "total", label: "TOTAL", width: 86, align: "right" as const },
];

function colX(startX: number, idx: number): number {
  let x = startX;
  for (let i = 0; i < idx; i++) x += COLS[i].width;
  return x;
}

function alignedX(
  text: string,
  colStartX: number,
  colWidth: number,
  font: PDFFont,
  size: number,
  align: "left" | "center" | "right",
): number {
  if (align === "left") return colStartX + 5;
  const w = font.widthOfTextAtSize(text, size);
  if (align === "right") return colStartX + colWidth - w - 5;
  return colStartX + (colWidth - w) / 2;
}

function drawTableHeader(ctx: Ctx, startX: number) {
  const { page, bold } = ctx;
  const h = 18;
  const topY = ctx.y;
  const totalW = COLS.reduce((s, c) => s + c.width, 0);

  page.drawRectangle({
    x: startX,
    y: topY - h,
    width: totalW,
    height: h,
    color: BRAND_ORANGE,
  });
  COLS.forEach((c, i) => {
    const x = colX(startX, i);
    const textX = alignedX(c.label, x, c.width, bold, 9, c.align);
    drawText(page, c.label, textX, topY - h + 5, bold, 9, rgb(1, 1, 1));
    if (i > 0) {
      page.drawLine({
        start: { x, y: topY },
        end: { x, y: topY - h },
        thickness: 0.4,
        color: rgb(1, 1, 1),
      });
    }
  });
  ctx.y = topY - h;
}

function drawTableRow(
  ctx: Ctx,
  startX: number,
  index: number,
  line: RfqPdfLine,
) {
  const { page, font, bold } = ctx;
  const totalW = COLS.reduce((s, c) => s + c.width, 0);

  const descWidth = COLS[1].width - 10;
  const descLines = wrap(line.description || "—", font, 9, descWidth);
  const h = Math.max(18, descLines.length * 11 + 6);
  const topY = ctx.y;

  page.drawRectangle({
    x: startX,
    y: topY - h,
    width: totalW,
    height: h,
    borderColor: GRID,
    borderWidth: 0.4,
  });
  // Column dividers
  for (let i = 1; i < COLS.length; i++) {
    const x = colX(startX, i);
    page.drawLine({
      start: { x, y: topY },
      end: { x, y: topY - h },
      thickness: 0.3,
      color: GRID,
    });
  }

  const baseY = topY - 12;
  const snoText = String(index);
  drawText(
    page,
    snoText,
    alignedX(snoText, colX(startX, 0), COLS[0].width, font, 9, "center"),
    baseY,
    font,
    9,
  );

  // Description — wrapped multi-line
  for (let i = 0; i < descLines.length; i++) {
    drawText(
      page,
      descLines[i],
      colX(startX, 1) + 5,
      topY - 12 - i * 11,
      font,
      9,
    );
  }

  const qtyText = line.qty || "—";
  drawText(
    page,
    qtyText,
    alignedX(qtyText, colX(startX, 2), COLS[2].width, font, 9, "right"),
    baseY,
    font,
    9,
  );

  const unitText = (line.unit || "—").toUpperCase();
  drawText(
    page,
    unitText,
    alignedX(unitText, colX(startX, 3), COLS[3].width, font, 9, "center"),
    baseY,
    font,
    9,
  );

  // Rate / Disc / Total intentionally blank — vendor quotes these.

  ctx.y = topY - h;
}

async function ensureSpace(
  ctx: Ctx,
  neededY: number,
  template: PDFDocument | null,
) {
  if (ctx.y - neededY > 60) return;
  // New page: reuse the letterhead if we can, otherwise blank A4.
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

// ─── Terms ─────────────────────────────────────────────────────────

const DEFAULT_TERMS = [
  "1. Please quote your best competitive rates against each item listed above.",
  "2. Quotation should include applicable GST and any other taxes separately.",
  "3. Mention delivery lead time and validity of the quoted rates.",
  "4. Payment terms and delivery location to be confirmed at PO stage.",
  "5. Send the filled quotation back by email to the contact person listed above.",
];

/**
 * Parse the T&C master `body` field into render-ready lines. The body
 * is free-text authored in the admin UI — we preserve the author's own
 * numbering/bullets rather than re-numbering, since templates often mix
 * numbered clauses with sub-bullets.
 *
 * Empty lines are dropped (they'd render as phantom gaps). If the body
 * is missing/blank, the built-in default list is returned so the PDF
 * isn't left with a naked heading.
 */
function parseTermsBody(body: string | null | undefined): string[] {
  const raw = String(body ?? "").trim();
  if (!raw) return DEFAULT_TERMS;
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : DEFAULT_TERMS;
}

function drawTerms(ctx: Ctx, termsBody: string | null | undefined) {
  const { page, bold, font, width } = ctx;
  const left = PAGE_MARGIN;
  const right = width - PAGE_MARGIN;
  const terms = parseTermsBody(termsBody);
  // Visible air between the items table and the T&C heading — without
  // it the heading sits right under the last row and looks crammed.
  const topY = ctx.y - 28;
  drawText(page, "TERMS & CONDITIONS :-", left, topY, bold, 9, BRAND_ORANGE);
  let cursor = topY - 14;
  for (const t of terms) {
    const wrapped = wrap(t, font, 9, right - left - 10);
    for (const wline of wrapped) {
      drawText(page, wline, left + 4, cursor, font, 9);
      cursor -= 12;
    }
  }
  ctx.y = cursor;
}

// ─── Public API ───────────────────────────────────────────────────

export async function generateRfqPdf(input: RfqPdfInput): Promise<Buffer> {
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

  const ctx: Ctx = {
    doc,
    page,
    font,
    bold,
    templatePageIndex: 0,
    width,
    height,
    y: height - 260, // start below the orange bar on page 1
  };

  drawInfoBlocks(ctx, input);
  drawSubject(ctx, input.rfq.purpose || "");

  const tableStartX = PAGE_MARGIN;
  drawTableHeader(ctx, tableStartX);

  for (let i = 0; i < input.items.length; i++) {
    await ensureSpace(ctx, 40, template);
    // If we paged to a new page, redraw the header so the new page has
    // the "S.NO DESCRIPTION …" row too.
    if (ctx.y === ctx.height - 260) drawTableHeader(ctx, tableStartX);
    drawTableRow(ctx, tableStartX, i + 1, input.items[i]);
  }

  await ensureSpace(ctx, 90, template);
  drawTerms(ctx, input.termsBody);

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
