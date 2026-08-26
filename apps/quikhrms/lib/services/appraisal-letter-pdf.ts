import { PDFDocument, StandardFonts, rgb, type PDFImage } from "pdf-lib";
import { getObject } from "@/lib/storage";
import { drawDefaultLetterhead } from "@/lib/services/letter-header";
import { DEFAULT_APPRAISAL_LETTER_BODY } from "@/lib/performance/appraisal-letter-fields";

export interface AppraisalSalaryComponent {
  name: string;
  type: "Earning" | "Deduction" | "Reimbursement" | "Benefit" | "StatutoryContribution";
  amountType: "Fixed" | "PercentOfBasic" | "PercentOfCTC" | "PercentOfGross" | "Formula";
  amountValue: number | null;
}

export interface AppraisalLetterPdfInput {
  employeeName: string;
  firstName?: string | null;
  employeeCode?: string | null;
  designation?: string | null;
  department?: string | null;
  appraisalDate: string;
  effectiveDate: string;
  revisedCtc: number;
  revisedCtcWords: string;
  nextAppraisalMonth?: string | null;
  companyName: string;
  companyAddress?: string | null;
  letterDate: string;
  letterheadKey?: string | null;
  sealKey?: string | null;
  signatureKey?: string | null;
  signatoryName?: string | null;
  signatoryDesignation?: string | null;
  footer?: string | null;
  bodyTemplate?: string | null;
  /** Components of the employee's active salary structure, used to render Annexure A/B. */
  salaryComponents: AppraisalSalaryComponent[];
}

function inr(n: number): string {
  return `Rs. ${Math.round(n).toLocaleString("en-IN")}`;
}

function fieldValues(input: AppraisalLetterPdfInput): Record<string, string> {
  return {
    employeeName: input.employeeName ?? "",
    firstName: input.firstName ?? (input.employeeName ?? "").split(" ")[0] ?? "",
    employeeCode: input.employeeCode ?? "",
    designation: input.designation ?? "",
    department: input.department ?? "",
    appraisalDate: input.appraisalDate ?? "",
    effectiveDate: input.effectiveDate ?? "",
    revisedCtc: inr(input.revisedCtc),
    revisedCtcWords: input.revisedCtcWords ?? "",
    nextAppraisalMonth: input.nextAppraisalMonth ?? "",
    companyName: input.companyName ?? "",
    companyAddress: input.companyAddress ?? "",
    letterDate: input.letterDate ?? "",
    signatoryName: input.signatoryName ?? "",
    signatoryDesignation: input.signatoryDesignation ?? "",
  };
}

async function fetchImage(pdf: PDFDocument, key: string): Promise<PDFImage | null> {
  try {
    const obj = await getObject(key);
    const ct = (obj.contentType || "").toLowerCase();
    if (ct.includes("png")) return await pdf.embedPng(obj.body);
    if (ct.includes("jpeg") || ct.includes("jpg")) return await pdf.embedJpg(obj.body);
    if (obj.body[0] === 0x89 && obj.body[1] === 0x50) return await pdf.embedPng(obj.body);
    if (obj.body[0] === 0xff && obj.body[1] === 0xd8) return await pdf.embedJpg(obj.body);
    return null;
  } catch (err) {
    console.error(`[appraisal-letter-pdf] image fetch failed (${key}):`, err);
    return null;
  }
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

const A4: [number, number] = [595.28, 841.89];
const AMT = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Monthly amount for one component — same math as the salary-template editor / SalaryBreakdown. */
function calcMonthly(c: AppraisalSalaryComponent, monthlyPool: number, basicMonthly: number): number {
  const v = Number(c.amountValue) || 0;
  switch (c.amountType) {
    case "Fixed": return v;
    case "PercentOfBasic": return (basicMonthly * v) / 100;
    case "PercentOfCTC":
    case "PercentOfGross": return (monthlyPool * v) / 100;
    default: return 0;
  }
}

/**
 * Renders the Appraisal Letter as an A4 PDF using the org's branding
 * (letterhead, seal, signature) and the editable body template. Substitutes
 * {{fields}}, wraps long lines and paginates as needed. `{{signature}}` draws
 * the uploaded signature image; `{{salaryTable}}` draws the Annexure A/B
 * salary-breakdown table computed from the employee's active salary structure.
 */
export async function generateAppraisalLetterPdf(input: AppraisalLetterPdfInput): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const fontBold = await pdf.embedFont(StandardFonts.TimesRomanBold);

  const [width, height] = A4;
  const black = rgb(0.1, 0.1, 0.1);
  const marginX = 60;
  const topY = height - 150;
  const bottomY = 130;

  const letterhead = input.letterheadKey ? await fetchImage(pdf, input.letterheadKey) : null;
  const signature = input.signatureKey ? await fetchImage(pdf, input.signatureKey) : null;

  const newPage = () => {
    const p = pdf.addPage(A4);
    if (letterhead) p.drawImage(letterhead, { x: 0, y: 0, width, height });
    else drawDefaultLetterhead(p, { fontBold, font, companyName: input.companyName, companyAddress: input.companyAddress, width, height });
    return p;
  };

  let page = newPage();
  let y = topY;

  const drawLine = (t: string, bold: boolean) => {
    if (y < bottomY) { page = newPage(); y = topY; }
    page.drawText(t, { x: marginX, y, size: 11, font: bold ? fontBold : font, color: black });
    y -= 15;
  };

  let signatureDrawn = false;
  const drawSignature = () => {
    if (!signature) return;
    const base = signature.scale(0.35);
    const dims = base.width > 160 ? signature.scale((160 / base.width) * 0.35) : base;
    if (y - dims.height < bottomY) { page = newPage(); y = topY; }
    page.drawImage(signature, { x: marginX, y: y - dims.height, width: dims.width, height: dims.height });
    y -= dims.height + 6;
    signatureDrawn = true;
  };

  // ── Annexure A/B salary-breakdown table ────────────────────────────────
  const drawSalaryTable = () => {
    const comps = input.salaryComponents ?? [];
    if (comps.length === 0) return;

    const annualCTC = input.revisedCtc;
    const monthlyCTC = annualCTC / 12;
    const basicRow = comps.find((c) => /basic/i.test(c.name) && c.type === "Earning");
    const basicMonthly = basicRow ? calcMonthly(basicRow, monthlyCTC, 0) : 0;

    const earnings = comps.filter((c) => c.type === "Earning").map((c) => ({ name: c.name, monthly: calcMonthly(c, monthlyCTC, basicMonthly) }));
    const earningsSum = earnings.reduce((s, r) => s + r.monthly, 0);
    // "Special allowance" — the remainder needed for earnings to reach the full
    // monthly CTC pool (mirrors how the org's real payslip balances the structure).
    const specialAllowance = Math.max(0, monthlyCTC - earningsSum);
    if (specialAllowance > 1) earnings.push({ name: "Special Allowance", monthly: specialAllowance });
    const grossMonthly = earnings.reduce((s, r) => s + r.monthly, 0);

    const deductions = comps.filter((c) => c.type === "Deduction").map((c) => ({ name: c.name, monthly: calcMonthly(c, monthlyCTC, basicMonthly) }));
    const deductionsSum = deductions.reduce((s, r) => s + r.monthly, 0);
    const netMonthly = grossMonthly - deductionsSum;

    const employerContribs = comps.filter((c) => c.type === "StatutoryContribution").map((c) => ({ name: c.name, monthly: calcMonthly(c, monthlyCTC, basicMonthly) }));

    const colW = [0.5, 0.25, 0.25].map((f) => f * (width - 2 * marginX));
    const col1 = marginX, col2 = marginX + colW[0], col3 = marginX + colW[0] + colW[1];
    const rowH = 16;
    const ensureSpace = (rows: number) => {
      if (y - rows * rowH < bottomY) { page = newPage(); y = topY; }
    };

    const sectionHeader = (title: string) => {
      ensureSpace(2);
      y -= 6;
      page.drawText(title, { x: marginX, y, size: 10.5, font: fontBold, color: black });
      y -= 14;
    };
    const tableHeader = () => {
      page.drawText("Components", { x: col1, y, size: 8.5, font: fontBold, color: black });
      page.drawText("Monthly", { x: col2, y, size: 8.5, font: fontBold, color: black });
      page.drawText("Yearly", { x: col3, y, size: 8.5, font: fontBold, color: black });
      y -= 5;
      page.drawLine({ start: { x: col1, y }, end: { x: width - marginX, y }, thickness: 0.75, color: rgb(0.7, 0.7, 0.7) });
      y -= 13;
    };
    const row = (name: string, monthly: number, bold = false) => {
      ensureSpace(1);
      const f = bold ? fontBold : font;
      page.drawText(name, { x: col1, y, size: 9.5, font: f, color: black });
      page.drawText(AMT.format(Math.round(monthly)), { x: col2, y, size: 9.5, font: f, color: black });
      page.drawText(AMT.format(Math.round(monthly * 12)), { x: col3, y, size: 9.5, font: f, color: black });
      y -= rowH;
    };

    ensureSpace(4 + earnings.length);
    sectionHeader("Annexure - A");
    tableHeader();
    for (const e of earnings) row(e.name, e.monthly);
    row("GROSS SALARY", grossMonthly, true);

    if (deductions.length > 0) {
      ensureSpace(4 + deductions.length);
      sectionHeader("Annexure - B — Deductions");
      tableHeader();
      for (const d of deductions) row(d.name, d.monthly);
      row("NET SALARY (IN HAND)", netMonthly, true);
    }

    if (employerContribs.length > 0) {
      ensureSpace(4 + employerContribs.length);
      sectionHeader("Employer Contribution & Benefits");
      tableHeader();
      for (const e of employerContribs) row(e.name, e.monthly);
    }

    ensureSpace(2);
    y -= 4;
    row("CTC", monthlyCTC, true);
    y -= 8;
  };

  const values = fieldValues(input);
  const template = input.bodyTemplate?.trim() || DEFAULT_APPRAISAL_LETTER_BODY;
  const body = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) =>
    Object.prototype.hasOwnProperty.call(values, k) ? values[k] : `{{${k}}}`,
  );

  for (const rawLine of body.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed === "{{signature}}") { drawSignature(); continue; }
    if (trimmed === "{{salaryTable}}") { drawSalaryTable(); continue; }
    if (trimmed === "") { y -= 8; if (y < bottomY) { page = newPage(); y = topY; } continue; }
    const bold = /^subject:/i.test(trimmed) || trimmed === "Performance Appraisal Letter";
    for (const line of wrapText(rawLine, 92)) drawLine(line, bold);
  }

  if (!signatureDrawn) drawSignature();

  if (input.sealKey) {
    const seal = await fetchImage(pdf, input.sealKey);
    if (seal) {
      const s = 90;
      page.drawImage(seal, { x: width - marginX - s, y: 110, width: s, height: s, opacity: 0.85 });
    }
  }

  if (input.footer) {
    let fy = 60;
    for (const line of wrapText(input.footer, 110).slice(0, 2)) {
      page.drawText(line, { x: marginX, y: fy, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
      fy -= 11;
    }
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
