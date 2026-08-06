import { prisma } from "@/lib/prisma";

export type Regime = "OldRegime" | "NewRegime";

interface Slab {
  upto: number;
  rate: number;
}

const NEW_REGIME_SLABS: Slab[] = [
  { upto: 400000, rate: 0 },
  { upto: 800000, rate: 5 },
  { upto: 1200000, rate: 10 },
  { upto: 1600000, rate: 15 },
  { upto: 2000000, rate: 20 },
  { upto: 2400000, rate: 25 },
  { upto: Infinity, rate: 30 },
];

const OLD_REGIME_SLABS: Slab[] = [
  { upto: 250000, rate: 0 },
  { upto: 500000, rate: 5 },
  { upto: 1000000, rate: 20 },
  { upto: Infinity, rate: 30 },
];

const STANDARD_DEDUCTION_NEW = 75000;
const STANDARD_DEDUCTION_OLD = 50000;
const REBATE_CEILING_NEW = 1200000;
const REBATE_CEILING_OLD = 500000;

const SEC_80C_CAP = 150000;
const SEC_80D_CAP = 100000;
const SEC_80TTA_CAP = 10000;
const NPS_80CCD1B_CAP = 50000;
const HOME_LOAN_INTEREST_CAP = 200000;

export function getFiscalYear(date: Date): string {
  const month = date.getMonth();
  const year = date.getFullYear();
  const startYear = month >= 3 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function fiscalYearStart(fy: string): Date {
  const [startYearStr] = fy.split("-");
  return new Date(Number(startYearStr), 3, 1);
}

function monthsElapsedInFY(date: Date): number {
  const month = date.getMonth();
  return month >= 3 ? month - 3 : month + 9;
}

function computeTaxOnSlabs(taxableIncome: number, regime: Regime): number {
  const slabs = regime === "NewRegime" ? NEW_REGIME_SLABS : OLD_REGIME_SLABS;
  let tax = 0;
  let prev = 0;
  for (const slab of slabs) {
    if (taxableIncome <= prev) break;
    const taxableInSlab = Math.min(taxableIncome, slab.upto) - prev;
    tax += (taxableInSlab * slab.rate) / 100;
    prev = slab.upto;
  }
  return tax;
}

function computeRebate87A(taxableIncome: number, baseTax: number, regime: Regime): number {
  const ceiling = regime === "NewRegime" ? REBATE_CEILING_NEW : REBATE_CEILING_OLD;
  return taxableIncome <= ceiling ? baseTax : 0;
}

function computeSurcharge(annualTax: number, taxableIncome: number): number {
  if (taxableIncome > 50000000) return annualTax * 0.37;
  if (taxableIncome > 20000000) return annualTax * 0.25;
  if (taxableIncome > 10000000) return annualTax * 0.15;
  if (taxableIncome > 5000000) return annualTax * 0.10;
  return 0;
}

export interface DeclaredDeductions {
  section80C: number;
  section80D: number;
  section80E: number;
  section80G: number;
  section80TTA: number;
  nps80CCD1B: number;
  homeLoanInterest: number;
  hraExemption: number;
  ltaExemption: number;
  otherIncome: number;
}

const EMPTY_DEDUCTIONS: DeclaredDeductions = {
  section80C: 0,
  section80D: 0,
  section80E: 0,
  section80G: 0,
  section80TTA: 0,
  nps80CCD1B: 0,
  homeLoanInterest: 0,
  hraExemption: 0,
  ltaExemption: 0,
  otherIncome: 0,
};

/**
 * Aggregate investment proofs for an employee in a given FY by section.
 * Uses approvedAmount when present (verified), otherwise declaredAmount.
 * Rejected proofs are excluded.
 */
export async function getEmployeeDeductions(
  orgId: string,
  employeeId: string,
  fy: string,
): Promise<DeclaredDeductions> {
  const proofs = await prisma.investmentProof.findMany({
    where: {
      orgId,
      employeeId,
      financialYear: fy,
      deletedAt: null,
      status: { in: ["Submitted", "UnderReview", "Approved", "PartiallyApproved"] },
    },
    select: { section: true, declaredAmount: true, approvedAmount: true, status: true },
  });

  const totals = { ...EMPTY_DEDUCTIONS };
  for (const p of proofs) {
    const amount =
      p.status === "Approved" || p.status === "PartiallyApproved"
        ? Number(p.approvedAmount ?? p.declaredAmount)
        : Number(p.declaredAmount);
    const sec = p.section.toUpperCase().replace(/\s/g, "");

    if (sec.startsWith("80C")) totals.section80C += amount;
    else if (sec.startsWith("80D")) totals.section80D += amount;
    else if (sec.startsWith("80E")) totals.section80E += amount;
    else if (sec.startsWith("80G")) totals.section80G += amount;
    else if (sec.startsWith("80TTA")) totals.section80TTA += amount;
    else if (sec === "80CCD1B" || sec === "80CCD(1B)") totals.nps80CCD1B += amount;
    else if (sec.startsWith("24") || sec.startsWith("HOMELOAN")) totals.homeLoanInterest += amount;
    else if (sec === "HRA") totals.hraExemption += amount;
    else if (sec === "LTA") totals.ltaExemption += amount;
  }

  return totals;
}

export function applyDeductionCaps(d: DeclaredDeductions): DeclaredDeductions {
  return {
    section80C: Math.min(d.section80C, SEC_80C_CAP),
    section80D: Math.min(d.section80D, SEC_80D_CAP),
    section80E: d.section80E,
    section80G: d.section80G,
    section80TTA: Math.min(d.section80TTA, SEC_80TTA_CAP),
    nps80CCD1B: Math.min(d.nps80CCD1B, NPS_80CCD1B_CAP),
    homeLoanInterest: Math.min(d.homeLoanInterest, HOME_LOAN_INTEREST_CAP),
    hraExemption: d.hraExemption,
    ltaExemption: d.ltaExemption,
    otherIncome: d.otherIncome,
  };
}

export interface TaxBreakup {
  regime: Regime;
  grossSalary: number;
  standardDeduction: number;
  exemptAllowances: number;
  netSalary: number;
  otherIncome: number;
  homeLoanInterest: number;
  chapterVIATotal: number;
  taxableIncome: number;
  baseTax: number;
  rebate87A: number;
  taxAfterRebate: number;
  surcharge: number;
  educationCess: number;
  totalTaxLiability: number;
}

export function computeAnnualTax(params: {
  annualGrossSalary: number;
  regime: Regime;
  deductions: DeclaredDeductions;
}): TaxBreakup {
  const { annualGrossSalary, regime } = params;
  const caps = applyDeductionCaps(params.deductions);

  const standardDeduction = regime === "NewRegime" ? STANDARD_DEDUCTION_NEW : STANDARD_DEDUCTION_OLD;
  const exemptAllowances = regime === "OldRegime" ? caps.hraExemption + caps.ltaExemption : 0;

  const netSalary = Math.max(0, annualGrossSalary - standardDeduction - exemptAllowances);
  const homeLoanInterest = regime === "OldRegime" ? caps.homeLoanInterest : 0;
  const grossTotalIncome = netSalary + caps.otherIncome - homeLoanInterest;

  const chapterVIATotal =
    regime === "OldRegime"
      ? caps.section80C +
        caps.section80D +
        caps.section80E +
        caps.section80G +
        caps.section80TTA +
        caps.nps80CCD1B
      : 0;

  const taxableIncome = Math.max(0, grossTotalIncome - chapterVIATotal);

  const baseTax = computeTaxOnSlabs(taxableIncome, regime);
  const rebate = computeRebate87A(taxableIncome, baseTax, regime);
  const taxAfterRebate = Math.max(0, baseTax - rebate);
  const surcharge = computeSurcharge(taxAfterRebate, taxableIncome);
  const educationCess = (taxAfterRebate + surcharge) * 0.04;
  const totalTaxLiability = taxAfterRebate + surcharge + educationCess;

  return {
    regime,
    grossSalary: annualGrossSalary,
    standardDeduction,
    exemptAllowances,
    netSalary,
    otherIncome: caps.otherIncome,
    homeLoanInterest,
    chapterVIATotal,
    taxableIncome,
    baseTax: round2(baseTax),
    rebate87A: round2(rebate),
    taxAfterRebate: round2(taxAfterRebate),
    surcharge: round2(surcharge),
    educationCess: round2(educationCess),
    totalTaxLiability: round2(totalTaxLiability),
  };
}

/**
 * Batch fetch TDS-related data for ALL employees in a single pass.
 * Use this before a multi-employee loop to avoid N+1 queries.
 */
export interface TdsBatchData {
  fy: string;
  fyHistoryByEmployee: Map<string, { grossSoFar: number; tdsPaidSoFar: number }>;
  deductionsByEmployee: Map<string, DeclaredDeductions>;
}

export async function batchFetchTdsData(
  orgId: string,
  employeeIds: string[],
  currentPeriodStart: Date,
): Promise<TdsBatchData> {
  const fy = getFiscalYear(currentPeriodStart);
  const fyStart = fiscalYearStart(fy);

  const [payslips, priorRecords, proofs] = await Promise.all([
    prisma.payslip.findMany({
      where: {
        orgId,
        employeeId: { in: employeeIds },
        deletedAt: null,
        status: { in: ["Generated", "Released"] },
        periodStart: { gte: fyStart },
        periodEnd: { lt: currentPeriodStart },
      },
      include: { lines: { where: { category: "IncomeTax" } } },
    }),
    prisma.priorPayrollRecord.findMany({
      where: {
        orgId,
        employeeId: { in: employeeIds },
        financialYear: fy,
        deletedAt: null,
        periodEnd: { lt: currentPeriodStart },
      },
      select: { employeeId: true, grossEarnings: true, tds: true },
    }),
    prisma.investmentProof.findMany({
      where: {
        orgId,
        employeeId: { in: employeeIds },
        financialYear: fy,
        deletedAt: null,
        status: { in: ["Submitted", "UnderReview", "Approved", "PartiallyApproved"] },
      },
      select: { employeeId: true, section: true, declaredAmount: true, approvedAmount: true, status: true },
    }),
  ]);

  // Aggregate FY history (payslips + prior records) per employee
  const fyHistoryByEmployee = new Map<string, { grossSoFar: number; tdsPaidSoFar: number }>();
  const pushHistory = (empId: string, gross: number, tds: number) => {
    const existing = fyHistoryByEmployee.get(empId) ?? { grossSoFar: 0, tdsPaidSoFar: 0 };
    existing.grossSoFar += gross;
    existing.tdsPaidSoFar += tds;
    fyHistoryByEmployee.set(empId, existing);
  };
  for (const p of payslips) {
    let tds = 0;
    for (const l of p.lines) tds += Number(l.amount);
    pushHistory(p.employeeId, Number(p.grossEarnings), tds);
  }
  for (const r of priorRecords) {
    pushHistory(r.employeeId, Number(r.grossEarnings), Number(r.tds));
  }

  // Aggregate InvestmentProof by employee → section
  const deductionsByEmployee = new Map<string, DeclaredDeductions>();
  for (const p of proofs) {
    const totals = deductionsByEmployee.get(p.employeeId) ?? { ...EMPTY_DEDUCTIONS };
    const amount =
      p.status === "Approved" || p.status === "PartiallyApproved"
        ? Number(p.approvedAmount ?? p.declaredAmount)
        : Number(p.declaredAmount);
    const sec = p.section.toUpperCase().replace(/\s/g, "");
    if (sec.startsWith("80C")) totals.section80C += amount;
    else if (sec.startsWith("80D")) totals.section80D += amount;
    else if (sec.startsWith("80E")) totals.section80E += amount;
    else if (sec.startsWith("80G")) totals.section80G += amount;
    else if (sec.startsWith("80TTA")) totals.section80TTA += amount;
    else if (sec === "80CCD1B" || sec === "80CCD(1B)") totals.nps80CCD1B += amount;
    else if (sec.startsWith("24") || sec.startsWith("HOMELOAN")) totals.homeLoanInterest += amount;
    else if (sec === "HRA") totals.hraExemption += amount;
    else if (sec === "LTA") totals.ltaExemption += amount;
    deductionsByEmployee.set(p.employeeId, totals);
  }

  return { fy, fyHistoryByEmployee, deductionsByEmployee };
}

/**
 * Pure sync TDS calc — expects pre-fetched FY history + deductions.
 * Use after batchFetchTdsData() inside a per-employee loop.
 */
export function calculateMonthlyTdsSync(params: {
  currentMonthGross: number;
  periodStart: Date;
  regime: Regime;
  grossSoFar: number;
  tdsPaidSoFar: number;
  deductions: DeclaredDeductions;
}): {
  monthlyTds: number;
  projectedAnnualGross: number;
  annualTax: number;
  remainingMonths: number;
} {
  const { currentMonthGross, periodStart, regime, grossSoFar, tdsPaidSoFar, deductions } = params;

  const elapsed = monthsElapsedInFY(periodStart);
  const remainingMonths = Math.max(1, 12 - elapsed);
  const projectedAnnualGross = grossSoFar + currentMonthGross * remainingMonths;

  const breakup = computeAnnualTax({
    annualGrossSalary: projectedAnnualGross,
    regime,
    deductions,
  });

  const remainingTax = Math.max(0, breakup.totalTaxLiability - tdsPaidSoFar);
  const monthlyTds = Math.ceil(remainingTax / remainingMonths);

  return {
    monthlyTds,
    projectedAnnualGross,
    annualTax: breakup.totalTaxLiability,
    remainingMonths,
  };
}

/**
 * Get gross earnings and TDS already paid for an employee this FY
 * before the current pay period. Includes prior payroll bootstrap if available.
 */
export async function getEmployeeFYHistory(
  orgId: string,
  employeeId: string,
  currentPeriodStart: Date,
): Promise<{ grossSoFar: number; tdsPaidSoFar: number; fy: string }> {
  const fy = getFiscalYear(currentPeriodStart);
  const fyStart = fiscalYearStart(fy);

  const payslips = await prisma.payslip.findMany({
    where: {
      orgId,
      employeeId,
      deletedAt: null,
      status: { in: ["Generated", "Released"] },
      periodStart: { gte: fyStart },
      periodEnd: { lt: currentPeriodStart },
    },
    include: { lines: { where: { category: "IncomeTax" } } },
  });

  let grossSoFar = 0;
  let tdsPaidSoFar = 0;
  for (const p of payslips) {
    grossSoFar += Number(p.grossEarnings);
    for (const l of p.lines) tdsPaidSoFar += Number(l.amount);
  }

  const priorRecords = await prisma.priorPayrollRecord.findMany({
    where: {
      orgId,
      employeeId,
      financialYear: fy,
      deletedAt: null,
      periodEnd: { lt: currentPeriodStart },
    },
    select: { grossEarnings: true, tds: true },
  });
  for (const r of priorRecords) {
    grossSoFar += Number(r.grossEarnings);
    tdsPaidSoFar += Number(r.tds);
  }

  return { grossSoFar, tdsPaidSoFar, fy };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
