import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError, conflict } from "@/lib/api-response";
import { adjustPayslipTdsSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";
import { runBackground } from "@/lib/run-background";
import { runPayrollCompute, markPayrollComputeFailed } from "@/lib/jobs/run-payroll-compute";
import {
  getPayrollComputeState,
  setPayrollComputeState,
} from "@/lib/services/payroll-compute-state";

function fyKey(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth(); // 0=Jan
  return m >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

// Last calendar day of March of the FY that contains `d` (Indian FY end).
function fyEndDate(d: Date): Date {
  const y = d.getFullYear();
  const m = d.getMonth();
  const endYear = m >= 3 ? y + 1 : y;
  return new Date(endYear, 2, 31); // March 31
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function monthsBetween(start: Date, end: Date): number {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * PATCH /api/v1/hrms/payroll/runs/:id/payslips/:payslipId/adjust-tds
 *
 * Persists a TDS override for one employee for the period that the payslip
 * belongs to, plus a recovery plan for the resulting shortfall. Then triggers
 * recompute so the new value lands on the payslip and recovery is scheduled.
 *
 * Allowed only while the run is Draft or Processing.
 */
export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const { id, payslipId } = params as { id: string; payslipId: string };

    const body = await req.json();
    const parsed = adjustPayslipTdsSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const { overrideTds, strategy, recoveryMonths: reqMonths, reason } = parsed.data;

    const payslip = await prisma.payslip.findFirst({
      where: { id: payslipId, orgId, payRunId: id, deletedAt: null },
      include: {
        lines: { where: { componentCode: "TDS" }, select: { amount: true } },
        payRun: { select: { status: true, periodStart: true } },
      },
    });
    if (!payslip) return notFound("Payslip not found");

    const runStatus = payslip.payRun.status;
    if (runStatus !== "Draft" && runStatus !== "Processing") {
      return validationError(`Cannot adjust TDS on a ${runStatus} pay run`);
    }

    // What the compute service produced as TDS for this payslip RIGHT NOW.
    // If a TDS line is missing, baseline is 0.
    const originalTds = payslip.lines.reduce((s, l) => s + Number(l.amount), 0);

    const setOnPeriod = new Date(payslip.payRun.periodStart);
    setOnPeriod.setHours(0, 0, 0, 0);
    setOnPeriod.setDate(1);

    const fyEnd = fyEndDate(setOnPeriod);
    const monthsLeftAfterThis = monthsBetween(addMonths(setOnPeriod, 1), fyEnd); // includes endpoints

    const shortfall = round2(originalTds - overrideTds); // +ve => underdeducted

    // Recovery window
    let recoveryMonths = 0;
    let recoveryStart = setOnPeriod;
    let recoveryEnd = setOnPeriod;
    let perMonthAmount = 0;

    if (shortfall > 0) {
      if (monthsLeftAfterThis <= 0) {
        return validationError(
          "This is the last month of the financial year — there are no future months to recover the shortfall. Lower the override or wait until next FY.",
        );
      }
      if (strategy === "NextMonth") {
        recoveryMonths = 1;
        recoveryStart = addMonths(setOnPeriod, 1);
        recoveryEnd = recoveryStart;
        perMonthAmount = round2(shortfall);
      } else {
        // SpreadOverMonths — clamp requested N to [1, monthsLeftAfterThis]
        const requested = reqMonths ?? 3;
        const n = Math.max(1, Math.min(requested, monthsLeftAfterThis));
        recoveryMonths = n;
        recoveryStart = addMonths(setOnPeriod, 1);
        recoveryEnd = addMonths(setOnPeriod, n);
        perMonthAmount = round2(shortfall / n);
      }
    } else {
      // No shortfall (or HR over-deducted). No recovery needed.
      recoveryMonths = 0;
      recoveryStart = setOnPeriod;
      recoveryEnd = setOnPeriod;
      perMonthAmount = 0;
    }

    // Don't allow a new compute while one is in flight.
    const existing = await getPayrollComputeState(orgId, id);
    if (existing && (existing.status === "queued" || existing.status === "running")) {
      return conflict(`Compute is currently ${existing.status} — wait for it to finish before adjusting`);
    }

    // Replace any prior Active override for this employee in this FY — keeps the
    // ledger clean and avoids stacked recoveries that confuse the payslip.
    await prisma.tdsOverride.updateMany({
      where: {
        orgId,
        employeeId: payslip.employeeId,
        fy: fyKey(setOnPeriod),
        status: "Active",
        deletedAt: null,
      },
      data: { status: "Superseded", updatedBy: userId },
    });

    const newOverride = await prisma.tdsOverride.create({
      data: {
        orgId,
        employeeId: payslip.employeeId,
        setOnPayRunId: id,
        setOnPeriod,
        fy: fyKey(setOnPeriod),
        originalTds,
        overrideTds,
        shortfall,
        recoveryStrategy: strategy,
        recoveryMonths,
        perMonthAmount,
        recoveryStart,
        recoveryEnd,
        reason: reason ?? null,
        status: "Active",
        createdBy: userId,
        updatedBy: userId,
      },
    });

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "Payslip", entityId: payslipId,
      changes: {
        action: "AdjustTds",
        originalTds, overrideTds, shortfall,
        strategy, recoveryMonths, perMonthAmount,
        recoveryStart: recoveryStart.toISOString(),
        recoveryEnd: recoveryEnd.toISOString(),
        reason: reason ?? null,
      },
      request: req,
    });

    // Auto-recompute so the user sees the new TDS immediately.
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

    return successResponse(
      { overrideId: newOverride.id, originalTds, overrideTds, shortfall, recoveryMonths, perMonthAmount, recomputeQueued: true },
      undefined,
      202,
    );
  } catch (e) {
    console.error("PATCH /payroll/runs/[id]/payslips/[payslipId]/adjust-tds error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

/**
 * DELETE — cancel the override + remaining recovery. Lets the natural FY-spread
 * compute take over again from next month.
 */
export const DELETE = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const { id, payslipId } = params as { id: string; payslipId: string };

    const payslip = await prisma.payslip.findFirst({
      where: { id: payslipId, orgId, payRunId: id, deletedAt: null },
      select: { id: true, employeeId: true, payRun: { select: { status: true, periodStart: true } } },
    });
    if (!payslip) return notFound("Payslip not found");

    const runStatus = payslip.payRun.status;
    if (runStatus !== "Draft" && runStatus !== "Processing") {
      return validationError(`Cannot reset TDS adjustment on a ${runStatus} pay run`);
    }

    const existing = await getPayrollComputeState(orgId, id);
    if (existing && (existing.status === "queued" || existing.status === "running")) {
      return conflict(`Compute is currently ${existing.status} — wait for it to finish before adjusting`);
    }

    await prisma.tdsOverride.updateMany({
      where: {
        orgId,
        employeeId: payslip.employeeId,
        setOnPayRunId: id,
        status: "Active",
        deletedAt: null,
      },
      data: { status: "Cancelled", updatedBy: userId, deletedAt: new Date() },
    });

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "Payslip", entityId: payslipId,
      changes: { action: "ResetTdsAdjustment" }, request: req,
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
    console.error("DELETE /payroll/runs/[id]/payslips/[payslipId]/adjust-tds error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
