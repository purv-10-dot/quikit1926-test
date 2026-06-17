import { prisma } from "@/lib/prisma";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import {
  applyDeductionCaps,
  computeAnnualTax,
  getEmployeeDeductions,
  type Regime,
} from "@/lib/services/payroll-tds";

export function fyBounds(fy: string): { start: Date; end: Date } {
  const [startYearStr] = fy.split("-");
  const startYear = Number(startYearStr);
  return { start: new Date(`${startYear}-04-01`), end: new Date(`${startYear + 1}-03-31`) };
}
export function assessmentYear(fy: string): string {
  const [startYearStr] = fy.split("-");
  const startYear = Number(startYearStr);
  return `${startYear + 1}-${String((startYear + 2) % 100).padStart(2, "0")}`;
}

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
function inr(n: number): string {
  return `Rs. ${INR.format(Math.round(n))}`;
}

export interface PartBData {
  employer: { name: string | null; pan: string | null; address: string | null };
  employee: {
    employeeCode: string;
    name: string;
    pan: string | null;
    department: string | null;
    designation: string | null;
    dateOfJoining: Date;
  };
  fy: string;
  ay: string;
  regime: Regime;
  salary: {
    grossSalary: number;
    standardDeduction: number;
    exemptAllowances: number;
    professionalTax: number;
    netSalary: number;
  };
  chapterVIA: Record<string, number> | null;
  chapterVIATotal: number;
  tax: {
    taxableIncome: number;
    baseTax: number;
    rebate87A: number;
    taxAfterRebate: number;
    surcharge: number;
    educationCess: number;
    totalTaxLiability: number;
  };
  tds: {
    totalDeducted: number;
    balanceDue: number;
    refundDue: number;
    monthly: { month: string; grossPaid: number; tdsDeducted: number }[];
  };
}

export async function loadPartB(orgId: string, employeeId: string, fy: string): Promise<PartBData | null> {
  const { start, end } = fyBounds(fy);
  const [employee, company, claimsSettings, payslips] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: employeeId, orgId, deletedAt: null },
      select: {
        id: true, employeeCode: true, firstName: true, lastName: true,
        panNumber: true, dateOfJoining: true,
        department: { select: { name: true } },
        designation: { select: { title: true } },
      },
    }),
    prisma.companySettings.findUnique({
      where: { orgId },
      select: { companyName: true, pan: true, addressLine1: true, city: true, state: true },
    }),
    prisma.claimsDeclarationSettings.findUnique({
      where: { orgId },
      select: { defaultRegime: true },
    }),
    prisma.payslip.findMany({
      where: {
        orgId, deletedAt: null, employeeId, status: "Released",
        periodStart: { gte: start }, periodEnd: { lte: end },
      },
      include: { lines: true },
      orderBy: { periodStart: "asc" },
    }),
  ]);
  if (!employee || payslips.length === 0) return null;

  const regime: Regime = claimsSettings?.defaultRegime ?? "NewRegime";
  let grossSalary = 0;
  let professionalTax = 0;
  let tdsDeducted = 0;
  const monthly: { month: string; grossPaid: number; tdsDeducted: number }[] = [];
  for (const p of payslips) {
    const gross = Number(p.grossEarnings);
    grossSalary += gross;
    let mtds = 0;
    for (const l of p.lines) {
      const amt = Number(l.amount);
      if (l.category === "ProfessionalTax") professionalTax += amt;
      else if (l.category === "IncomeTax") { tdsDeducted += amt; mtds += amt; }
    }
    monthly.push({
      month: new Date(p.periodStart).toLocaleString("en-IN", { month: "long", year: "numeric" }),
      grossPaid: gross,
      tdsDeducted: mtds,
    });
  }

  const rawDeductions = await getEmployeeDeductions(orgId, employeeId, fy);
  const caps = applyDeductionCaps(rawDeductions);
  const breakup = computeAnnualTax({ annualGrossSalary: grossSalary, regime, deductions: rawDeductions });

  return {
    employer: {
      name: company?.companyName ?? null,
      pan: company?.pan ?? null,
      address: [company?.addressLine1, company?.city, company?.state].filter(Boolean).join(", ") || null,
    },
    employee: {
      employeeCode: employee.employeeCode,
      name: `${employee.firstName} ${employee.lastName}`,
      pan: employee.panNumber,
      department: employee.department?.name ?? null,
      designation: employee.designation?.title ?? null,
      dateOfJoining: employee.dateOfJoining,
    },
    fy, ay: assessmentYear(fy), regime,
    salary: {
      grossSalary,
      standardDeduction: breakup.standardDeduction,
      exemptAllowances: breakup.exemptAllowances,
      professionalTax,
      netSalary: breakup.netSalary,
    },
    chapterVIA: regime === "OldRegime" ? {
      "Section 80C (LIC, PPF, ELSS, etc.)": caps.section80C,
      "Section 80D (Medical Insurance)": caps.section80D,
      "Section 80E (Education Loan Interest)": caps.section80E,
      "Section 80G (Donations)": caps.section80G,
      "Section 80TTA (Savings Interest)": caps.section80TTA,
      "NPS 80CCD(1B)": caps.nps80CCD1B,
      "Home Loan Interest (24b)": caps.homeLoanInterest,
    } : null,
    chapterVIATotal: breakup.chapterVIATotal,
    tax: {
      taxableIncome: breakup.taxableIncome,
      baseTax: breakup.baseTax,
      rebate87A: breakup.rebate87A,
      taxAfterRebate: breakup.taxAfterRebate,
      surcharge: breakup.surcharge,
      educationCess: breakup.educationCess,
      totalTaxLiability: breakup.totalTaxLiability,
    },
    tds: {
      totalDeducted: tdsDeducted,
      balanceDue: Math.max(0, breakup.totalTaxLiability - tdsDeducted),
      refundDue: Math.max(0, tdsDeducted - breakup.totalTaxLiability),
      monthly,
    },
  };
}

interface DrawCtx {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number;
  doc: PDFDocument;
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const LINE = 14;

function ensureSpace(ctx: DrawCtx, needed: number) {
  if (ctx.y - needed < MARGIN + 30) {
    const np = ctx.doc.addPage([PAGE_W, PAGE_H]);
    ctx.page = np;
    ctx.y = PAGE_H - MARGIN;
  }
}

function drawText(ctx: DrawCtx, text: string, x: number, opts?: { bold?: boolean; size?: number; color?: [number, number, number] }) {
  ctx.page.drawText(text, {
    x,
    y: ctx.y,
    size: opts?.size ?? 9,
    font: opts?.bold ? ctx.bold : ctx.font,
    color: opts?.color ? rgb(opts.color[0], opts.color[1], opts.color[2]) : rgb(0.1, 0.1, 0.1),
  });
}

function newLine(ctx: DrawCtx, n = 1) {
  ctx.y -= LINE * n;
}

function drawHr(ctx: DrawCtx) {
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_W - MARGIN, y: ctx.y },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  newLine(ctx);
}

function sectionHeader(ctx: DrawCtx, label: string) {
  ensureSpace(ctx, 30);
  ctx.page.drawRectangle({
    x: MARGIN,
    y: ctx.y - 4,
    width: PAGE_W - 2 * MARGIN,
    height: 16,
    color: rgb(0.93, 0.95, 0.98),
  });
  drawText(ctx, label, MARGIN + 6, { bold: true, size: 10, color: [0.13, 0.34, 0.65] });
  newLine(ctx, 1.6);
}

function row(ctx: DrawCtx, label: string, value: string, opts?: { bold?: boolean }) {
  ensureSpace(ctx, LINE);
  drawText(ctx, label, MARGIN + 6, { bold: opts?.bold });
  const text = value ?? "";
  const size = 9;
  const w = (opts?.bold ? ctx.bold : ctx.font).widthOfTextAtSize(text, size);
  ctx.page.drawText(text, {
    x: PAGE_W - MARGIN - 6 - w,
    y: ctx.y,
    size,
    font: opts?.bold ? ctx.bold : ctx.font,
    color: rgb(0.1, 0.1, 0.1),
  });
  newLine(ctx);
}

export async function buildPdf(data: PartBData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const ctx: DrawCtx = { page, font, bold, y: PAGE_H - MARGIN, doc };

  drawText(ctx, "FORM No. 16 — PART B", MARGIN, { bold: true, size: 14, color: [0.13, 0.34, 0.65] });
  newLine(ctx);
  drawText(ctx, "(Certificate under Section 203 of the Income-tax Act, 1961 for tax deducted at source on salary)", MARGIN, { size: 8 });
  newLine(ctx, 1.4);
  drawHr(ctx);

  drawText(ctx, "Employer", MARGIN, { bold: true });
  drawText(ctx, "Employee", PAGE_W / 2 + 10, { bold: true });
  newLine(ctx);
  drawText(ctx, data.employer.name ?? "—", MARGIN);
  drawText(ctx, data.employee.name, PAGE_W / 2 + 10);
  newLine(ctx);
  drawText(ctx, `PAN: ${data.employer.pan ?? "—"}`, MARGIN);
  drawText(ctx, `PAN: ${data.employee.pan ?? "—"}`, PAGE_W / 2 + 10);
  newLine(ctx);
  drawText(ctx, data.employer.address ?? "—", MARGIN, { size: 8 });
  drawText(ctx, `Emp Code: ${data.employee.employeeCode}`, PAGE_W / 2 + 10, { size: 8 });
  newLine(ctx);
  drawText(ctx, "", MARGIN);
  drawText(ctx, `${data.employee.designation ?? ""} · ${data.employee.department ?? ""}`, PAGE_W / 2 + 10, { size: 8 });
  newLine(ctx);
  drawText(ctx, "", MARGIN);
  drawText(ctx, `DOJ: ${new Date(data.employee.dateOfJoining).toLocaleDateString("en-IN")}`, PAGE_W / 2 + 10, { size: 8 });
  newLine(ctx, 1.2);

  drawHr(ctx);
  row(ctx, "Financial Year", data.fy, { bold: true });
  row(ctx, "Assessment Year", data.ay, { bold: true });
  row(ctx, "Tax Regime", data.regime === "OldRegime" ? "Old Regime" : "New Regime", { bold: true });
  newLine(ctx, 0.4);

  sectionHeader(ctx, "1. Gross Salary");
  row(ctx, "(a) Salary as per provisions u/s 17(1)", inr(data.salary.grossSalary));
  row(ctx, "(b) Less: Allowances exempt u/s 10", inr(data.salary.exemptAllowances));
  row(ctx, "(c) Total", inr(data.salary.grossSalary - data.salary.exemptAllowances), { bold: true });

  sectionHeader(ctx, "2. Deductions u/s 16");
  row(ctx, "(a) Standard Deduction u/s 16(ia)", inr(data.salary.standardDeduction));
  row(ctx, "(b) Tax on Employment (Professional Tax) u/s 16(iii)", inr(data.salary.professionalTax));
  row(ctx, "(c) Total Deductions u/s 16", inr(data.salary.standardDeduction + data.salary.professionalTax), { bold: true });

  sectionHeader(ctx, "3. Income Chargeable under the head 'Salaries'");
  row(ctx, "Net Salary (1c - 2c)", inr(data.salary.netSalary), { bold: true });

  if (data.chapterVIA) {
    sectionHeader(ctx, "4. Deductions under Chapter VI-A");
    for (const [k, v] of Object.entries(data.chapterVIA)) {
      row(ctx, k, inr(v));
    }
    row(ctx, "Total Chapter VI-A Deductions", inr(data.chapterVIATotal), { bold: true });
  }

  sectionHeader(ctx, "5. Tax Computation");
  row(ctx, "(a) Total Taxable Income", inr(data.tax.taxableIncome), { bold: true });
  row(ctx, "(b) Tax on Total Income", inr(data.tax.baseTax));
  row(ctx, "(c) Less: Rebate u/s 87A", inr(data.tax.rebate87A));
  row(ctx, "(d) Tax after Rebate", inr(data.tax.taxAfterRebate));
  row(ctx, "(e) Surcharge", inr(data.tax.surcharge));
  row(ctx, "(f) Health & Education Cess @ 4%", inr(data.tax.educationCess));
  row(ctx, "(g) Total Tax Liability", inr(data.tax.totalTaxLiability), { bold: true });

  sectionHeader(ctx, "6. Tax Deducted at Source");
  row(ctx, "Total TDS Deducted from Salary", inr(data.tds.totalDeducted), { bold: true });
  if (data.tds.balanceDue > 0) row(ctx, "Balance Tax Payable", inr(data.tds.balanceDue));
  if (data.tds.refundDue > 0) row(ctx, "Refund Due", inr(data.tds.refundDue));

  sectionHeader(ctx, "7. Monthly Salary & TDS Detail");
  ensureSpace(ctx, LINE);
  drawText(ctx, "Month", MARGIN + 6, { bold: true, size: 8 });
  drawText(ctx, "Gross Paid", MARGIN + 220, { bold: true, size: 8 });
  drawText(ctx, "TDS Deducted", MARGIN + 360, { bold: true, size: 8 });
  newLine(ctx);
  for (const m of data.tds.monthly) {
    ensureSpace(ctx, LINE);
    drawText(ctx, m.month, MARGIN + 6, { size: 8 });
    drawText(ctx, inr(m.grossPaid), MARGIN + 220, { size: 8 });
    drawText(ctx, inr(m.tdsDeducted), MARGIN + 360, { size: 8 });
    newLine(ctx);
  }

  ensureSpace(ctx, 60);
  newLine(ctx, 1.5);
  drawHr(ctx);
  drawText(ctx, "I, the deductor, certify that a sum of " + inr(data.tds.totalDeducted) + " has been deducted at source", MARGIN, { size: 8 });
  newLine(ctx);
  drawText(ctx, "and paid to the credit of the Central Government as per provisions of the Income-tax Act, 1961.", MARGIN, { size: 8 });
  newLine(ctx, 2);
  drawText(ctx, "Signature of person responsible for deduction of tax", MARGIN, { bold: true, size: 8 });
  newLine(ctx);
  drawText(ctx, `For ${data.employer.name ?? ""}`, MARGIN, { size: 8 });

  drawText(ctx, "Note: Part A (TRACES TDS Certificate) must be obtained separately from the TRACES portal.", MARGIN, { size: 7, color: [0.5, 0.5, 0.5] });
  return doc.save();
}
