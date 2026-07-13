/**
 * Daily Progress Report (DPR) PDF generator.
 *
 * Mirrors `work-order-pdf.ts` / `po-pdf.ts` — clones the Aakar letterhead
 * and draws the full DPR: header info block + one table per section
 * (Work Done, Materials Consumed, Manpower, Staff, Machinery). Each
 * section table wraps long text, repeats its header across page breaks,
 * and is skipped entirely when it has no rows.
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
const CONTENT_W = A4[0] - PAGE_MARGIN * 2; // ~515

const BRAND_ORANGE = rgb(0.95, 0.4, 0.15);
const GRID = rgb(0.55, 0.55, 0.55);
const BLACK = rgb(0, 0, 0);
const SOFT_BG = rgb(0.96, 0.96, 0.96);

export interface DprPdfSectionColumn {
  label: string;
  width: number;
  align: "left" | "center" | "right";
}

export interface DprPdfInput {
  dpr: {
    dprNumber: string;
    reportDate?: string | null;
    projectName?: string | null;
    status?: string | null;
    weather?: string | null;
    consumptionLocationName?: string | null;
    siteRemarks?: string | null;
    preparedBy?: string | null;
  };
  workItems: Array<{
    boqNo: string;
    description: string;
    unit: string;
    prevQty: number;
    todayQty: number;
    totalTillDate: number;
    pctCompleted: number;
    remarks: string;
  }>;
  materials: Array<{
    name: string;
    unit: string;
    consumedQty: number;
    remarks: string;
  }>;
  manpower: Array<{
    contractor: string;
    workingArea: string;
    messan: number;
    male: number;
    female: number;
    carpenter: number;
    fitter: number;
    painter: number;
    plumber: number;
    electrician: number;
    operator: number;
    total: number;
  }>;
  staff: Array<{
    name: string;
    designation: string;
    present: boolean;
    reason: string;
  }>;
  machinery: Array<{
    description: string;
    condition: string;
    requiredQty: number;
    actualQty: number;
    remarks: string;
  }>;
}

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  width: number;
  height: number;
  y: number;
  template: PDFDocument | null;
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
  return out.length ? out : [""];
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

function fmtQty(n: number): string {
  return (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 4 });
}

function titleCase(s: string): string {
  return String(s ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function alignedX(
  text: string,
  cx: number,
  cw: number,
  font: PDFFont,
  size: number,
  align: "left" | "center" | "right",
): number {
  if (align === "left") return cx + 4;
  const w = font.widthOfTextAtSize(text, size);
  if (align === "right") return cx + cw - w - 4;
  return cx + (cw - w) / 2;
}

async function newPage(ctx: Ctx) {
  if (ctx.template) {
    const [copy] = await ctx.doc.copyPages(ctx.template, [0]);
    ctx.page = ctx.doc.addPage(copy);
  } else {
    ctx.page = ctx.doc.addPage(A4);
  }
  const { width, height } = ctx.page.getSize();
  ctx.width = width;
  ctx.height = height;
  // Leave room for the letterhead band at the top of every page.
  ctx.y = height - (ctx.template ? 210 : 60);
}

async function ensureSpace(ctx: Ctx, needed: number) {
  if (ctx.y - needed > 60) return;
  await newPage(ctx);
}

/** Header info block: two columns of label/value pairs. */
function drawHeader(ctx: Ctx, input: DprPdfInput) {
  const { page, bold } = ctx;
  const title = "Daily Progress Report";
  const tw = bold.widthOfTextAtSize(title, 13);
  drawText(page, title, (ctx.width - tw) / 2, ctx.y, bold, 13, BRAND_ORANGE);
  ctx.y -= 22;

  const rows: Array<[string, string]> = [
    ["DPR No.", input.dpr.dprNumber || "—"],
    ["Report Date", fmtDate(input.dpr.reportDate) || "—"],
    ["Project", input.dpr.projectName || "—"],
    ["Status", titleCase(input.dpr.status || "draft")],
    ["Weather", input.dpr.weather || "—"],
    ["Consumption Location", input.dpr.consumptionLocationName || "—"],
  ];
  const left = PAGE_MARGIN;
  const colW = CONTENT_W / 2;
  const labelW = 95;
  const rowH = 16;
  const top = ctx.y;
  const perCol = Math.ceil(rows.length / 2);
  const blockH = perCol * rowH;

  page.drawRectangle({
    x: left, y: top - blockH, width: CONTENT_W, height: blockH,
    borderColor: GRID, borderWidth: 0.6,
  });
  page.drawLine({
    start: { x: left + colW, y: top }, end: { x: left + colW, y: top - blockH },
    thickness: 0.4, color: GRID,
  });

  rows.forEach(([label, value], i) => {
    const col = Math.floor(i / perCol);
    const rowInCol = i % perCol;
    const x = left + col * colW;
    const yy = top - rowInCol * rowH - 11;
    drawText(ctx.page, label, x + 4, yy, bold, 8);
    const valLines = wrap(value, ctx.font, 8, colW - labelW - 8);
    drawText(ctx.page, valLines[0] ?? "", x + labelW, yy, ctx.font, 8);
  });
  ctx.y = top - blockH - 8;

  if (input.dpr.siteRemarks && input.dpr.siteRemarks.trim()) {
    const lines = wrap(input.dpr.siteRemarks.trim(), ctx.font, 8, CONTENT_W - 8);
    drawText(ctx.page, "Site Remarks:", left, ctx.y - 2, bold, 8);
    let cy = ctx.y - 14;
    for (const l of lines) {
      drawText(ctx.page, l, left + 4, cy, ctx.font, 8);
      cy -= 11;
    }
    ctx.y = cy - 2;
  }
}

function drawSectionTitle(ctx: Ctx, title: string, countLabel: string) {
  const h = 18;
  const top = ctx.y;
  ctx.page.drawRectangle({
    x: PAGE_MARGIN, y: top - h, width: CONTENT_W, height: h,
    color: SOFT_BG, borderColor: GRID, borderWidth: 0.5,
  });
  drawText(ctx.page, title, PAGE_MARGIN + 6, top - h + 5, ctx.bold, 9, BRAND_ORANGE);
  const cw = ctx.font.widthOfTextAtSize(countLabel, 8);
  drawText(ctx.page, countLabel, A4[0] - PAGE_MARGIN - cw - 6, top - h + 5, ctx.font, 8, BLACK);
  ctx.y = top - h;
}

function drawTableHead(ctx: Ctx, cols: DprPdfSectionColumn[]) {
  const h = 16;
  const top = ctx.y;
  ctx.page.drawRectangle({
    x: PAGE_MARGIN, y: top - h, width: CONTENT_W, height: h, color: BRAND_ORANGE,
  });
  let x = PAGE_MARGIN;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    const tx = alignedX(c.label, x, c.width, ctx.bold, 8, c.align);
    drawText(ctx.page, c.label, tx, top - h + 5, ctx.bold, 8, rgb(1, 1, 1));
    if (i > 0) {
      ctx.page.drawLine({
        start: { x, y: top }, end: { x, y: top - h },
        thickness: 0.4, color: rgb(1, 1, 1),
      });
    }
    x += c.width;
  }
  ctx.y = top - h;
}

async function drawSection(
  ctx: Ctx,
  title: string,
  cols: DprPdfSectionColumn[],
  rows: string[][],
) {
  if (rows.length === 0) return;
  await ensureSpace(ctx, 60);
  drawSectionTitle(ctx, title, `${rows.length} ${rows.length === 1 ? "entry" : "entries"}`);
  drawTableHead(ctx, cols);

  for (const row of rows) {
    // Compute wrapped cells + row height.
    const wrapped = row.map((cell, i) =>
      wrap(cell ?? "", ctx.font, 8, cols[i].width - 8),
    );
    const maxLines = wrapped.reduce((m, w) => Math.max(m, w.length), 1);
    const rowH = Math.max(16, maxLines * 10 + 5);

    if (ctx.y - rowH < 60) {
      await newPage(ctx);
      drawTableHead(ctx, cols);
    }

    const top = ctx.y;
    ctx.page.drawRectangle({
      x: PAGE_MARGIN, y: top - rowH, width: CONTENT_W, height: rowH,
      borderColor: GRID, borderWidth: 0.4,
    });
    let x = PAGE_MARGIN;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (i > 0) {
        ctx.page.drawLine({
          start: { x, y: top }, end: { x, y: top - rowH },
          thickness: 0.3, color: GRID,
        });
      }
      const lines = wrapped[i];
      for (let li = 0; li < lines.length; li++) {
        const t = lines[li];
        drawText(ctx.page, t, alignedX(t, x, c.width, ctx.font, 8, c.align), top - 11 - li * 10, ctx.font, 8);
      }
      x += c.width;
    }
    ctx.y = top - rowH;
  }
  ctx.y -= 12;
}

export async function generateDprPdf(input: DprPdfInput): Promise<Buffer> {
  const template = await loadTemplate();
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const ctx: Ctx = {
    doc, page: null as unknown as PDFPage, font, bold,
    width: A4[0], height: A4[1], y: 0, template,
  };
  await newPage(ctx);

  drawHeader(ctx, input);

  await drawSection(
    ctx,
    "WORK DONE",
    [
      { label: "BOQ", width: 55, align: "left" },
      { label: "Description", width: 165, align: "left" },
      { label: "Unit", width: 40, align: "center" },
      { label: "Prev.", width: 45, align: "right" },
      { label: "Today", width: 50, align: "right" },
      { label: "Total", width: 55, align: "right" },
      { label: "%", width: 40, align: "right" },
      { label: "Remarks", width: 65, align: "left" },
    ],
    input.workItems.map((w) => [
      w.boqNo || "—",
      w.description || "—",
      (w.unit || "—").toUpperCase(),
      fmtQty(w.prevQty),
      fmtQty(w.todayQty),
      fmtQty(w.totalTillDate),
      `${(Number(w.pctCompleted) || 0).toFixed(1)}%`,
      w.remarks || "",
    ]),
  );

  await drawSection(
    ctx,
    "MATERIALS CONSUMED",
    [
      { label: "Material", width: 200, align: "left" },
      { label: "Unit", width: 55, align: "center" },
      { label: "Consumed Qty", width: 95, align: "right" },
      { label: "Remarks", width: 165, align: "left" },
    ],
    input.materials.map((m) => [
      m.name || "—",
      (m.unit || "—").toUpperCase(),
      fmtQty(m.consumedQty),
      m.remarks || "",
    ]),
  );

  await drawSection(
    ctx,
    "MANPOWER DEPLOYED",
    [
      { label: "Contractor", width: 70, align: "left" },
      { label: "Working Area", width: 60, align: "left" },
      { label: "Messan", width: 38, align: "right" },
      { label: "Male", width: 38, align: "right" },
      { label: "Female", width: 42, align: "right" },
      { label: "Carp.", width: 36, align: "right" },
      { label: "Fitter", width: 36, align: "right" },
      { label: "Painter", width: 40, align: "right" },
      { label: "Plumber", width: 42, align: "right" },
      { label: "Elec.", width: 36, align: "right" },
      { label: "Oper.", width: 40, align: "right" },
      { label: "Total", width: 37, align: "right" },
    ],
    input.manpower.map((m) => [
      m.contractor || "—",
      m.workingArea || "—",
      fmtQty(m.messan),
      fmtQty(m.male),
      fmtQty(m.female),
      fmtQty(m.carpenter),
      fmtQty(m.fitter),
      fmtQty(m.painter),
      fmtQty(m.plumber),
      fmtQty(m.electrician),
      fmtQty(m.operator),
      fmtQty(m.total),
    ]),
  );

  await drawSection(
    ctx,
    "STAFF",
    [
      { label: "Name", width: 160, align: "left" },
      { label: "Designation", width: 160, align: "left" },
      { label: "Present", width: 70, align: "center" },
      { label: "Reason", width: 125, align: "left" },
    ],
    input.staff.map((s) => [
      s.name || "—",
      s.designation || "—",
      s.present ? "Yes" : "No",
      s.present ? "" : s.reason || "",
    ]),
  );

  await drawSection(
    ctx,
    "MACHINERY DEPLOYED",
    [
      { label: "Description", width: 190, align: "left" },
      { label: "Condition", width: 90, align: "left" },
      { label: "Required", width: 70, align: "right" },
      { label: "Actual", width: 70, align: "right" },
      { label: "Remarks", width: 95, align: "left" },
    ],
    input.machinery.map((m) => [
      m.description || "—",
      m.condition || "—",
      fmtQty(m.requiredQty),
      fmtQty(m.actualQty),
      m.remarks || "",
    ]),
  );

  const bytes = await doc.save();
  return Buffer.from(bytes);
}