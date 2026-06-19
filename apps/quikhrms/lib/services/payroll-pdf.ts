import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import { numberToIndianWords } from "@/lib/utils/number-to-words";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

const TEXT = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.45, 0.45, 0.45);
const BORDER = rgb(0.85, 0.85, 0.85);
const SECTION_BG = rgb(0.96, 0.96, 0.96);

export interface PayslipPdfInput {
  company: { name: string | null; address: string | null; pan: string | null; logo?: string | null };
  employee: {
    employeeCode: string;
    name: string;
    designation: string | null;
    department: string | null;
    location: string | null;
    pan: string | null;
    bank: { bankName: string | null; accountNumber: string | null; ifsc: string | null } | null;
    dateOfJoining: Date | null;
  };
  period: { start: Date; end: Date; payDate: Date };
  workingDays: number;
  paidDays: number;
  lopDays: number;
  earnings: { name: string; amount: number }[];
  deductions: { name: string; amount: number }[];
  employerContribs: { name: string; amount: number }[];
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
}

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number;
}

function fmtAmt(n: number): string {
  return INR.format(Math.round(n));
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function ensureSpace(ctx: Ctx, needed: number) {
  if (ctx.y - needed < MARGIN + 30) {
    const np = ctx.doc.addPage([PAGE_W, PAGE_H]);
    ctx.page = np;
    ctx.y = PAGE_H - MARGIN;
  }
}

function drawText(ctx: Ctx, t: string, x: number, y: number, opts?: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb> }) {
  const size = opts?.size ?? 9;
  ctx.page.drawText(t, {
    x, y, size,
    font: opts?.bold ? ctx.bold : ctx.font,
    color: opts?.color ?? TEXT,
  });
}

function drawRightText(ctx: Ctx, t: string, rightEdge: number, y: number, opts?: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb> }) {
  const size = opts?.size ?? 9;
  const f = opts?.bold ? ctx.bold : ctx.font;
  const w = f.widthOfTextAtSize(t, size);
  ctx.page.drawText(t, { x: rightEdge - w, y, size, font: f, color: opts?.color ?? TEXT });
}

function drawCenterText(ctx: Ctx, t: string, y: number, opts?: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb> }) {
  const size = opts?.size ?? 9;
  const f = opts?.bold ? ctx.bold : ctx.font;
  const w = f.widthOfTextAtSize(t, size);
  ctx.page.drawText(t, { x: (PAGE_W - w) / 2, y, size, font: f, color: opts?.color ?? TEXT });
}

function drawBox(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.page.drawRectangle({ x, y, width: w, height: h, borderColor: BORDER, borderWidth: 0.5 });
}

function drawSectionBar(ctx: Ctx, x: number, y: number, w: number, h: number, label: string, rightLabel?: string) {
  ctx.page.drawRectangle({ x, y, width: w, height: h, color: SECTION_BG, borderColor: BORDER, borderWidth: 0.5 });
  drawText(ctx, label, x + 8, y + 5, { bold: true, size: 10 });
  if (rightLabel) drawRightText(ctx, rightLabel, x + w - 8, y + 5, { bold: true, size: 10, color: MUTED });
}

export async function buildPayslipPdf(input: PayslipPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const ctx: Ctx = { doc, page, font, bold, y: PAGE_H - MARGIN };

  const usableW = PAGE_W - 2 * MARGIN;
  const periodCompact = input.period.start.toLocaleString("en-US", { month: "short", year: "numeric" }).replace(" ", "-");
  const actualDays = Math.round(
    (input.period.end.getTime() - input.period.start.getTime()) / (1000 * 60 * 60 * 24),
  ) + 1;

  // Company header (centered)
  ctx.y -= 4;
  drawCenterText(ctx, (input.company.name ?? "COMPANY").toUpperCase(), ctx.y, { bold: true, size: 14 });
  ctx.y -= 18;
  drawCenterText(ctx, `Pay Slip (${periodCompact})`, ctx.y, { size: 11 });
  ctx.y -= 24;

  // Employee Details + Bank Details (two cards)
  const cardW = (usableW - 12) / 2;
  const cardH = 110;
  const cardTop = ctx.y;
  const empX = MARGIN;
  const bankX = MARGIN + cardW + 12;

  // Employee card
  drawBox(ctx, empX, cardTop - cardH, cardW, cardH);
  drawSectionBar(ctx, empX, cardTop - 20, cardW, 20, "Employee Details");
  let yy = cardTop - 36;
  const empRows: [string, string][] = [
    ["Employee Name", input.employee.name],
    ["Employee No.", input.employee.employeeCode],
    ["Date Of joining", input.employee.dateOfJoining ? fmtDate(input.employee.dateOfJoining) : "NA"],
    ["Department", input.employee.department ?? "NA"],
    ["Designation", input.employee.designation ?? "NA"],
  ];
  for (const [k, v] of empRows) {
    drawText(ctx, k, empX + 8, yy, { size: 8, color: MUTED });
    drawText(ctx, v, empX + 110, yy, { size: 9 });
    yy -= 14;
  }

  // Bank card
  drawBox(ctx, bankX, cardTop - cardH, cardW, cardH);
  drawSectionBar(ctx, bankX, cardTop - 20, cardW, 20, "Bank Details");
  yy = cardTop - 36;
  const bankRows: [string, string][] = [
    ["Bank Acc. No.", input.employee.bank?.accountNumber ?? "NA"],
    ["Bank Name", input.employee.bank?.bankName ?? "NA"],
    ["Bank IFSC", input.employee.bank?.ifsc ?? "NA"],
    ["PAN No.", input.employee.pan ?? "NA"],
  ];
  for (const [k, v] of bankRows) {
    drawText(ctx, k, bankX + 8, yy, { size: 8, color: MUTED });
    drawText(ctx, v, bankX + 110, yy, { size: 9 });
    yy -= 14;
  }

  ctx.y = cardTop - cardH - 16;

  // Salary Details — 4 cols
  const salaryH = 56;
  const salaryTop = ctx.y;
  drawBox(ctx, MARGIN, salaryTop - salaryH, usableW, salaryH);
  drawSectionBar(ctx, MARGIN, salaryTop - 20, usableW, 20, "Salary Details");

  const colW = usableW / 4;
  const cells: [string, string][] = [
    ["Actual Days", String(actualDays || "NA")],
    ["Working Days", String(input.workingDays)],
    ["Loss of Days", input.lopDays > 0 ? String(input.lopDays) : "NA"],
    ["Days Payble", String(input.paidDays)],
  ];
  for (let i = 0; i < cells.length; i++) {
    const cx = MARGIN + i * colW + colW / 2;
    const [label, val] = cells[i];
    const lw = font.widthOfTextAtSize(label, 8);
    drawText(ctx, label, cx - lw / 2, salaryTop - 32, { size: 8, color: MUTED, bold: true });
    const vw = bold.widthOfTextAtSize(val, 11);
    drawText(ctx, val, cx - vw / 2, salaryTop - 48, { size: 11, bold: true });
  }

  ctx.y = salaryTop - salaryH - 16;

  const lineH = 16;

  // Earnings
  const earningsBarTop = ctx.y;
  const earningsBoxH = 20 + input.earnings.length * lineH + 22;
  drawBox(ctx, MARGIN, earningsBarTop - earningsBoxH, usableW, earningsBoxH);
  drawSectionBar(ctx, MARGIN, earningsBarTop - 20, usableW, 20, "Earnings", "E");
  let rowY = earningsBarTop - 20 - lineH + 4;
  for (const e of input.earnings) {
    ensureSpace(ctx, lineH);
    drawText(ctx, e.name, MARGIN + 8, rowY, { size: 9 });
    drawRightText(ctx, fmtAmt(e.amount), PAGE_W - MARGIN - 8, rowY, { size: 9 });
    rowY -= lineH;
  }
  ctx.page.drawLine({
    start: { x: MARGIN + 8, y: rowY + lineH - 3 },
    end: { x: PAGE_W - MARGIN - 8, y: rowY + lineH - 3 },
    thickness: 0.5, color: BORDER,
  });
  drawText(ctx, "Total Earnings (E)", MARGIN + 8, rowY - 2, { size: 9, bold: true });
  drawRightText(ctx, fmtAmt(input.grossEarnings), PAGE_W - MARGIN - 8, rowY - 2, { size: 9, bold: true });

  ctx.y = earningsBarTop - earningsBoxH - 16;

  // Tax Deductions
  const tdBarTop = ctx.y;
  const tdRows = input.deductions;
  const tdBoxH = 20 + Math.max(tdRows.length, 1) * lineH + 22;
  drawBox(ctx, MARGIN, tdBarTop - tdBoxH, usableW, tdBoxH);
  drawSectionBar(ctx, MARGIN, tdBarTop - 20, usableW, 20, "Tax Deductions", "TD");
  let tdRowY = tdBarTop - 20 - lineH + 4;
  for (const d of tdRows) {
    ensureSpace(ctx, lineH);
    drawText(ctx, d.name, MARGIN + 8, tdRowY, { size: 9 });
    drawRightText(ctx, fmtAmt(d.amount), PAGE_W - MARGIN - 8, tdRowY, { size: 9 });
    tdRowY -= lineH;
  }
  const tdTotalY = tdBarTop - tdBoxH + 8;
  ctx.page.drawLine({
    start: { x: MARGIN + 8, y: tdTotalY + lineH - 3 },
    end: { x: PAGE_W - MARGIN - 8, y: tdTotalY + lineH - 3 },
    thickness: 0.5, color: BORDER,
  });
  drawText(ctx, "Total Tax Deductions (TD)", MARGIN + 8, tdTotalY, { size: 9, bold: true });
  drawRightText(ctx, fmtAmt(input.totalDeductions), PAGE_W - MARGIN - 8, tdTotalY, { size: 9, bold: true });

  ctx.y = tdBarTop - tdBoxH - 20;

  // Net Salary line
  ensureSpace(ctx, 40);
  drawText(ctx, "Net Salary (Payable Salary) (E - TD)", MARGIN, ctx.y, { size: 10, bold: true });
  drawRightText(ctx, fmtAmt(input.netPay), PAGE_W - MARGIN, ctx.y, { size: 11, bold: true });
  ctx.y -= 14;
  drawText(ctx, "Net Salary in words", MARGIN, ctx.y, { size: 10, bold: true });
  drawRightText(ctx, numberToIndianWords(input.netPay), PAGE_W - MARGIN, ctx.y, { size: 9 });
  ctx.y -= 24;

  // Notes
  ensureSpace(ctx, 30);
  drawText(ctx, "*Note : All amount displayed in this payslip are in INR", MARGIN, ctx.y, { size: 8, bold: true });
  ctx.y -= 12;
  drawText(ctx, "*This is computer generated statement does not required signature.", MARGIN, ctx.y, { size: 8, color: MUTED });

  // Employer Contributions appendix (informational, optional)
  if (input.employerContribs.length > 0) {
    ctx.y -= 24;
    ensureSpace(ctx, 60);
    const ecBarTop = ctx.y;
    const ecRowsH = input.employerContribs.length * lineH;
    const ecBoxH = 20 + ecRowsH + 6;
    drawBox(ctx, MARGIN, ecBarTop - ecBoxH, usableW, ecBoxH);
    drawSectionBar(ctx, MARGIN, ecBarTop - 20, usableW, 20, "Employer Contributions (CTC, not paid to employee)");
    let ecY = ecBarTop - 20 - lineH + 4;
    for (const c of input.employerContribs) {
      drawText(ctx, c.name, MARGIN + 8, ecY, { size: 9, color: MUTED });
      drawRightText(ctx, fmtAmt(c.amount), PAGE_W - MARGIN - 8, ecY, { size: 9, color: MUTED });
      ecY -= lineH;
    }
  }

  return doc.save();
}
