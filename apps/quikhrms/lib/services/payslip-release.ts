import { prisma } from "@/lib/prisma";
import { buildPayslipEmail } from "@/lib/email-templates/payslip";
import { buildPayslipPdf, type PayslipPdfInput } from "@/lib/services/payroll-pdf";
import { queueEmail } from "@/lib/services/mailer";
import { buildPayrollEvent, emitPayrollEvent, PAYROLL_EVENTS } from "@/lib/events/payroll";

interface BankAccount {
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  isPrimary?: boolean;
}

function pickBank(json: unknown): PayslipPdfInput["employee"]["bank"] {
  if (!json || !Array.isArray(json)) return null;
  const accounts = json as BankAccount[];
  const primary = accounts.find((a) => a.isPrimary) ?? accounts[0];
  if (!primary) return null;
  return {
    bankName: primary.bankName ?? null,
    accountNumber: primary.accountNumber ?? null,
    ifsc: primary.ifsc ?? null,
  };
}

/**
 * Build payslip PDF + queue email with attachment.
 * Used by worker processor (one job per payslip during release).
 */
export async function buildAndQueuePayslipEmail(args: {
  orgId: string;
  payslipId: string;
  payRunId: string;
  userId?: string;
}): Promise<{ queued: boolean; reason?: string }> {
  const { orgId, payslipId, payRunId, userId } = args;

  const [payslip, run, company] = await Promise.all([
    prisma.payslip.findFirst({
      where: { id: payslipId, orgId, deletedAt: null },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.payRun.findFirst({ where: { id: payRunId, orgId, deletedAt: null } }),
    prisma.companySettings.findUnique({
      where: { orgId },
      select: {
        companyName: true, addressLine1: true, city: true, state: true, pan: true, logo: true,
      },
    }),
  ]);

  if (!payslip) return { queued: false, reason: "payslip-not-found" };
  if (!run) return { queued: false, reason: "run-not-found" };

  const employee = await prisma.employee.findFirst({
    where: { orgId, id: payslip.employeeId, deletedAt: null },
    select: {
      id: true, firstName: true, lastName: true, employeeCode: true, workEmail: true,
      panNumber: true, dateOfJoining: true, bankAccounts: true,
      designation: { select: { title: true } },
      department: { select: { name: true } },
      officeLocation: { select: { name: true, city: true, state: true } },
    },
  });
  if (!employee) return { queued: false, reason: "employee-not-found" };
  if (!employee.workEmail) return { queued: false, reason: "no-email" };

  const companyName = company?.companyName ?? "QuikIT HRMS";

  const { subject, html } = buildPayslipEmail({
    employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
    employeeCode: employee.employeeCode,
    companyName,
    periodStart: new Date(payslip.periodStart),
    periodEnd: new Date(payslip.periodEnd),
    payDate: new Date(run.payDate),
    grossEarnings: Number(payslip.grossEarnings),
    totalDeductions: Number(payslip.totalDeductions),
    netPay: Number(payslip.netPay),
  });

  const earnings: { name: string; amount: number }[] = [];
  const deductions: { name: string; amount: number }[] = [];
  const employerContribs: { name: string; amount: number }[] = [];
  for (const l of payslip.lines) {
    const item = { name: l.componentName, amount: Number(l.amount) };
    if (l.type === "Earning") earnings.push(item);
    else if (l.type === "Deduction") deductions.push(item);
    else if (l.type === "StatutoryContribution") {
      if (
        l.category === "EPFEmployee" ||
        l.category === "ESIEmployee" ||
        l.category === "ProfessionalTax" ||
        l.category === "LabourWelfareFund" ||
        l.category === "IncomeTax"
      ) {
        deductions.push(item);
      } else {
        employerContribs.push(item);
      }
    }
  }

  const pdfBytes = await buildPayslipPdf({
    company: {
      name: company?.companyName ?? null,
      address:
        [company?.addressLine1, company?.city, company?.state].filter(Boolean).join(", ") || null,
      pan: company?.pan ?? null,
      logo: company?.logo ?? null,
    },
    employee: {
      employeeCode: employee.employeeCode,
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      designation: employee.designation?.title ?? null,
      department: employee.department?.name ?? null,
      location:
        [employee.officeLocation?.name, employee.officeLocation?.city, employee.officeLocation?.state]
          .filter(Boolean)
          .join(", ") || null,
      pan: employee.panNumber,
      bank: pickBank(employee.bankAccounts),
      dateOfJoining: employee.dateOfJoining,
    },
    period: { start: payslip.periodStart, end: payslip.periodEnd, payDate: run.payDate },
    workingDays: Number(payslip.workingDays),
    paidDays: Number(payslip.paidDays),
    lopDays: Number(payslip.lopDays),
    earnings,
    deductions,
    employerContribs,
    grossEarnings: Number(payslip.grossEarnings),
    totalDeductions: Number(payslip.totalDeductions),
    netPay: Number(payslip.netPay),
  });

  await queueEmail(orgId, {
    to: employee.workEmail,
    subject,
    html,
    kind: "payslip.release",
    attachments: [
      {
        filename: `Payslip-${employee.employeeCode}-${new Date(payslip.periodStart).toISOString().slice(0, 7)}.pdf`,
        content: Buffer.from(pdfBytes),
        contentType: "application/pdf",
      },
    ],
  });

  emitPayrollEvent(
    buildPayrollEvent(PAYROLL_EVENTS.PAYSLIP_EMAIL_SENT, orgId, userId ?? "", payslip.id, {
      employeeId: employee.id,
      to: employee.workEmail,
      queued: true,
    }),
  );

  return { queued: true };
}
