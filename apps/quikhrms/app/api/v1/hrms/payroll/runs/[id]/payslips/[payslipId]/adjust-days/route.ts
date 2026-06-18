import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError, conflict } from "@/lib/api-response";
import { adjustPayslipDaysSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";
import { runBackground } from "@/lib/run-background";
import { runPayrollCompute, markPayrollComputeFailed } from "@/lib/jobs/run-payroll-compute";
import {
  getPayrollComputeState,
  setPayrollComputeState,
} from "@/lib/services/payroll-compute-state";

/**
 * PATCH /api/v1/hrms/payroll/runs/:id/payslips/:payslipId/adjust-days
 *
 * Persists an HR-side paid-days override for one employee in a run, then
 * triggers a recompute so the new value is reflected in earnings/deductions/net.
 * The override is stored on PayRunAdjustment and survives future recomputes.
 *
 * Allowed only while the run is Draft or Processing.
 */
export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const { id, payslipId } = params as { id: string; payslipId: string };

    const body = await req.json();
    const parsed = adjustPayslipDaysSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const { paidDays, reason } = parsed.data;

    const payslip = await prisma.payslip.findFirst({
      where: { id: payslipId, orgId, payRunId: id, deletedAt: null },
      select: { id: true, employeeId: true, workingDays: true, payRun: { select: { status: true } } },
    });
    if (!payslip) return notFound("Payslip not found");

    const runStatus = payslip.payRun.status;
    if (runStatus !== "Draft" && runStatus !== "Processing") {
      return validationError(`Cannot adjust paid days on a ${runStatus} pay run`);
    }

    const workingDays = Number(payslip.workingDays);
    if (paidDays > workingDays) {
      return validationError(`Paid days cannot exceed working days (${workingDays})`);
    }

    // Don't allow a new compute while one is in flight.
    const existing = await getPayrollComputeState(orgId, id);
    if (existing && (existing.status === "queued" || existing.status === "running")) {
      return conflict(`Compute is currently ${existing.status} — wait for it to finish before adjusting`);
    }

    await prisma.payRunAdjustment.upsert({
      where: { payRunId_employeeId: { payRunId: id, employeeId: payslip.employeeId } },
      create: {
        orgId,
        payRunId: id,
        employeeId: payslip.employeeId,
        paidDaysOverride: paidDays,
        reason: reason ?? null,
        createdBy: userId,
        updatedBy: userId,
      },
      update: {
        paidDaysOverride: paidDays,
        reason: reason ?? null,
        updatedBy: userId,
        deletedAt: null,
      },
    });

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "Payslip", entityId: payslipId,
      changes: { action: "AdjustPaidDays", paidDays, workingDays, reason: reason ?? null },
      request: req,
    });

    // Auto-recompute so the user sees updated earnings/deductions/net.
    await setPayrollComputeState(orgId, id, {
      status: "queued",
      runId: id,
      orgId,
      startedAt: undefined,
      finishedAt: undefined,
      error: undefined,
    });
    runBackground(
      `payroll-compute:${id}`,
      () => runPayrollCompute({ orgId, userId, runId: id }),
      (err) => markPayrollComputeFailed(orgId, id, err),
    );

    return successResponse({ payslipId, paidDays, recomputeQueued: true }, undefined, 202);
  } catch (e) {
    console.error("PATCH /payroll/runs/[id]/payslips/[payslipId]/adjust-days error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

/**
 * DELETE — removes the override, letting attendance-derived LOP take over again
 * on the next recompute.
 */
export const DELETE = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const { id, payslipId } = params as { id: string; payslipId: string };

    const payslip = await prisma.payslip.findFirst({
      where: { id: payslipId, orgId, payRunId: id, deletedAt: null },
      select: { id: true, employeeId: true, payRun: { select: { status: true } } },
    });
    if (!payslip) return notFound("Payslip not found");

    const runStatus = payslip.payRun.status;
    if (runStatus !== "Draft" && runStatus !== "Processing") {
      return validationError(`Cannot reset adjustments on a ${runStatus} pay run`);
    }

    const existing = await getPayrollComputeState(orgId, id);
    if (existing && (existing.status === "queued" || existing.status === "running")) {
      return conflict(`Compute is currently ${existing.status} — wait for it to finish before adjusting`);
    }

    await prisma.payRunAdjustment.updateMany({
      where: { orgId, payRunId: id, employeeId: payslip.employeeId, deletedAt: null },
      data: { deletedAt: new Date(), updatedBy: userId },
    });

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "Payslip", entityId: payslipId,
      changes: { action: "ResetPaidDaysAdjustment" }, request: req,
    });

    await setPayrollComputeState(orgId, id, {
      status: "queued",
      runId: id,
      orgId,
      startedAt: undefined,
      finishedAt: undefined,
      error: undefined,
    });
    runBackground(
      `payroll-compute:${id}`,
      () => runPayrollCompute({ orgId, userId, runId: id }),
      (err) => markPayrollComputeFailed(orgId, id, err),
    );

    return successResponse({ payslipId, recomputeQueued: true }, undefined, 202);
  } catch (e) {
    console.error("DELETE /payroll/runs/[id]/payslips/[payslipId]/adjust-days error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
