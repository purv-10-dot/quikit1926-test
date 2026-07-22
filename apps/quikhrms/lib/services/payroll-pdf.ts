import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import { numberToIndianWords } from "@/lib/utils/number-to-words";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 45;
const USABLE_W = PAGE_W - 2 * MARGIN;

const INK = rgb(0.11, 0.12, 0.14);
const MUTED = rgb(0.5, 0.52, 0.56);
const LINE = rgb(0.85, 0.86, 0.88);
const HILITE = rgb(0.955, 0.96, 0.965);

const AMT = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
}

const fmtAmt = (n: number) => AMT.format(n);
const fmtDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

function text(ctx: Ctx, t: string, x: number, y: number, o?: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb> }) {
  ctx.page.drawText(t, { x, y, size: o?.size ?? 9, font: o?.bold ? ctx.bold : ctx.font, color: o?.color ?? INK });
}
function rightText(ctx: Ctx, t: string, rightEdge: number, y: number, o?: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb> }) {
  const size = o?.size ?? 9;
  const f = o?.bold ? ctx.bold : ctx.font;
  ctx.page.drawText(t, { x: rightEdge - f.widthOfTextAtSize(t, size), y, size, font: f, color: o?.color ?? INK });
}
function hLine(ctx: Ctx, x1: number, x2: number, y: number, color = LINE, thickness = 0.75) {
  ctx.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
}

export async function buildPayslipPdf(input: PayslipPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const ctx: Ctx = { page, font, bold };

  const right = PAGE_W - MARGIN;
  let y = PAGE_H - MARGIN;

  // ── Title: "PAYSLIP" + month year ─────────────────────
  const monthYear = input.period.start
    .toLocaleString("en-US", { month: "short", year: "numeric" })
    .toUpperCase();
  text(ctx, "PAYSLIP", MARGIN, y - 20, { bold: true, size: 22 });
  const pw = bold.widthOfTextAtSize("PAYSLIP", 22);
  text(ctx, monthYear, MARGIN + pw + 8, y - 20, { size: 22, color: MUTED });
  y -= 46;

  // ── Company ───────────────────────────────────────────
  text(ctx, (input.company.name ?? "COMPANY").toUpperCase(), MARGIN, y, { bold: true, size: 11 });
  y -= 15;
  if (input.company.address) {
    const parts = input.company.address.split(",").map((s) => s.trim()).filter(Boolean);
    const line1 = parts[0] ?? "";
    const line2 = parts.slice(1).join(", ");
    if (line1) { text(ctx, line1, MARGIN, y, { size: 8.5, color: MUTED }); y -= 12; }
    if (line2) { text(ctx, line2, MARGIN, y, { size: 8.5, color: MUTED }); y -= 12; }
  }
  y -= 14;

  // ── Employee name + details grid ──────────────────────
  text(ctx, input.employee.name.toUpperCase(), MARGIN, y, { bold: true, size: 12 });
  y -= 12;
  hLine(ctx, MARGIN, right, y, INK, 1);
  y -= 6;

  const colW = USABLE_W / 4;
  const grid: [string, string][][] = [
    [
      ["Employee Number", input.employee.employeeCode || "N/A"],
      ["Date Joined", input.employee.dateOfJoining ? fmtDate(input.employee.dateOfJoining) : "N/A"],
      ["Department", input.employee.department ?? "N/A"],
      ["Sub Department", "N/A"],
    ],
    [
      ["Designation", input.employee.designation ?? "N/A"],
      ["Payment Mode", "Bank Transfer"],
      ["Bank", input.employee.bank?.bankName ?? "N/A"],
      ["Bank IFSC", input.employee.bank?.ifsc ?? "N/A"],
    ],
    [
      ["Bank Account", input.employee.bank?.accountNumber ?? "N/A"],
      ["PAN", input.employee.pan ?? "N/A"],
      ["UAN", "N/A"],
      ["PF Number", "N/A"],
    ],
  ];
  const rowH = 38;
  for (const row of grid) {
    const top = y;
    row.forEach(([label, val], c) => {
      const cx = MARGIN + c * colW;
      text(ctx, label.toUpperCase(), cx, top - 11, { size: 7, color: MUTED });
      text(ctx, val, cx, top - 25, { size: 9.5 });
    });
    y = top - rowH;
    hLine(ctx, MARGIN, right, y + 4);
  }
  y -= 12;

  // ── SALARY DETAILS ────────────────────────────────────
  text(ctx, "SALARY DETAILS", MARGIN, y, { bold: true, size: 10 });
  y -= 8;
  hLine(ctx, MARGIN, right, y, INK, 1);
  y -= 6;
  const salary: [string, string][] = [
    ["Actual Payable Days", input.paidDays.toFixed(1)],
    ["Total Working Days", input.workingDays.toFixed(1)],
    ["Loss of Pay Days", input.lopDays.toFixed(1)],
    ["Days Payable", String(input.paidDays)],
  ];
  salary.forEach(([label, val], c) => {
    const cx = MARGIN + c * colW;
    text(ctx, label.toUpperCase(), cx, y - 11, { size: 7, color: MUTED });
    text(ctx, val, cx, y - 25, { size: 9.5 });
  });
  y -= 38;
  hLine(ctx, MARGIN, right, y + 4);
  y -= 16;

  // ── Earnings (left) + Taxes & Deductions (right) ──────
  const colGap = 28;
  const halfW = (USABLE_W - colGap) / 2;
  const leftX = MARGIN;
  const leftRight = leftX + halfW;
  const rightX = MARGIN + halfW + colGap;
  const rightRight = PAGE_W - MARGIN;
  const rowLine = 17;

  const headerY = y;
  text(ctx, "EARNINGS", leftX, headerY, { bold: true, size: 10 });
  text(ctx, "TAXES & DEDUCTIONS", rightX, headerY, { bold: true, size: 10 });

  // Left column
  let ly = headerY - 20;
  for (const e of input.earnings) {
    text(ctx, e.name, leftX, ly, { size: 9 });
    rightText(ctx, fmtAmt(e.amount), leftRight, ly, { size: 9 });
    ly -= rowLine;
  }
  hLine(ctx, leftX, leftRight, ly + rowLine - 4);
  text(ctx, "Total Earnings (A)", leftX, ly - 2, { bold: true, size: 9 });
  rightText(ctx, fmtAmt(input.grossEarnings), leftRight, ly - 2, { bold: true, size: 9 });
  const leftBottom = ly - 2;

  // Right column
  let ry = headerY - 20;
  const ded = input.deductions.length ? input.deductions : [{ name: "—", amount: 0 }];
  for (const d of ded) {
    text(ctx, d.name, rightX, ry, { size: 9 });
    rightText(ctx, fmtAmt(d.amount), rightRight, ry, { size: 9 });
    ry -= rowLine;
  }
  hLine(ctx, rightX, rightRight, ry + rowLine - 4);
  text(ctx, "Total Deductions (C)", rightX, ry - 2, { bold: true, size: 9 });
  rightText(ctx, fmtAmt(input.totalDeductions), rightRight, ry - 2, { bold: true, size: 9 });
  const rightBottom = ry - 2;

  // Divider between the two columns
  const dividerX = MARGIN + halfW + colGap / 2;
  ctx.page.drawLine({ start: { x: dividerX, y: headerY + 6 }, end: { x: dividerX, y: Math.min(leftBottom, rightBottom) - 4 }, thickness: 0.75, color: LINE });

  y = Math.min(leftBottom, rightBottom) - 30;

  // ── Net Salary box ────────────────────────────────────
  const boxH = 52;
  ctx.page.drawRectangle({ x: MARGIN, y: y - boxH, width: USABLE_W, height: boxH, color: HILITE });
  text(ctx, "Net Salary Payable ( A - C )", MARGIN + 14, y - 20, { bold: true, size: 10 });
  rightText(ctx, fmtAmt(input.netPay), right - 14, y - 20, { bold: true, size: 11 });
  text(ctx, "Net Salary in words", MARGIN + 14, y - 40, { size: 9, color: MUTED });
  const words = `${numberToIndianWords(Math.round(input.netPay)).replace(/\s*rupees\s*$/i, "")} only`;
  text(ctx, words, MARGIN + 130, y - 40, { size: 9 });
  y -= boxH + 24;

  // ── Notes ─────────────────────────────────────────────
  text(ctx, "**Note :", MARGIN, y, { bold: true, size: 8.5 });
  text(ctx, "  All amounts displayed in this payslip are in INR", MARGIN + 40, y, { size: 8.5, color: MUTED });
  y -= 22;
  text(ctx, "*This is a system generated salary slip and does not require signature.", MARGIN, y, { size: 8, color: MUTED });

  return doc.save();
}
