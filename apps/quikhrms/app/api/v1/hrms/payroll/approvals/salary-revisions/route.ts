import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, notFound } from "@/lib/api-response";
import { createSalaryRevisionSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";
import { buildPayrollEvent, emitPayrollEvent, PAYROLL_EVENTS } from "@/lib/events/payroll";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");

    const list = await prisma.salaryRevision.findMany({
      where: { orgId, deletedAt: null, ...(status ? { status: status as never } : {}) },
      orderBy: { createdAt: "desc" },
    });
    const empIds = [...new Set(list.map((r) => r.employeeId))];
    const structureIds = [...new Set(list.map((r) => r.structureId).filter((x): x is string => !!x))];
    const [employees, structures] = await Promise.all([
      empIds.length
        ? prisma.employee.findMany({
            where: { orgId, deletedAt: null, id: { in: empIds } },
            select: { id: true, employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } } },
          })
        : [],
      structureIds.length
        ? prisma.salaryStructure.findMany({
            where: { orgId, deletedAt: null, id: { in: structureIds } },
            select: { id: true, name: true, code: true },
          })
        : [],
    ]);
    const empMap = new Map(employees.map((e) => [e.id, e]));
    const strMap = new Map(structures.map((s) => [s.id, s]));
    const rows = list.map((r) => ({
      ...r,
      employee: empMap.get(r.employeeId) ?? null,
      structure: r.structureId ? strMap.get(r.structureId) ?? null : null,
    }));
    return successResponse(rows);
  } catch (e) {
    console.error("GET /payroll/approvals/salary-revisions error:", e);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createSalaryRevisionSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const current = await prisma.employeeSalary.findFirst({
      where: { orgId, employeeId: parsed.data.employeeId, deletedAt: null, isActive: true },
    });
    if (!current) return notFound("Employee has no active salary assignment");

    const record = await prisma.salaryRevision.create({
      data: {
        orgId,
        employeeId: parsed.data.employeeId,
        currentCTC: current.ctc,
        proposedCTC: parsed.data.proposedCTC,
        structureId: parsed.data.structureId ?? current.structureId,
        effectiveFrom: new Date(parsed.data.effectiveFrom),
        reason: parsed.data.reason ?? null,
        status: "Pending",
        requestedBy: userId,
        createdBy: userId,
        updatedBy: userId,
      },
    });
    await createAuditLog({ orgId, userId, action: "Create", entityType: "SalaryRevision", entityId: record.id, changes: parsed.data });
    emitPayrollEvent(buildPayrollEvent(PAYROLL_EVENTS.REVISION_REQUESTED, orgId, userId, record.id, {
      employeeId: record.employeeId,
      currentCTC: Number(record.currentCTC),
      proposedCTC: Number(record.proposedCTC),
    }));
    return successResponse(record, undefined, 201);
  } catch (e) {
    console.error("POST /payroll/approvals/salary-revisions error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
