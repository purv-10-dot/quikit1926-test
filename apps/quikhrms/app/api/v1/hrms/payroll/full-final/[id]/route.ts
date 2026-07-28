import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, conflict, internalError, notFound } from "@/lib/api-response";
import { updateFNFSchema } from "@/lib/validations/payroll";
import { computeFullAndFinal } from "@/lib/services/payroll-settlement";
import { getClearanceStatus } from "@/lib/services/offboarding-clearance";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (_req: NextRequest, { orgId }, { id }) => {
  try {
    const record = await prisma.fullAndFinalSettlement.findFirst({
      where: { id, orgId, deletedAt: null },
    });
    if (!record) return notFound();
    const employee = await prisma.employee.findFirst({
      where: { id: record.employeeId, orgId },
      select: { id: true, firstName: true, lastName: true, employeeCode: true, dateOfJoining: true, workEmail: true },
    });
    return successResponse({ ...record, employee });
  } catch (e) {
    console.error("GET /payroll/full-final/[id] error:", e);
    return internalError();
  }
});

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const existing = await prisma.fullAndFinalSettlement.findFirst({
      where: { id, orgId, deletedAt: null },
    });
    if (!existing) return notFound();
    if (existing.status === "Paid") return validationError("Cannot modify paid settlement");

    const body = await req.json();
    const parsed = updateFNFSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = { ...parsed.data } as Record<string, unknown>;
    // Auto-recompute net if any component touched
    const fields = ["pendingSalary","leaveEncashment","gratuityAmount","bonusAmount","noticePayRecovery","loanRecovery","otherEarnings","otherDeductions","tdsDeducted"] as const;
    const next = { ...existing, ...parsed.data };
    const grossOwed = Number(next.pendingSalary ?? 0) + Number(next.leaveEncashment ?? 0) + Number(next.gratuityAmount ?? 0) + Number(next.bonusAmount ?? 0) + Number(next.otherEarnings ?? 0);
    const recoveries = Number(next.noticePayRecovery ?? 0) + Number(next.loanRecovery ?? 0) + Number(next.otherDeductions ?? 0) + Number(next.tdsDeducted ?? 0);
    if (fields.some((f) => f in parsed.data)) {
      data.netSettlement = grossOwed - recoveries;
    }
    // Blocking gate: don't approve/pay the settlement until every department
    // clearance is done (the doc's "clearances gate F&F" rule).
    if (parsed.data.status === "Approved" || parsed.data.status === "Paid") {
      const clr = await getClearanceStatus(orgId, existing.employeeId);
      if (clr.hasOffboarding && !clr.complete) {
        return conflict(`${clr.pending} clearance task(s) still pending — all department clearances must be Cleared before the F&F can be ${parsed.data.status === "Paid" ? "paid" : "approved"}.`);
      }
    }
    if (parsed.data.status === "Approved") {
      data.approvedBy = userId;
      data.approvedAt = new Date();
    }
    if (parsed.data.status === "Paid") {
      data.paidAt = new Date();
    }

    const updated = await prisma.fullAndFinalSettlement.update({
      where: { id },
      data: { ...data, updatedBy: userId },
    });

    // If marked Paid, settle (close) all outstanding loans recovered in this F&F.
    // Mirrors the pay-run release flow: record a repayment, zero the balance, close the loan.
    // Guarded by the status==="Paid" early-return above, so this runs at most once.
    if (parsed.data.status === "Paid") {
      const loans = await prisma.employeeLoan.findMany({
        where: { orgId, employeeId: updated.employeeId, deletedAt: null, status: "Disbursed" },
      });
      for (const loan of loans) {
        const outstanding = Number(loan.outstandingAmount);
        if (outstanding <= 0) continue;
        const newEmisPaid = loan.emisPaid + 1;
        await prisma.loanRepayment.create({
          data: {
            orgId,
            loanId: loan.id,
            amount: outstanding,
            repaidOn: new Date(),
            emiNumber: newEmisPaid,
            isManual: true,
            notes: `Recovered in Full & Final settlement ${updated.id}`,
          },
        });
        await prisma.employeeLoan.update({
          where: { id: loan.id },
          data: {
            outstandingAmount: 0,
            emisPaid: newEmisPaid,
            status: "Closed",
            closedAt: new Date(),
            updatedBy: userId,
          },
        });
      }
    }

    // If marked Paid + gratuity > 0, persist a GratuityRecord
    if (parsed.data.status === "Paid" && Number(updated.gratuityAmount) > 0) {
      const employee = await prisma.employee.findFirst({
        where: { id: updated.employeeId, orgId },
        select: { dateOfJoining: true },
      });
      if (employee) {
        const yrsRaw = (updated.lastWorkingDate.getTime() - employee.dateOfJoining.getTime()) / (365.25 * 86_400_000);
        await prisma.gratuityRecord.create({
          data: {
            orgId,
            employeeId: updated.employeeId,
            computeDate: new Date(),
            yearsOfService: yrsRaw,
            lastBasicDA: 0,
            computedAmount: updated.gratuityAmount,
            taxExemptAmount: Math.min(Number(updated.gratuityAmount), 2_000_000),
            taxableAmount: Math.max(0, Number(updated.gratuityAmount) - 2_000_000),
            paid: true,
            paidOn: new Date(),
            createdBy: userId,
            updatedBy: userId,
          },
        });
      }
    }

    await createAuditLog({
      orgId, userId,
      action: parsed.data.status ? "StatusChange" : "Update",
      entityType: "FullAndFinalSettlement", entityId: id,
      before: existing as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
      request: req,
    });
    return successResponse(updated);
  } catch (e) {
    console.error("PATCH /payroll/full-final/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  // Action: recompute
  try {
    const existing = await prisma.fullAndFinalSettlement.findFirst({
      where: { id, orgId, deletedAt: null },
    });
    if (!existing) return notFound();
    if (existing.status === "Paid") return validationError("Cannot recompute paid settlement");

    let components;
    try {
      components = await computeFullAndFinal({
        orgId,
        employeeId: existing.employeeId,
        resignationDate: existing.resignationDate,
        lastWorkingDate: existing.lastWorkingDate,
        reason: existing.reason ?? undefined,
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "EMPLOYEE_NOT_FOUND") return notFound("Employee not found");
      if (code === "EMPLOYEE_MISSING_DOJ") return validationError("Employee has no Date of Joining set. Update employee profile first.");
      throw err;
    }
    const updated = await prisma.fullAndFinalSettlement.update({
      where: { id },
      data: {
        pendingSalary: components.pendingSalary,
        leaveEncashment: components.leaveEncashment,
        gratuityAmount: components.gratuityAmount,
        bonusAmount: components.bonusAmount,
        noticePayRecovery: components.noticePayRecovery,
        loanRecovery: components.loanRecovery,
        otherEarnings: components.otherEarnings,
        otherDeductions: components.otherDeductions,
        tdsDeducted: components.tdsDeducted,
        netSettlement: components.netSettlement,
        details: components.details as never,
        status: "Computed",
        updatedBy: userId,
      },
    });
    await createAuditLog({
      orgId, userId, action: "Update", entityType: "FullAndFinalSettlement", entityId: id,
      changes: { recomputed: true }, request: req,
    });
    return successResponse(updated);
  } catch (e) {
    console.error("POST /payroll/full-final/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

export const DELETE = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const existing = await prisma.fullAndFinalSettlement.findFirst({
      where: { id, orgId, deletedAt: null },
    });
    if (!existing) return notFound();
    if (existing.status === "Paid") return validationError("Cannot delete paid settlement");
    await prisma.fullAndFinalSettlement.update({ where: { id }, data: { deletedAt: new Date(), updatedBy: userId } });
    await createAuditLog({ orgId, userId, action: "Delete", entityType: "FullAndFinalSettlement", entityId: id, request: req });
    return successResponse({ id, deleted: true });
  } catch (e) {
    console.error("DELETE /payroll/full-final/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
