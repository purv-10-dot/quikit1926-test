import { prisma } from "@/lib/prisma";
import type { Prisma } from "@quikit/database";
import { computeEffectiveDays, getEmployeeLopDays } from "@/lib/services/payroll-attendance";
import { batchFetchTdsData, calculateMonthlyTdsSync, type Regime } from "@/lib/services/payroll-tds";

type AmountType = "Fixed" | "PercentOfBasic" | "PercentOfCTC" | "PercentOfGross" | "Formula";

interface ComponentCalcInput {
  code: string;
  name: string;
  type: "Earning" | "Deduction" | "Reimbursement" | "Benefit" | "StatutoryContribution";
  category: string;
  amountType: AmountType;
  amountValue: number;
  componentId: string;
  considerForEPF: boolean;
  considerEPFIfPFWageLT15k: boolean;
  considerForESI: boolean;
  proRateOnLOP: boolean;
  partOfSalaryStructure: boolean;
}

interface ComputedLine {
  componentId: string | null;
  componentCode: string;
  componentName: string;
  type: ComponentCalcInput["type"];
  category: string;
  amount: number;
  sortOrder: number;
}

interface ComputePayslipResult {
  employeeId: string;
  periodStart: Date;
  periodEnd: Date;
  workingDays: number;
  paidDays: number;
  lopDays: number;
  lines: ComputedLine[];
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  currency: string;
}

// Indian payroll constants
const EPF_WAGE_CEILING = 15000;
const EPS_PERCENT = 8.33;
const EPS_WAGE_CEILING = 15000;
const EPF_EMPLOYEE_PERCENT = 12;
const EPF_EMPLOYER_PERCENT = 12;
const ESI_GROSS_CEILING_DEFAULT = 21000;
const ESI_GROSS_CEILING_PWD = 25000;
const ESI_EMPLOYEE_PERCENT_DEFAULT = 0.75;
const ESI_EMPLOYER_PERCENT_DEFAULT = 3.25;
// MSJE scheme: Central Govt reimburses employer's ESI contribution for first
// 3 years from date of joining when the employee is a Person with Disability.
const PWD_EMPLOYER_REIMBURSEMENT_YEARS = 3;

function daysInMonth(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

function calcAmount(c: ComponentCalcInput, monthlyCTC: number, basicMonthly: number, grossMonthly: number): number {
  switch (c.amountType) {
    case "Fixed": return c.amountValue;
    case "PercentOfCTC": return (monthlyCTC * c.amountValue) / 100;
    case "PercentOfBasic": return (basicMonthly * c.amountValue) / 100;
    case "PercentOfGross": return (grossMonthly * c.amountValue) / 100;
    default: return 0;
  }
}

export async function computePayslipsForRun(
  orgId: string,
  payRunId: string,
): Promise<{ payslips: ComputePayslipResult[]; totalGross: number; totalNet: number; totalDeductions: number; }> {
  const payRun = await prisma.payRun.findFirst({ where: { id: payRunId, orgId, deletedAt: null } });
  if (!payRun) throw new Error("Pay run not found");

  const [activeSalaries, epf, esi, ptConfigs, lwfConfigs, activeLoans, paySchedule, claimsSettings] = await Promise.all([
    prisma.employeeSalary.findMany({
      where: {
        orgId, deletedAt: null, isActive: true,
        effectiveFrom: { lte: payRun.periodEnd },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: payRun.periodStart } }],
      },
      include: {
        structure: {
          include: {
            components: {
              include: { component: true },
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
    }),
    prisma.ePFConfig.findFirst({
      where: {
        orgId,
        OR: [
          { effectiveFrom: null, effectiveTo: null },
          { effectiveFrom: { lte: payRun.periodStart }, effectiveTo: null },
          { effectiveFrom: null, effectiveTo: { gte: payRun.periodEnd } },
          { effectiveFrom: { lte: payRun.periodStart }, effectiveTo: { gte: payRun.periodEnd } },
        ],
      },
      orderBy: { effectiveFrom: "desc" },
    }),
    prisma.eSIConfig.findFirst({
      where: {
        orgId,
        OR: [
          { effectiveFrom: null, effectiveTo: null },
          { effectiveFrom: { lte: payRun.periodStart }, effectiveTo: null },
          { effectiveFrom: null, effectiveTo: { gte: payRun.periodEnd } },
          { effectiveFrom: { lte: payRun.periodStart }, effectiveTo: { gte: payRun.periodEnd } },
        ],
      },
      orderBy: { effectiveFrom: "desc" },
    }),
    prisma.professionalTaxConfig.findMany({
      where: {
        orgId, enabled: true,
        OR: [
          { effectiveFrom: null, effectiveTo: null },
          { effectiveFrom: { lte: payRun.periodStart }, effectiveTo: null },
          { effectiveFrom: null, effectiveTo: { gte: payRun.periodEnd } },
          { effectiveFrom: { lte: payRun.periodStart }, effectiveTo: { gte: payRun.periodEnd } },
        ],
      },
    }),
    prisma.lWFConfig.findMany({ where: { orgId, enabled: true } }),
    prisma.employeeLoan.findMany({
      where: {
        orgId, deletedAt: null, status: "Disbursed",
        outstandingAmount: { gt: 0 },
        startDate: { lte: payRun.periodEnd },
        // Skip loans on hold for this period; they auto-resume once holdUntil passes.
        OR: [{ holdUntil: null }, { holdUntil: { lt: payRun.periodEnd } }],
      },
      select: { id: true, employeeId: true, emiAmount: true, outstandingAmount: true, emisPaid: true, tenureMonths: true },
    }),
    prisma.paySchedule.findUnique({ where: { orgId } }),
    prisma.claimsDeclarationSettings.findUnique({ where: { orgId } }),
  ]);

  const bonusConfig = await prisma.statutoryBonusConfig.findUnique({ where: { orgId } });

  // Pre-load state minimum wages for bonus calc cap derivation.
  // Lookup picks latest record per state where effectiveFrom ≤ payRun.periodStart.
  const stateMinWageRows = await prisma.stateMinimumWage.findMany({
    where: { orgId, effectiveFrom: { lte: payRun.periodStart } },
    orderBy: { effectiveFrom: "desc" },
    select: { state: true, monthlyWage: true, effectiveFrom: true },
  });
  const stateMinWageByState = new Map<string, number>();
  for (const row of stateMinWageRows) {
    const key = row.state;
    if (!stateMinWageByState.has(key)) {
      stateMinWageByState.set(key, Number(row.monthlyWage));
    }
  }

  // Approved one-time earnings landing in this pay period
  const oneTimeEarnings = await prisma.oneTimeEarning.findMany({
    where: {
      orgId,
      deletedAt: null,
      status: "Approved",
      payPeriod: { gte: payRun.periodStart, lte: payRun.periodEnd },
    },
  });
  const oneTimeByEmployee = new Map<string, typeof oneTimeEarnings>();
  for (const o of oneTimeEarnings) {
    const arr = oneTimeByEmployee.get(o.employeeId) ?? [];
    arr.push(o);
    oneTimeByEmployee.set(o.employeeId, arr);
  }

  const defaultRegime: Regime = claimsSettings?.defaultRegime ?? "NewRegime";

  const loansByEmployee = new Map<string, typeof activeLoans>();
  for (const l of activeLoans) {
    const arr = loansByEmployee.get(l.employeeId) ?? [];
    arr.push(l);
    loansByEmployee.set(l.employeeId, arr);
  }

  const employeeIds = activeSalaries.map((s) => s.employeeId);
  const allEmployees = await prisma.employee.findMany({
    where: { id: { in: employeeIds }, orgId, deletedAt: null },
    select: {
      id: true,
      gender: true,
      dateOfJoining: true,
      lastWorkingDate: true,
      status: true,
      legalEntityId: true,
      payFrequencyOverride: true,
      isHandicapped: true,
      epfApplicable: true,
      esiApplicable: true,
      ptApplicable: true,
      epfContributionRate: true,
      officeLocation: { select: { id: true, state: true } },
    },
  });

  // Filter by legal entity if pay run is entity-scoped
  const employees = payRun.legalEntityId
    ? allEmployees.filter((e) => e.legalEntityId === payRun.legalEntityId)
    : allEmployees;

  // Filter by pay frequency: include employees whose effective frequency matches run
  const runFreq = payRun.payFrequency ?? "Monthly";
  const tenantDefaultFreq = paySchedule?.payFrequency ?? "Monthly";
  const employeesByFreq = employees.filter((e) => {
    const empFreq = e.payFrequencyOverride ?? tenantDefaultFreq;
    return empFreq === runFreq;
  });

  const empById = new Map(employeesByFreq.map((e) => [e.id, e]));

  const calendarDays = daysInMonth(new Date(payRun.periodStart), new Date(payRun.periodEnd));
  const workingDays =
    paySchedule?.salaryCalcBasis === "OrganisationWorkingDays" && paySchedule?.orgWorkingDays
      ? paySchedule.orgWorkingDays
      : calendarDays;

  const lopByEmployee = await getEmployeeLopDays(
    orgId,
    new Date(payRun.periodStart),
    new Date(payRun.periodEnd),
    employeeIds,
  );

  // HR-side manual overrides for paid days (PayRunAdjustment). These survive
  // recompute, so any value set here wins over the attendance-derived LOP.
  const adjustments = await prisma.payRunAdjustment.findMany({
    where: { orgId, payRunId, deletedAt: null, paidDaysOverride: { not: null } },
    select: { employeeId: true, paidDaysOverride: true },
  });
  const paidDaysOverrideByEmployee = new Map<string, number>();
  for (const a of adjustments) {
    if (a.paidDaysOverride != null) paidDaysOverrideByEmployee.set(a.employeeId, Number(a.paidDaysOverride));
  }

  // HR-side TDS overrides + recovery plans. Two effects per employee:
  //   1. If an override exists for THIS period (setOnPeriod == run.periodStart) →
  //      use overrideTds instead of computed TDS.
  //   2. If any prior override's recovery window covers THIS period →
  //      add perMonthAmount on top of computed TDS.
  // The natural FY-spread compute is neutralized by adding the unrecovered
  // shortfall back into tdsPaidSoFar (so the natural compute stays unaffected
  // and only our explicit recovery applies).
  const runPeriodStart = new Date(payRun.periodStart);
  const runPeriodStartMs = runPeriodStart.getTime();
  const currentFy = (() => {
    const y = runPeriodStart.getFullYear();
    const m = runPeriodStart.getMonth(); // 0=Jan
    return m >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  })();

  const tdsOverrides = await prisma.tdsOverride.findMany({
    where: {
      orgId,
      deletedAt: null,
      status: "Active",
      fy: currentFy,
      employeeId: { in: employeeIds },
    },
    select: {
      employeeId: true, setOnPeriod: true, originalTds: true, overrideTds: true,
      shortfall: true, perMonthAmount: true, recoveryStart: true, recoveryEnd: true,
    },
  });
  const tdsOverridesByEmployee = new Map<string, typeof tdsOverrides>();
  for (const o of tdsOverrides) {
    const arr = tdsOverridesByEmployee.get(o.employeeId) ?? [];
    arr.push(o);
    tdsOverridesByEmployee.set(o.employeeId, arr);
  }

  // --- Batch fetch TDS history + deductions for all employees (P1 perf fix) ---
  const tdsBatch = await batchFetchTdsData(
    orgId,
    employeeIds,
    new Date(payRun.periodStart),
  );

  // --- Batch fetch salaries at ESI contribution-period start for carry-over check ---
  const periodStartMonth = payRun.periodStart.getMonth();
  const periodStartYear = payRun.periodStart.getFullYear();
  const cpStart =
    periodStartMonth >= 3 && periodStartMonth <= 8
      ? new Date(periodStartYear, 3, 1)
      : periodStartMonth >= 9
        ? new Date(periodStartYear, 9, 1)
        : new Date(periodStartYear - 1, 9, 1);

  const cpSalaryRows = await prisma.employeeSalary.findMany({
    where: {
      orgId,
      employeeId: { in: employeeIds },
      deletedAt: null,
      effectiveFrom: { lte: cpStart },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: cpStart } }],
    },
    select: { employeeId: true, ctc: true, effectiveFrom: true },
    orderBy: { effectiveFrom: "desc" },
  });
  const cpSalaryByEmployee = new Map<string, number>();
  for (const row of cpSalaryRows) {
    if (!cpSalaryByEmployee.has(row.employeeId)) {
      cpSalaryByEmployee.set(row.employeeId, Number(row.ctc) / 12);
    }
  }

  const payslips: ComputePayslipResult[] = [];

  for (const sal of activeSalaries) {
    if (!sal.structure) continue;
    const employee = empById.get(sal.employeeId);
    if (!employee) continue;

    if (employee.dateOfJoining && employee.dateOfJoining > payRun.periodEnd) continue;
    if (employee.lastWorkingDate && employee.lastWorkingDate < payRun.periodStart) continue;

    const monthlyCTC = Number(sal.ctc) / 12;

    const rawLop = lopByEmployee.get(sal.employeeId) ?? 0;
    const eff = computeEffectiveDays({
      periodStart: new Date(payRun.periodStart),
      periodEnd: new Date(payRun.periodEnd),
      workingDays,
      dateOfJoining: employee?.dateOfJoining ?? null,
      lastWorkingDate: employee?.lastWorkingDate ?? null,
      lopDays: rawLop,
    });
    // HR override wins when present — clamped to [0, workingDays].
    // lopDays is derived as (workingDays - paidDays) for downstream pro-rating.
    const override = paidDaysOverrideByEmployee.get(sal.employeeId);
    const paidDays = override != null
      ? Math.max(0, Math.min(workingDays, override))
      : eff.paidDays;
    const lopDays = override != null
      ? Math.max(0, Math.round((workingDays - paidDays) * 100) / 100)
      : eff.lopDays;
    const proRatio = workingDays > 0 ? paidDays / workingDays : 0;

    const rawComps: ComponentCalcInput[] = sal.structure.components.map((sc) => ({
      code: sc.component.code,
      name: sc.component.nameInPayslip || sc.component.name,
      type: sc.component.type,
      category: sc.component.category,
      amountType: sc.amountType as AmountType,
      amountValue: Number(sc.amountValue ?? 0),
      componentId: sc.componentId,
      considerForEPF: sc.component.considerForEPF,
      considerEPFIfPFWageLT15k: sc.component.considerEPFIfPFWageLT15k,
      considerForESI: sc.component.considerForESI,
      proRateOnLOP: sc.component.proRateOnLOP,
      partOfSalaryStructure: sc.component.partOfSalaryStructure,
    }));

    // Step 1: calc Basic first
    const basicComp = rawComps.find((c) => c.category === "Basic");
    const basicMonthly = basicComp ? calcAmount(basicComp, monthlyCTC, 0, 0) : 0;

    // Step 2: calc other earnings (except Fixed Allowance placeholder)
    let earnings: ComputedLine[] = [];
    let totalKnownEarningsMonthly = 0;
    rawComps.forEach((c, idx) => {
      if (c.type !== "Earning") return;
      if (c.category === "FixedAllowance") return; // handle as residual
      const amount = calcAmount(c, monthlyCTC, basicMonthly, 0);
      const prorated = c.proRateOnLOP ? amount * proRatio : amount;
      totalKnownEarningsMonthly += prorated;
      earnings.push({
        componentId: c.componentId,
        componentCode: c.code,
        componentName: c.name,
        type: c.type,
        category: c.category,
        amount: round2(prorated),
        sortOrder: idx,
      });
    });

    // Residual fixed allowance
    const fixedAllowancePreset = rawComps.find((c) => c.category === "FixedAllowance");
    const fixedAllowanceMonthly = Math.max(0, monthlyCTC - totalKnownEarningsMonthly);
    if (fixedAllowancePreset || fixedAllowanceMonthly > 0) {
      earnings.push({
        componentId: fixedAllowancePreset?.componentId ?? null,
        componentCode: fixedAllowancePreset?.code ?? "FIXED_ALLOWANCE",
        componentName: fixedAllowancePreset?.name ?? "Fixed Allowance",
        type: "Earning",
        category: "FixedAllowance",
        amount: round2(fixedAllowanceMonthly * proRatio),
        sortOrder: 999,
      });
    }

    // Step 2b: Approved one-time entries (Bonus / Arrears / Incentive / Deduction)
    // Earnings go into the earnings[] array. Kind === "Deduction" entries are
    // held aside and pushed to deductions[] after Step 4 (so the deductions
    // array exists). One-time totals only sum earnings — deductions reduce
    // net pay via the deductions[] aggregate later.
    const oneTimes = oneTimeByEmployee.get(sal.employeeId) ?? [];
    const oneTimeDeductionLines: ComputedLine[] = [];
    let oneTimeTotal = 0;
    let oneTimeEpfWage = 0;
    let oneTimeEsiAdd = 0;
    let oneTimePtAdd = 0;
    oneTimes.forEach((o, idx) => {
      const amt = round2(Number(o.amount));
      if (amt <= 0) return;
      if (o.kind === "Deduction") {
        oneTimeDeductionLines.push({
          componentId: null,
          componentCode: o.componentCode,
          componentName: o.componentName,
          type: "Deduction",
          category: o.category as ComputedLine["category"],
          amount: amt,
          sortOrder: 850 + idx,
        });
        return;
      }
      earnings.push({
        componentId: null,
        componentCode: o.componentCode,
        componentName: o.componentName,
        type: "Earning",
        category: o.category as ComputedLine["category"],
        amount: amt,
        sortOrder: 800 + idx,
      });
      oneTimeTotal += amt;
      if (o.considerForEPF) oneTimeEpfWage += amt;
      if (o.considerForESI) oneTimeEsiAdd += amt;
      if (o.considerForPT) oneTimePtAdd += amt;
    });

    const grossEarnings = earnings.reduce((s, l) => s + l.amount, 0);

    // Step 3: EPF calc
    const deductions: ComputedLine[] = [];
    const employerContribs: ComputedLine[] = [];
    if (epf?.enabled && employee?.epfApplicable !== false) {
      // Base PF wage = earnings flagged considerForEPF, EXCLUDING ones that only kick in when wage < 15k
      const baseEarnings = earnings.filter((e) => {
        const raw = rawComps.find((c) => c.componentId === e.componentId);
        if (!raw) return e.category === "Basic" || e.category === "DA";
        return raw.considerForEPF && !raw.considerEPFIfPFWageLT15k;
      });
      let pfWageStructured = baseEarnings.reduce((s, e) => s + e.amount, 0);

      // If "consider all applicable components when PF wage < 15k after LOP" is on,
      // add the gap-filler components flagged considerEPFIfPFWageLT15k
      if (epf.considerAllComponentsOnLOP && pfWageStructured < EPF_WAGE_CEILING) {
        const fillerEarnings = earnings.filter((e) => {
          const raw = rawComps.find((c) => c.componentId === e.componentId);
          return !!(raw?.considerForEPF && raw?.considerEPFIfPFWageLT15k);
        });
        pfWageStructured += fillerEarnings.reduce((s, e) => s + e.amount, 0);
      }

      const pfWage = pfWageStructured + oneTimeEpfWage;

      // Pro-rate the restricted (₹15k) wage ceiling on LOP if config flag set
      const ceiling =
        epf.proRateRestrictedWage && lopDays > 0
          ? round2(EPF_WAGE_CEILING * proRatio)
          : EPF_WAGE_CEILING;
      const restrictedPFWage = Math.min(pfWage, ceiling);

      // Per-employee EPF override (when allowOverrideAtEmployee + employee.epfContributionRate set).
      // Per EPF Act, employer share follows employee's chosen rate.
      const employeeRate = (epf.allowOverrideAtEmployee && employee?.epfContributionRate)
        ? employee.epfContributionRate
        : epf.employeeContributionRate;
      const employerRate = (epf.allowOverrideAtEmployee && employee?.epfContributionRate)
        ? employee.epfContributionRate
        : epf.employerContributionRate;

      const useWage =
        employeeRate === "TwelvePercentRestricted" ? restrictedPFWage : pfWage;

      const employeeEPF = round2((useWage * EPF_EMPLOYEE_PERCENT) / 100);
      const employerUse =
        employerRate === "TwelvePercentRestricted" ? restrictedPFWage : pfWage;
      const epsCeiling = epf.proRateRestrictedWage && lopDays > 0
        ? round2(EPS_WAGE_CEILING * proRatio)
        : EPS_WAGE_CEILING;
      const eps = round2((Math.min(employerUse, epsCeiling) * EPS_PERCENT) / 100);
      const employerEPF = round2((employerUse * EPF_EMPLOYER_PERCENT) / 100 - eps);

      if (employeeEPF > 0) deductions.push(line("EPF_EMP", "EPF (Employee)", "StatutoryContribution", "EPFEmployee", employeeEPF, 100));
      if (employerEPF + eps > 0) employerContribs.push(line("EPF_ER", "EPF (Employer)", "StatutoryContribution", "EPFEmployer", round2(employerEPF + eps), 101));

      // EDLI (employer): 0.5% of restricted PF wage, capped at ₹15k base → max ₹75/month
      const edli = round2((Math.min(pfWage, EPF_WAGE_CEILING) * 0.5) / 100);
      if (edli > 0) employerContribs.push(line("EDLI_ER", "EDLI (Employer)", "StatutoryContribution", "EPFEmployer", edli, 102));

      // PF Admin Charges (employer): 0.5% of PF wage, minimum ₹75/month per active member
      if (pfWage > 0) {
        const admin = Math.max(round2((pfWage * 0.5) / 100), 75);
        employerContribs.push(line("EPF_ADMIN", "EPF Admin Charges", "StatutoryContribution", "EPFEmployer", admin, 103));
      }
    }

    // Step 4: ESI calc — with contribution-period carry-over.
    // One-time earnings flagged considerForESI=false are excluded from ESI wage base.
    // PwD employees: higher wage ceiling (₹25,000); employee + employer share both
    // computed normally. Govt-reimbursement of employer share for first 3 years from
    // DOJ is handled outside compute (separate ledger/report — not netted off here).
    // Senior citizen flag has NO effect on ESI under Indian law.
    const esiBase = grossEarnings - (oneTimeTotal - oneTimeEsiAdd);
    if (esi?.enabled && employee?.esiApplicable !== false) {
      const baseCeiling = Number(esi.grossCeiling ?? ESI_GROSS_CEILING_DEFAULT);
      const ceiling = employee?.isHandicapped
        ? Math.max(baseCeiling, ESI_GROSS_CEILING_PWD)
        : baseCeiling;

      let esiEligible = grossEarnings <= ceiling;

      // Carry-over: if employee was eligible at start of current contribution period
      // (Apr 1 or Oct 1), they must continue till period end even if crossed ceiling.
      if (!esiEligible) {
        const monthlyCtcAtCpStart = cpSalaryByEmployee.get(sal.employeeId);
        if (monthlyCtcAtCpStart != null && monthlyCtcAtCpStart <= ceiling) {
          esiEligible = true;
        }
      }

      if (esiEligible) {
        // Statutory rates — locked per ESI Act, w.e.f. 01-Jul-2019. Stored config ignored.
        const employeeESI = round2((esiBase * ESI_EMPLOYEE_PERCENT_DEFAULT) / 100);
        const employerESI = round2((esiBase * ESI_EMPLOYER_PERCENT_DEFAULT) / 100);

        // PwD MSJE reimbursement window: first 3 years from DOJ. Employer still
        // contributes to ESIC; the amount is reimbursed by the Central Government.
        const pwdReimbursable =
          !!employee?.isHandicapped &&
          !!employee?.dateOfJoining &&
          payRun.periodEnd.getTime() <
            new Date(employee.dateOfJoining).setFullYear(
              new Date(employee.dateOfJoining).getFullYear() + PWD_EMPLOYER_REIMBURSEMENT_YEARS,
            );

        if (employeeESI > 0) deductions.push(line("ESI_EMP", "ESI (Employee)", "StatutoryContribution", "ESIEmployee", employeeESI, 110));
        if (employerESI > 0) {
          const erLabel = pwdReimbursable
            ? "ESI (Employer) — Govt Reimbursable (PwD)"
            : "ESI (Employer)";
          employerContribs.push(line("ESI_ER", erLabel, "StatutoryContribution", "ESIEmployer", employerESI, 111));
        }
      }
    }

    // Step 5: Professional Tax
    // One-time earnings flagged considerForPT=false are excluded from PT wage base
    const ptBase = grossEarnings - (oneTimeTotal - oneTimePtAdd);
    const empState = employee?.officeLocation?.state;
    if (empState && employee?.ptApplicable !== false) {
      const pt = ptConfigs.find((p) => p.state === empState);
      if (pt?.enabled) {
        const slabs = (pt.slabs as unknown as { fromAmount: number; toAmount: number | null; taxAmount: number; gender: "All" | "Male" | "Female" }[]) || [];
        const genderKey = employee?.gender === "Female" ? "Female" : employee?.gender === "Male" ? "Male" : "All";
        const applicable = slabs.find(
          (s) =>
            (s.gender === "All" || s.gender === genderKey) &&
            ptBase >= s.fromAmount &&
            (s.toAmount == null || grossEarnings <= s.toAmount),
        );
        if (applicable && applicable.taxAmount > 0) {
          deductions.push(line("PT", "Professional Tax", "Deduction", "ProfessionalTax", round2(applicable.taxAmount), 120));
        }
      }
    }

    // Step 6: LWF — gated by deductionCycle. Supports flat ₹ or % of wage with cap.
    if (empState) {
      const lwf = lwfConfigs.find((l) => l.state === empState);
      if (lwf?.enabled && shouldDeductLwf(lwf.deductionCycle, payRun.periodStart)) {
        let employeeContrib = 0;
        let employerContrib = 0;
        if (lwf.calcType === "PercentOfWage") {
          const empRate = Number(lwf.employeeRate ?? 0);
          const erRate = Number(lwf.employerRate ?? 0);
          const empCap = Number(lwf.employeeCap ?? 0);
          const erCap = Number(lwf.employerCap ?? 0);
          employeeContrib = Math.min((grossEarnings * empRate) / 100, empCap);
          employerContrib = Math.min((grossEarnings * erRate) / 100, erCap);
        } else {
          employeeContrib = Number(lwf.employeeContribution);
          employerContrib = Number(lwf.employerContribution);
        }
        if (employeeContrib > 0) {
          deductions.push(line("LWF_EMP", "Labour Welfare Fund", "Deduction", "LabourWelfareFund", round2(employeeContrib), 130));
        }
        if (employerContrib > 0) {
          employerContribs.push(line("LWF_ER", "LWF (Employer)", "StatutoryContribution", "LabourWelfareFund", round2(employerContrib), 131));
        }
      }
    }

    // Step 6a: Statutory Bonus — monthly provision at minimum 8.33% (employer cost).
    // Per Code on Wages, 2019: base = Basic + DA, eligibility ≤ ₹21k.
    // Calculation cap = max(tenant calc cap, state minimum wage for employee's state).
    // Min/max % locked by statute (8.33% / 20%); employer may pay above min via separate one-time earning.
    const STATUTORY_BONUS_MIN_PERCENT = 8.33;
    if (bonusConfig?.enabled && basicMonthly > 0) {
      const daComp = rawComps.find((c) => c.category === "DA");
      const daMonthly = daComp ? calcAmount(daComp, monthlyCTC, basicMonthly, 0) : 0;
      const bonusBaseMonthly = basicMonthly + daMonthly;

      const eligibilityCap = Number(bonusConfig.eligibilityWageCap);
      if (bonusBaseMonthly <= eligibilityCap) {
        const tenantCalcCap = Number(bonusConfig.calculationWageCap);
        const stateMinWage = empState ? (stateMinWageByState.get(empState) ?? 0) : 0;
        const effectiveCalcCap = Math.max(tenantCalcCap, stateMinWage);
        const calculationWage = Math.min(bonusBaseMonthly, effectiveCalcCap);
        const monthlyProvision = round2((calculationWage * STATUTORY_BONUS_MIN_PERCENT) / 100);
        if (monthlyProvision > 0) {
          const label = stateMinWage > tenantCalcCap
            ? `Statutory Bonus (Provision — ${empState} min wage)`
            : "Statutory Bonus (Provision)";
          employerContribs.push(line("BONUS", label, "StatutoryContribution", "Bonus", monthlyProvision, 132));
        }
      }
    }

    // Step 6b: TDS (income tax) — projected over FY, spread across remaining months
    if (grossEarnings > 0) {
      const history = tdsBatch.fyHistoryByEmployee.get(sal.employeeId) ?? { grossSoFar: 0, tdsPaidSoFar: 0 };
      const deductionsDeclared = tdsBatch.deductionsByEmployee.get(sal.employeeId) ?? {
        section80C: 0, section80D: 0, section80E: 0, section80G: 0, section80TTA: 0,
        nps80CCD1B: 0, homeLoanInterest: 0, hraExemption: 0, ltaExemption: 0, otherIncome: 0,
      };

      // HR overrides for this employee in current FY
      const empOverrides = tdsOverridesByEmployee.get(sal.employeeId) ?? [];
      const priorOverrides = empOverrides.filter((o) => o.setOnPeriod.getTime() < runPeriodStartMs);
      const currentOverride = empOverrides.find((o) => o.setOnPeriod.getTime() === runPeriodStartMs);

      // Neutralize the natural FY-spread for prior shortfalls: pretend the
      // ideal amount was paid. Recovery is applied explicitly below.
      const restoredTdsPaidSoFar = priorOverrides.reduce(
        (sum, o) => sum + Number(o.shortfall),
        history.tdsPaidSoFar,
      );

      const tds = calculateMonthlyTdsSync({
        currentMonthGross: grossEarnings,
        periodStart: runPeriodStart,
        regime: defaultRegime,
        grossSoFar: history.grossSoFar,
        tdsPaidSoFar: restoredTdsPaidSoFar,
        deductions: deductionsDeclared,
      });
      const baseTds = currentOverride
        ? Number(currentOverride.overrideTds)
        : tds.monthlyTds;

      // Recovery from earlier overrides whose window includes this period
      let recoveryTds = 0;
      for (const o of priorOverrides) {
        if (o.recoveryStart.getTime() <= runPeriodStartMs && runPeriodStartMs <= o.recoveryEnd.getTime()) {
          recoveryTds += Number(o.perMonthAmount);
        }
      }

      const monthlyTds = Math.max(0, round2(baseTds + recoveryTds));

      if (monthlyTds > 0) {
        deductions.push(line("TDS", "Income Tax (TDS)", "Deduction", "IncomeTax", monthlyTds, 135));
      }
    }

    // Step 7: Loan EMIs
    const empLoans = loansByEmployee.get(sal.employeeId) ?? [];
    for (const loan of empLoans) {
      const outstanding = Number(loan.outstandingAmount);
      if (outstanding <= 0) continue;
      const emi = Math.min(Number(loan.emiAmount), outstanding);
      if (emi > 0) {
        deductions.push(line(`LOAN_${loan.id.slice(-6)}`, "Loan EMI", "Deduction", "LoanDeduction", round2(emi), 140));
      }
    }

    // Approved one-time deductions (Step 2b set these aside).
    // Sorted after all statutory + loan deductions for predictable payslip order.
    for (const dLine of oneTimeDeductionLines) {
      deductions.push(dLine);
    }

    const totalDeductions = deductions.reduce((s, l) => s + l.amount, 0);
    const netPay = round2(grossEarnings - totalDeductions);

    payslips.push({
      employeeId: sal.employeeId,
      periodStart: new Date(payRun.periodStart),
      periodEnd: new Date(payRun.periodEnd),
      workingDays,
      paidDays,
      lopDays,
      grossEarnings: round2(grossEarnings),
      totalDeductions: round2(totalDeductions),
      netPay,
      currency: sal.currency ?? "INR",
      lines: [...earnings, ...deductions, ...employerContribs],
    });
  }

  const totalGross = payslips.reduce((s, p) => s + p.grossEarnings, 0);
  const totalNet = payslips.reduce((s, p) => s + p.netPay, 0);
  const totalDeductions = payslips.reduce((s, p) => s + p.totalDeductions, 0);

  return { payslips, totalGross: round2(totalGross), totalNet: round2(totalNet), totalDeductions: round2(totalDeductions) };
}

export async function persistComputedPayslips(
  orgId: string,
  payRunId: string,
  result: Awaited<ReturnType<typeof computePayslipsForRun>>,
  userId: string,
) {
  await prisma.$transaction(async (tx) => {
    // Wipe existing payslips for this run
    const existing = await tx.payslip.findMany({ where: { payRunId, orgId }, select: { id: true } });
    const ids = existing.map((e) => e.id);
    if (ids.length) {
      await tx.payslipLine.deleteMany({ where: { payslipId: { in: ids } } });
      await tx.payslip.deleteMany({ where: { id: { in: ids } } });
    }

    for (const p of result.payslips) {
      const payslip = await tx.payslip.create({
        data: {
          orgId,
          payRunId,
          employeeId: p.employeeId,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          workingDays: p.workingDays,
          paidDays: p.paidDays,
          lopDays: p.lopDays,
          grossEarnings: p.grossEarnings,
          totalDeductions: p.totalDeductions,
          netPay: p.netPay,
          currency: p.currency,
          status: "Generated",
          createdBy: userId,
          updatedBy: userId,
        },
      });
      if (p.lines.length) {
        await tx.payslipLine.createMany({
          data: p.lines.map((l) => ({
            orgId,
            payslipId: payslip.id,
            componentId: l.componentId,
            componentCode: l.componentCode,
            componentName: l.componentName,
            type: l.type as Prisma.PayslipLineCreateManyInput["type"],
            category: l.category as Prisma.PayslipLineCreateManyInput["category"],
            amount: l.amount,
            sortOrder: l.sortOrder,
          })),
        });
      }
    }

    await tx.payRun.update({
      where: { id: payRunId },
      data: {
        employeeCount: result.payslips.length,
        totalGross: result.totalGross,
        totalNet: result.totalNet,
        totalDeductions: result.totalDeductions,
        status: "Processing",
        processedAt: new Date(),
        updatedBy: userId,
      },
    });
  });

  // Mark approved one-time earnings consumed by this run as Applied, and
  // close the lifecycle on any reimbursement claims they originated from.
  const run = await prisma.payRun.findFirst({ where: { id: payRunId, orgId, deletedAt: null } });
  if (run) {
    const window = {
      orgId,
      deletedAt: null,
      status: "Approved" as const,
      payPeriod: { gte: run.periodStart, lte: run.periodEnd },
    };

    // Grab the source claim ids BEFORE flipping status, so we know which
    // reimbursement claims this run just paid out.
    const consumed = await prisma.oneTimeEarning.findMany({
      where: window,
      select: { id: true, sourceReimbursementClaimId: true },
    });
    const claimIds = consumed
      .map((o) => o.sourceReimbursementClaimId)
      .filter((x): x is string => !!x);

    await prisma.oneTimeEarning.updateMany({
      where: window,
      data: { status: "Applied", appliedAt: new Date(), updatedBy: userId },
    });

    // Reimbursement lifecycle: Approved → Paid once the money actually rides
    // a payslip. Records the pay run + timestamp so HR can see "paid in run X".
    if (claimIds.length > 0) {
      await prisma.reimbursementClaim.updateMany({
        where: { orgId, deletedAt: null, id: { in: claimIds }, status: "Approved" },
        data: { status: "Paid", paidAt: new Date(), payRunId, updatedBy: userId },
      });
    }
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function shouldDeductLwf(cycle: string, periodStart: Date): boolean {
  const month = periodStart.getMonth(); // 0-indexed, 0=Jan
  switch (cycle) {
    case "Monthly":
      return true;
    case "Quarterly":
      // Deduct in March (0 = Jan? no — quarter ends Mar/Jun/Sep/Dec → deduct at quarter end)
      return month === 2 || month === 5 || month === 8 || month === 11;
    case "HalfYearly":
      // Deduct in June and December (half-year close months)
      return month === 5 || month === 11;
    case "Yearly":
      // Deduct in December by default (calendar year close)
      return month === 11;
    default:
      return false;
  }
}

function line(
  code: string,
  name: string,
  type: "Earning" | "Deduction" | "StatutoryContribution",
  category: string,
  amount: number,
  sortOrder: number,
): ComputedLine {
  return { componentId: null, componentCode: code, componentName: name, type, category, amount, sortOrder };
}
