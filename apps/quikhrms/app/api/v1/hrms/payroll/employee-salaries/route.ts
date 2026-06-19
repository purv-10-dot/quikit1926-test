import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, notFound } from "@/lib/api-response";
import { assignEmployeeSalarySchema } from "@/lib/validations/payroll";
import { markStepCompleted } from "@/lib/services/payroll";
import { createAuditLog } from "@/lib/utils/audit";
import { buildPayrollEvent, emitPayrollEvent, PAYROLL_EVENTS } from "@/lib/events/payroll";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const url = new URL(req.url);
    const employeeId = url.searchParams.get("employeeId");

    if (employeeId) {
      const history = await prisma.employeeSalary.findMany({
        where: { orgId, employeeId, deletedAt: null },
        include: { structure: { select: { id: true, name: true, code: true } } },
        orderBy: { effectiveFrom: "desc" },
      });
      return successResponse(history);
    }

    const employees = await prisma.employee.findMany({
      where: { orgId, deletedAt: null },
      select: {
        id: true, employeeCode: true, firstName: true, lastName: true, workEmail: true,
        department: { select: { name: true } },
        designation: { select: { title: true } },
      },
      orderBy: { firstName: "asc" },
    });

    const salaries = await prisma.employeeSalary.findMany({
      where: { orgId, deletedAt: null, isActive: true },
      include: { structure: { select: { id: true, name: true, code: true } } },
    });
    const latestByEmployee = new Map<string, typeof salaries[number]>();
    for (const s of salaries) latestByEmployee.set(s.employeeId, s);

    const rows = employees.map((e) => ({
      employeeId: e.id,
      employeeCode: e.employeeCode,
      name: `${e.firstName} ${e.lastName}`,
      workEmail: e.workEmail,
      department: e.department?.name ?? null,
      designation: e.designation?.title ?? null,
      salary: latestByEmployee.get(e.id) ?? null,
    }));

    return successResponse(rows);
  } catch (e) {
    console.error("GET /payroll/employee-salaries error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.read", "hrms.settings.write"], anyPermission: true });

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = assignEmployeeSalarySchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const employee = await prisma.employee.findFirst({
      where: { id: parsed.data.employeeId, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) return notFound("Employee not found");

    const structure = await prisma.salaryStructure.findFirst({
      where: { id: parsed.data.structureId, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!structure) return notFound("Salary structure not found");

    // Deactivate previous active salary records for this employee
    await prisma.employeeSalary.updateMany({
      where: { orgId, employeeId: parsed.data.employeeId, deletedAt: null, isActive: true },
      data: { isActive: false, effectiveTo: new Date(parsed.data.effectiveFrom) },
    });

    const record = await prisma.employeeSalary.create({
      data: {
        orgId,
        employeeId: parsed.data.employeeId,
        structureId: parsed.data.structureId,
        ctc: parsed.data.ctc,
        effectiveFrom: new Date(parsed.data.effectiveFrom),
        revisionReason: parsed.data.revisionReason ?? null,
        isActive: true,
        createdBy: userId,
        updatedBy: userId,
      },
      include: { structure: { select: { id: true, name: true, code: true } } },
    });

    await markStepCompleted(orgId, userId, "employeesCompleted");
    await createAuditLog({
      orgId, userId, action: "Create", entityType: "EmployeeSalary", entityId: record.id, changes: parsed.data,
    });
    emitPayrollEvent(buildPayrollEvent(PAYROLL_EVENTS.SALARY_ASSIGNED, orgId, userId, record.id, {
      employeeId: record.employeeId,
      ctc: Number(record.ctc),
      effectiveFrom: record.effectiveFrom,
    }));
    return successResponse(record, undefined, 201);
  } catch (e) {
    console.error("POST /payroll/employee-salaries error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
