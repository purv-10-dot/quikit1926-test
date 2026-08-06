import { prisma } from "@/lib/prisma";
import { computeAnnualTax, getEmployeeDeductions, getEmployeeFYHistory, getFiscalYear } from "./payroll-tds";

const GRATUITY_TAX_EXEMPT_CAP = 2_000_000; // ₹20 Lakh per Payment of Gratuity Act
const LEAVE_ENCASH_EXEMPT_CAP = 2_500_000; // ₹25 Lakh per Section 10(10AA), non-govt
const GRATUITY_MIN_YEARS = 5;

/**
 * Compute gratuity per Payment of Gratuity Act 1972:
 *   gratuity = lastBasicDA × 15/26 × yearsOfService
 * Rounding rule: ≥6 months counts as 1 year.
 * Eligibility: ≥ 5 years of continuous service (relaxed for death/disability).
 */
export function computeGratuity(input: {
  monthlyBasicDA: number;
  dateOfJoining: Date;
  lastWorkingDate: Date;
  forceEligible?: boolean; // for death/disablement
}): { yearsOfService: number; computedAmount: number; eligible: boolean; taxExempt: number; taxable: number } {
  const startMs = input.dateOfJoining.getTime();
  const endMs = input.lastWorkingDate.getTime();
  const totalDays = Math.max(0, (endMs - startMs) / 86_400_000);
  const yearsRaw = totalDays / 365.25;
  const fullYears = Math.floor(yearsRaw);
  const fractionMonths = (yearsRaw - fullYears) * 12;
  const yearsOfService = fractionMonths >= 6 ? fullYears + 1 : fullYears;

  const eligible = input.forceEligible || yearsRaw >= GRATUITY_MIN_YEARS;
  if (!eligible) return { yearsOfService: yearsRaw, computedAmount: 0, eligible: false, taxExempt: 0, taxable: 0 };

  const computedAmount = Math.round((input.monthlyBasicDA * 15 * yearsOfService) / 26);
  const taxExempt = Math.min(computedAmount, GRATUITY_TAX_EXEMPT_CAP);
  const taxable = Math.max(0, computedAmount - taxExempt);
  return { yearsOfService, computedAmount, eligible: true, taxExempt, taxable };
}

/**
 * Compute leave encashment.
 *   amount = ((monthlyBasicDA / 30) × encashableDays)
 * Tax-exempt limit (Section 10(10AA)) for non-govt employees: ₹25 Lakh (cumulative across employers).
 */
async function computeLeaveEncashment(
  orgId: string,
  employeeId: string,
  options?: { onlyEncashableTypes?: boolean },
): Promise<{ encashableDays: number; perDayBasic: number; amount: number; balances: { leaveType: string; balance: number }[] }> {
  const year = new Date().getFullYear();
  const balances = await prisma.leaveBalance.findMany({
    where: { orgId, employeeId, year },
    include: { leaveType: { select: { name: true, code: true, isEncashable: true } } },
  });

  const today = new Date();
  const salary = await prisma.employeeSalary.findFirst({
    where: {
      orgId, employeeId, isActive: true, deletedAt: null,
      effectiveFrom: { lte: today },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
    },
    include: {
      structure: { include: { components: { include: { component: true } } } },
    },
  });
  if (!salary) return {
    encashableDays: 0,
    perDayBasic: 0,
    amount: 0,
    balances: balances.map((b) => {
      const available = Number(b.opening) + Number(b.accrued) + Number(b.adjusted) + Number(b.carriedForward) - Number(b.taken) - Number(b.encashed) - Number(b.lapsed);
      return { leaveType: b.leaveType.name, balance: Math.max(0, available) };
    }),
  };

  const monthlyCTC = Number(salary.ctc) / 12;
  let basicMonthly = 0;
  let daMonthly = 0;
  for (const sc of salary.structure?.components ?? []) {
    const cat = sc.component.category;
    const value = Number(sc.amountValue ?? 0);
    let amount = 0;
    if (sc.amountType === "Fixed") amount = value;
    else if (sc.amountType === "PercentOfCTC") amount = (monthlyCTC * value) / 100;
    if (cat === "Basic") basicMonthly = amount;
    if (cat === "DA") daMonthly = amount;
  }
  const basicDA = basicMonthly + daMonthly;
  const perDayBasic = basicDA / 30;

  const filtered = options?.onlyEncashableTypes
    ? balances.filter((b) => b.leaveType.isEncashable)
    : balances;
  const encashableDays = filtered.reduce((s, b) => {
    const available = Number(b.opening) + Number(b.accrued) + Number(b.adjusted) + Number(b.carriedForward) - Number(b.taken) - Number(b.encashed) - Number(b.lapsed);
    return s + Math.max(0, available);
  }, 0);
  const amount = Math.round(perDayBasic * encashableDays);

  return {
    encashableDays,
    perDayBasic: Math.round(perDayBasic * 100) / 100,
    amount,
    balances: balances.map((b) => {
      const available = Number(b.opening) + Number(b.accrued) + Number(b.adjusted) + Number(b.carriedForward) - Number(b.taken) - Number(b.encashed) - Number(b.lapsed);
      return { leaveType: b.leaveType.name, balance: Math.max(0, available) };
    }),
  };
}

interface FNFInput {
  orgId: string;
  employeeId: string;
  resignationDate: Date;
  lastWorkingDate: Date;
  reason?: string;
}

interface FNFComponents {
  pendingSalary: number;
  leaveEncashment: number;
  gratuityAmount: number;
  bonusAmount: number;
  noticePayRecovery: number;
  loanRecovery: number;
  otherEarnings: number;
  otherDeductions: number;
  tdsDeducted: number;
  netSettlement: number;
  details: Record<string, unknown>;
}

/**
 * Compute Full & Final settlement composite.
 * Pulls: pending salary days, leave encashment, gratuity, statutory bonus, loan outstanding.
 */
export async function computeFullAndFinal(input: FNFInput): Promise<FNFComponents> {
  const { orgId, employeeId, resignationDate, lastWorkingDate } = input;

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, orgId, deletedAt: null },
    select: { dateOfJoining: true, noticePeriodDays: true },
  });
  if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
  if (!employee.dateOfJoining) throw new Error("EMPLOYEE_MISSING_DOJ");

  const today = new Date();
  const salary = await prisma.employeeSalary.findFirst({
    where: {
      orgId, employeeId, isActive: true, deletedAt: null,
      effectiveFrom: { lte: today },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
    },
    include: { structure: { include: { components: { include: { component: true } } } } },
  });

  const monthlyCTC = salary ? Number(salary.ctc) / 12 : 0;
  let basicMonthly = 0;
  let daMonthly = 0;
  for (const sc of salary?.structure?.components ?? []) {
    const cat = sc.component.category;
    const value = Number(sc.amountValue ?? 0);
    let amount = 0;
    if (sc.amountType === "Fixed") amount = value;
    else if (sc.amountType === "PercentOfCTC") amount = (monthlyCTC * value) / 100;
    if (cat === "Basic") basicMonthly = amount;
    if (cat === "DA") daMonthly = amount;
  }
  const basicDA = basicMonthly + daMonthly;

  // Pending salary: days from last released payslip period end to lastWorkingDate
  const lastPayslip = await prisma.payslip.findFirst({
    where: { orgId, employeeId, deletedAt: null, status: "Released" },
    orderBy: { periodEnd: "desc" },
    select: { periodEnd: true },
  });
  const fromDate = lastPayslip ? new Date(lastPayslip.periodEnd.getTime() + 86_400_000) : employee.dateOfJoining;
  const pendingDays = Math.max(0, Math.floor((lastWorkingDate.getTime() - fromDate.getTime()) / 86_400_000) + 1);
  const perDayCTC = monthlyCTC / 30;
  const pendingSalary = Math.round(pendingDays * perDayCTC);

  // Leave encashment
  const enc = await computeLeaveEncashment(orgId, employeeId);

  // Gratuity
  const grat = computeGratuity({
    monthlyBasicDA: basicDA,
    dateOfJoining: employee.dateOfJoining,
    lastWorkingDate,
  });

  // Loan recovery: outstanding loans
  const loans = await prisma.employeeLoan.findMany({
    where: { orgId, employeeId, deletedAt: null, status: "Disbursed" },
    select: { outstandingAmount: true },
  });
  const loanRecovery = Math.round(loans.reduce((s, l) => s + Number(l.outstandingAmount), 0));

  // Statutory bonus pro-rated for current FY (provision)
  const bonusCfg = await prisma.statutoryBonusConfig.findUnique({ where: { orgId } });
  let bonusAmount = 0;
  if (bonusCfg?.enabled && basicMonthly > 0 && basicMonthly <= Number(bonusCfg.eligibilityWageCap)) {
    const calcCap = Number(bonusCfg.calculationWageCap);
    const minPercent = Number(bonusCfg.minPercent);
    const wage = Math.min(basicMonthly, calcCap);
    // Months since FY start (April)
    const fyStart = new Date(today.getFullYear(), 3, 1);
    const fyStartUsed = fyStart > today ? new Date(today.getFullYear() - 1, 3, 1) : fyStart;
    const monthsInFY = Math.max(0, (lastWorkingDate.getFullYear() - fyStartUsed.getFullYear()) * 12 + (lastWorkingDate.getMonth() - fyStartUsed.getMonth()) + 1);
    bonusAmount = Math.round(wage * monthsInFY * (minPercent / 100));
  }

  const otherEarnings = 0;
  const otherDeductions = 0;

  // ── Notice pay recovery: salary for the un-served notice period ──
  const company = await prisma.companySettings.findUnique({
    where: { orgId },
    select: { noticePeriodDays: true },
  });
  const requiredNoticeDays = employee.noticePeriodDays || company?.noticePeriodDays || 0;
  const servedNoticeDays = Math.max(0, Math.floor((lastWorkingDate.getTime() - resignationDate.getTime()) / 86_400_000) + 1);
  const shortfallDays = Math.max(0, requiredNoticeDays - servedNoticeDays);
  const noticePayRecovery = Math.round(shortfallDays * perDayCTC);

  // ── TDS on the settlement: marginal tax over what's already been deducted this FY ──
  // Estimate (HR can override). Gratuity (≤₹20L) and leave encashment (≤₹25L) are exempt.
  let tdsDeducted = 0;
  const tdsDetails: Record<string, unknown> = {};
  try {
    const fy = getFiscalYear(lastWorkingDate);
    const [history, deductions, claims] = await Promise.all([
      getEmployeeFYHistory(orgId, employeeId, lastWorkingDate),
      getEmployeeDeductions(orgId, employeeId, fy),
      prisma.claimsDeclarationSettings.findUnique({ where: { orgId }, select: { defaultRegime: true } }),
    ]);
    const regime = (claims?.defaultRegime ?? "NewRegime") as "OldRegime" | "NewRegime";
    const leaveEncashTaxable = Math.max(0, enc.amount - LEAVE_ENCASH_EXEMPT_CAP);
    const taxableSettlement = pendingSalary + bonusAmount + otherEarnings + grat.taxable + leaveEncashTaxable;
    const projectedAnnualGross = history.grossSoFar + taxableSettlement;
    const annualTax = computeAnnualTax({ annualGrossSalary: projectedAnnualGross, regime, deductions }).totalTaxLiability;
    tdsDeducted = Math.max(0, Math.round(annualTax - history.tdsPaidSoFar));
    Object.assign(tdsDetails, {
      fy, regime, estimated: true,
      grossSoFar: history.grossSoFar, tdsPaidSoFar: history.tdsPaidSoFar,
      taxableSettlement, projectedAnnualGross, annualTax,
    });
  } catch (err) {
    console.error("[FNF] TDS estimate failed:", err);
  }

  const grossOwed = pendingSalary + enc.amount + grat.computedAmount + bonusAmount + otherEarnings;
  const recoveries = noticePayRecovery + loanRecovery + otherDeductions + tdsDeducted;
  const netSettlement = grossOwed - recoveries;

  return {
    pendingSalary,
    leaveEncashment: enc.amount,
    gratuityAmount: grat.computedAmount,
    bonusAmount,
    noticePayRecovery,
    loanRecovery,
    otherEarnings,
    otherDeductions,
    tdsDeducted,
    netSettlement,
    details: {
      hasActiveSalary: !!salary,
      pendingDays,
      perDayCTC,
      basicMonthly,
      daMonthly,
      gratuity: grat,
      leaveEncashment: enc,
      loansCount: loans.length,
      noticePay: { requiredNoticeDays, servedNoticeDays, shortfallDays, perDayCTC },
      tds: tdsDetails,
    },
  };
}
