import { prisma } from "@/lib/prisma";

export async function getOrCreatePayrollSettings(orgId: string, userId: string) {
  const existing = await prisma.payrollSettings.findUnique({ where: { orgId } });
  if (existing) return existing;
  return prisma.payrollSettings.create({
    data: { orgId, createdBy: userId, updatedBy: userId },
  });
}

type StepField =
  | "orgDetailsCompleted"
  | "taxDetailsCompleted"
  | "payScheduleCompleted"
  | "statutoryComponentsCompleted"
  | "salaryComponentsCompleted"
  | "employeesCompleted"
  | "priorPayrollCompleted";

export async function markStepCompleted(orgId: string, userId: string, step: StepField) {
  await getOrCreatePayrollSettings(orgId, userId);
  const updated = await prisma.payrollSettings.update({
    where: { orgId },
    data: { [step]: true, updatedBy: userId },
  });
  // Latch on the 6 onboarding steps only — Prior Payroll is not part of setup.
  const allDone =
    updated.orgDetailsCompleted &&
    updated.taxDetailsCompleted &&
    updated.payScheduleCompleted &&
    updated.statutoryComponentsCompleted &&
    updated.salaryComponentsCompleted &&
    updated.employeesCompleted;

  if (allDone && !updated.setupCompleted) {
    return prisma.payrollSettings.update({
      where: { orgId },
      data: { setupCompleted: true, setupCompletedAt: new Date(), updatedBy: userId },
    });
  }
  return updated;
}

export type StepStatus = "NotStarted" | "InProgress" | "Completed";

export interface StepState {
  status: StepStatus;
  completed: boolean;
  locked: boolean;
  lockReason?: string;
}

export interface SetupProgress {
  completedSteps: number;
  totalSteps: number;
  setupCompleted: boolean;
  setupCompletedAt: Date | null;
  steps: Record<
    "orgDetails" | "taxDetails" | "paySchedule" | "statutoryComponents" | "salaryComponents" | "employees" | "priorPayroll",
    StepState
  >;
}

export async function computeSetupProgress(orgId: string): Promise<SetupProgress> {
  const [settings, company, tax, schedule, epf, esi, ptCount, lwfCount, bonus, minWageCount, componentCount, activeEarningCount, employeeSalaryCount, prior] =
    await Promise.all([
      prisma.payrollSettings.findUnique({ where: { orgId } }),
      prisma.companySettings.findUnique({
        where: { orgId },
        select: { pan: true, companyName: true, addressLine1: true, city: true, state: true, postalCode: true, cin: true, gstin: true },
      }),
      prisma.payrollTaxDetails.findUnique({
        where: { orgId },
        select: { pan: true, tan: true, deductorType: true, deductorEmployeeId: true, deductorName: true, deductorFatherName: true },
      }),
      prisma.paySchedule.findUnique({
        where: { orgId },
        select: { id: true, workWeek: true, salaryCalcBasis: true, payDayType: true, payDayOfMonth: true, orgWorkingDays: true },
      }),
      prisma.ePFConfig.findUnique({ where: { orgId }, select: { enabled: true } }),
      prisma.eSIConfig.findUnique({ where: { orgId }, select: { enabled: true } }),
      prisma.professionalTaxConfig.count({ where: { orgId } }),
      prisma.lWFConfig.count({ where: { orgId } }),
      prisma.statutoryBonusConfig.findUnique({ where: { orgId }, select: { enabled: true } }),
      prisma.stateMinimumWage.count({ where: { orgId } }),
      prisma.salaryComponent.count({ where: { orgId, deletedAt: null } }),
      prisma.salaryComponent.count({ where: { orgId, deletedAt: null, isActive: true, type: "Earning" } }),
      prisma.employeeSalary.count({ where: { orgId, deletedAt: null, isActive: true } }),
      prisma.priorPayroll.findUnique({ where: { orgId }, select: { enabled: true, dataUploaded: true, financialYear: true } }),
    ]);

  const build = (flag: boolean, partial: boolean, lock?: { locked: boolean; reason?: string }): StepState => {
    if (lock?.locked) return { status: "NotStarted", completed: false, locked: true, lockReason: lock.reason };
    if (flag) return { status: "Completed", completed: true, locked: false };
    if (partial) return { status: "InProgress", completed: false, locked: false };
    return { status: "NotStarted", completed: false, locked: false };
  };

  // Step 1: Organisation Details
  const orgComplete =
    !!(company?.companyName && company?.addressLine1 && company?.city && company?.state && company?.postalCode && (company?.cin || company?.gstin)) ||
    !!settings?.orgDetailsCompleted;
  const orgPartial = !!(company?.companyName || company?.addressLine1);

  // Step 2: Tax Details
  const deductorOk = tax?.deductorType === "Employee" ? !!tax?.deductorEmployeeId : !!tax?.deductorName;
  const taxComplete = !!(tax?.pan && tax?.tan && deductorOk && tax?.deductorFatherName) || !!settings?.taxDetailsCompleted;
  const taxPartial = !!(tax?.pan || tax?.tan);

  // Step 3: Pay Schedule
  const payOnOk = schedule?.payDayType === "LastWorkingDay" || (schedule?.payDayType === "FixedDay" && schedule?.payDayOfMonth != null);
  const scheduleComplete =
    !!(schedule && schedule.workWeek && schedule.salaryCalcBasis && payOnOk) || !!settings?.payScheduleCompleted;
  const schedulePartial = !!schedule;

  // Step 4: Statutory — only EPF + ESI + PT are mandatory.
  // LWF / Bonus / State Min Wage are optional state-specific add-ons.
  const statutoryComplete =
    (!!epf && !!esi && ptCount > 0) ||
    !!settings?.statutoryComponentsCompleted;
  const statutoryPartial = !!(epf || esi || ptCount > 0 || lwfCount > 0 || bonus || minWageCount > 0);

  // Step 5: Salary Components — at least one active earning
  const componentsComplete = activeEarningCount > 0 || !!settings?.salaryComponentsCompleted;
  const componentsPartial = componentCount > 0;

  // Step 6: Employees
  const employeesComplete = employeeSalaryCount > 0 || !!settings?.employeesCompleted;
  const employeesPartial = false;

  // Step 7: Prior Payroll — locked until step 3 done
  const step7Locked = !scheduleComplete;
  const priorComplete = !!(prior?.dataUploaded || prior?.financialYear) || !!settings?.priorPayrollCompleted;
  const priorPartial = !!prior;

  const steps = {
    orgDetails: build(orgComplete, orgPartial),
    taxDetails: build(taxComplete, taxPartial),
    paySchedule: build(scheduleComplete, schedulePartial),
    statutoryComponents: build(statutoryComplete, statutoryPartial),
    salaryComponents: build(componentsComplete, componentsPartial),
    employees: build(employeesComplete, employeesPartial),
    priorPayroll: build(priorComplete, priorPartial, {
      locked: step7Locked,
      reason: step7Locked ? "Complete step 3 (Pay Schedule) first" : undefined,
    }),
  };

  // Prior Payroll ("Mid-year Joiners") is intentionally NOT part of the setup
  // wizard — it's ongoing operational work, not onboarding (see the STEPS list
  // in payroll/setup/page.tsx). It stays in `steps` for the Mid-year Joiners
  // page, but only the 6 onboarding steps count toward progress + completion.
  const SETUP_STEPS = [
    "orgDetails", "taxDetails", "paySchedule",
    "statutoryComponents", "salaryComponents", "employees",
  ] as const;
  const completedSteps = SETUP_STEPS.filter((k) => steps[k].completed).length;
  return {
    completedSteps,
    totalSteps: SETUP_STEPS.length,
    setupCompleted: !!settings?.setupCompleted || completedSteps === SETUP_STEPS.length,
    setupCompletedAt: settings?.setupCompletedAt ?? null,
    steps,
  };
}
