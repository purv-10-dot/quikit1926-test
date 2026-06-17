import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { internalError, notFound, forbidden } from "@/lib/api-response";
import { buildPayslipPdf, type PayslipPdfInput } from "@/lib/services/payroll-pdf";

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

export const GET = withAuth(async (_req: NextRequest, { orgId, userId, permissions }, { id }) => {
  try {
    const payslip = await prisma.payslip.findFirst({
      where: { id, orgId, deletedAt: null },
      include: { lines: { orderBy: { sortOrder: "asc" } }, payRun: { select: { payDate: true } } },
    });
    if (!payslip) return notFound("Payslip not found");

    // IDOR guard: a payslip is viewable only by its owner, or by someone with
    // payroll read authority. Without this, any authenticated tenant user could
    // fetch any colleague's payslip PDF by id.
    const isOwner = payslip.employeeId === userId;
    const canReadAll =
      permissions.includes("*") ||
      permissions.includes("hrms.payroll.read") || // future payroll code (G2)
      permissions.includes("hrms.settings.write"); // current payroll gate
    if (!isOwner && !canReadAll) return forbidden();

    const [employee, company] = await Promise.all([
      prisma.employee.findFirst({
        where: { id: payslip.employeeId, orgId, deletedAt: null },
        select: {
          employeeCode: true, firstName: true, lastName: true, panNumber: true,
          dateOfJoining: true, bankAccounts: true,
          designation: { select: { title: true } },
          department: { select: { name: true } },
          officeLocation: { select: { name: true, city: true, state: true } },
        },
      }),
      prisma.companySettings.findUnique({
        where: { orgId },
        select: { companyName: true, addressLine1: true, city: true, state: true, pan: true, logo: true },
      }),
    ]);
    if (!employee) return notFound("Employee not found");

    const earnings: { name: string; amount: number }[] = [];
    const deductions: { name: string; amount: number }[] = [];
    const employerContribs: { name: string; amount: number }[] = [];
    for (const l of payslip.lines) {
      const item = { name: l.componentName, amount: Number(l.amount) };
      if (l.type === "Earning") earnings.push(item);
      else if (l.type === "Deduction") deductions.push(item);
      else if (l.type === "StatutoryContribution") {
        // Employee statutory deductions appear in Deductions; employer in Employer Contribs
        if (l.category === "EPFEmployee" || l.category === "ESIEmployee" || l.category === "ProfessionalTax" || l.category === "LabourWelfareFund" || l.category === "IncomeTax") {
          deductions.push(item);
        } else {
          employerContribs.push(item);
        }
      }
    }

    const input: PayslipPdfInput = {
      company: {
        name: company?.companyName ?? null,
        address: [company?.addressLine1, company?.city, company?.state].filter(Boolean).join(", ") || null,
        pan: company?.pan ?? null,
        logo: company?.logo ?? null,
      },
      employee: {
        employeeCode: employee.employeeCode,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        designation: employee.designation?.title ?? null,
        department: employee.department?.name ?? null,
        location: [employee.officeLocation?.name, employee.officeLocation?.city, employee.officeLocation?.state].filter(Boolean).join(", ") || null,
        pan: employee.panNumber,
        bank: pickBank(employee.bankAccounts),
        dateOfJoining: employee.dateOfJoining,
      },
      period: {
        start: payslip.periodStart,
        end: payslip.periodEnd,
        payDate: payslip.payRun.payDate,
      },
      workingDays: Number(payslip.workingDays),
      paidDays: Number(payslip.paidDays),
      lopDays: Number(payslip.lopDays),
      earnings,
      deductions,
      employerContribs,
      grossEarnings: Number(payslip.grossEarnings),
      totalDeductions: Number(payslip.totalDeductions),
      netPay: Number(payslip.netPay),
    };

    const pdf = await buildPayslipPdf(input);
    const fileName = `Payslip-${employee.employeeCode}-${payslip.periodStart.toISOString().slice(0, 7)}.pdf`;
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("GET /payroll/payslips/[id]/pdf error:", e);
    return internalError();
  }
});
