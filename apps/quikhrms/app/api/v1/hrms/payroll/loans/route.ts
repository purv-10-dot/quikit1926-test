import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createLoanSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const employeeId = url.searchParams.get("employeeId");

    const list = await prisma.employeeLoan.findMany({
      where: {
        orgId, deletedAt: null,
        ...(status ? { status: status as never } : {}),
        ...(employeeId ? { employeeId } : {}),
      },
      include: { _count: { select: { repayments: true } } },
      orderBy: { createdAt: "desc" },
    });
    const empIds = [...new Set(list.map((l) => l.employeeId))];
    const employees = empIds.length
      ? await prisma.employee.findMany({
          where: { orgId, deletedAt: null, id: { in: empIds } },
          select: { id: true, employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } } },
        })
      : [];
    const empMap = new Map(employees.map((e) => [e.id, e]));
    const rows = list.map((l) => ({ ...l, employee: empMap.get(l.employeeId) ?? null }));
    return successResponse(rows);
  } catch (e) {
    console.error("GET /payroll/loans error:", e);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createLoanSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const d = parsed.data;
    const record = await prisma.employeeLoan.create({
      data: {
        orgId,
        employeeId: d.employeeId,
        loanType: d.loanType,
        principalAmount: d.principalAmount,
        interestRate: d.interestRate,
        tenureMonths: d.tenureMonths,
        emiAmount: d.emiAmount,
        startDate: new Date(d.startDate),
        outstandingAmount: d.principalAmount,
        reason: d.reason ?? null,
        status: "Pending",
        createdBy: userId,
        updatedBy: userId,
      },
    });
    await createAuditLog({ orgId, userId, action: "Create", entityType: "EmployeeLoan", entityId: record.id, changes: d });
    return successResponse(record, undefined, 201);
  } catch (e) {
    console.error("POST /payroll/loans error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
