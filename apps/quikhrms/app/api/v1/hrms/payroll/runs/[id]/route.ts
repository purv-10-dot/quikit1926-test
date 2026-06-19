import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError, notFound, validationError } from "@/lib/api-response";
import { updatePayRunSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (_req: NextRequest, { orgId }, { id }) => {
  try {
    const run = await prisma.payRun.findFirst({
      where: { id, orgId, deletedAt: null },
      include: {
        payslips: {
          include: { lines: { orderBy: { sortOrder: "asc" } } },
          orderBy: { createdAt: "asc" },
        },
        adjustments: {
          where: { deletedAt: null, paidDaysOverride: { not: null } },
          select: { employeeId: true, paidDaysOverride: true, reason: true, updatedAt: true },
        },
      },
    });
    if (!run) return notFound();

    // TDS overrides — both "applied this period" and "in recovery this period".
    const runPeriodStartIso = new Date(run.periodStart);
    runPeriodStartIso.setHours(0, 0, 0, 0);
    runPeriodStartIso.setDate(1);
    const tdsOverrides = await prisma.tdsOverride.findMany({
      where: {
        orgId,
        deletedAt: null,
        status: "Active",
        OR: [
          { setOnPayRunId: id },
          { recoveryStart: { lte: runPeriodStartIso }, recoveryEnd: { gte: runPeriodStartIso } },
        ],
      },
      select: {
        id: true, employeeId: true, setOnPayRunId: true, setOnPeriod: true,
        originalTds: true, overrideTds: true, shortfall: true,
        recoveryStrategy: true, recoveryMonths: true, perMonthAmount: true,
        recoveryStart: true, recoveryEnd: true, reason: true, status: true,
      },
    });

    // Pull every one-time entry whose payPeriod falls inside this run's window —
    // even those for employees that don't yet have a payslip in the run (HR
     // should see Pending entries before clicking Compute).
    const periodStart = new Date(run.periodStart);
    const periodEnd = new Date(run.periodEnd);

    const oneTimeEntries = await prisma.oneTimeEarning.findMany({
      where: {
        orgId,
        deletedAt: null,
        payPeriod: { gte: periodStart, lte: periodEnd },
      },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      select: {
        id: true, employeeId: true, kind: true, category: true,
        componentCode: true, componentName: true,
        amount: true, payPeriod: true, status: true,
        reason: true, rejectionReason: true,
      },
    });

    const oneTimeEmployeeIds = oneTimeEntries.map((e) => e.employeeId);
    const allEmployeeIds = [...new Set([...run.payslips.map((p) => p.employeeId), ...oneTimeEmployeeIds])];

    const [employees, company] = await Promise.all([
      allEmployeeIds.length
        ? prisma.employee.findMany({
            where: { orgId, deletedAt: null, id: { in: allEmployeeIds } },
            select: {
              id: true, employeeCode: true, firstName: true, lastName: true, workEmail: true,
              panNumber: true, dateOfJoining: true, bankAccounts: true,
              department: { select: { name: true } },
              designation: { select: { title: true } },
            },
          })
        : Promise.resolve([]),
      prisma.companySettings.findUnique({
        where: { orgId },
        select: { companyName: true, addressLine1: true, city: true, state: true },
      }),
    ]);
    const empMap = new Map(employees.map((e) => [e.id, e]));
    const adjMap = new Map(run.adjustments.map((a) => [a.employeeId, a]));

    // Group TDS overrides per employee: { setForThisPeriod, activeRecoveries[] }
    const tdsByEmployee = new Map<string, {
      setForThisPeriod: typeof tdsOverrides[number] | null;
      recoveries: typeof tdsOverrides;
    }>();
    for (const o of tdsOverrides) {
      const bucket = tdsByEmployee.get(o.employeeId) ?? { setForThisPeriod: null, recoveries: [] as typeof tdsOverrides };
      if (o.setOnPayRunId === id) {
        bucket.setForThisPeriod = o;
      } else if (o.recoveryStart.getTime() <= runPeriodStartIso.getTime() && runPeriodStartIso.getTime() <= o.recoveryEnd.getTime()) {
        bucket.recoveries.push(o);
      }
      tdsByEmployee.set(o.employeeId, bucket);
    }

    const payslips = run.payslips.map((p) => {
      const adj = adjMap.get(p.employeeId);
      const tds = tdsByEmployee.get(p.employeeId);
      return {
        ...p,
        employee: empMap.get(p.employeeId) ?? null,
        adjustment: adj
          ? { paidDaysOverride: Number(adj.paidDaysOverride), reason: adj.reason, updatedAt: adj.updatedAt }
          : null,
        tdsAdjustment: tds?.setForThisPeriod
          ? {
              id: tds.setForThisPeriod.id,
              originalTds: Number(tds.setForThisPeriod.originalTds),
              overrideTds: Number(tds.setForThisPeriod.overrideTds),
              shortfall: Number(tds.setForThisPeriod.shortfall),
              strategy: tds.setForThisPeriod.recoveryStrategy,
              recoveryMonths: tds.setForThisPeriod.recoveryMonths,
              perMonthAmount: Number(tds.setForThisPeriod.perMonthAmount),
              recoveryStart: tds.setForThisPeriod.recoveryStart,
              recoveryEnd: tds.setForThisPeriod.recoveryEnd,
              reason: tds.setForThisPeriod.reason,
            }
          : null,
        tdsRecoveries: (tds?.recoveries ?? []).map((r) => ({
          id: r.id,
          fromPeriod: r.setOnPeriod,
          shortfall: Number(r.shortfall),
          perMonthAmount: Number(r.perMonthAmount),
          recoveryStart: r.recoveryStart,
          recoveryEnd: r.recoveryEnd,
        })),
      };
    });

    const oneTimeEarnings = oneTimeEntries.map((e) => {
      const emp = empMap.get(e.employeeId);
      return {
        ...e,
        amount: Number(e.amount),
        employee: emp
          ? { id: emp.id, employeeCode: emp.employeeCode, firstName: emp.firstName, lastName: emp.lastName }
          : null,
      };
    });

    return successResponse({ ...run, payslips, company, oneTimeEarnings });
  } catch (e) {
    console.error("GET /payroll/runs/[id] error:", e);
    return internalError();
  }
});

export const PUT = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const body = await req.json();
    const parsed = updatePayRunSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const run = await prisma.payRun.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!run) return notFound();
    if (run.status === "Paid") return validationError("Cannot edit paid pay run");

    const updated = await prisma.payRun.update({
      where: { id },
      data: {
        ...(parsed.data.payDate ? { payDate: new Date(parsed.data.payDate) } : {}),
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
        updatedBy: userId,
      },
    });
    await createAuditLog({ orgId, userId, action: "Update", entityType: "PayRun", entityId: id, changes: parsed.data });
    return successResponse(updated);
  } catch (e) {
    console.error("PUT /payroll/runs/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const run = await prisma.payRun.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!run) return notFound();
    if (run.status === "Paid" || run.status === "Approved") return validationError("Cannot delete approved/paid run");

    await prisma.payRun.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    await createAuditLog({ orgId, userId, action: "Delete", entityType: "PayRun", entityId: id });
    return successResponse({ id });
  } catch (e) {
    console.error("DELETE /payroll/runs/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
