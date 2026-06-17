import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, conflict, notFound } from "@/lib/api-response";
import { createFNFSchema } from "@/lib/validations/payroll";
import { computeFullAndFinal } from "@/lib/services/payroll-settlement";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const items = await prisma.fullAndFinalSettlement.findMany({
      where: { orgId, deletedAt: null, ...(status ? { status: status as never } : {}) },
      orderBy: { createdAt: "desc" },
    });
    const empIds = [...new Set(items.map((i) => i.employeeId))];
    const employees = empIds.length
      ? await prisma.employee.findMany({
          where: { orgId, deletedAt: null, id: { in: empIds } },
          select: { id: true, firstName: true, lastName: true, employeeCode: true, dateOfJoining: true },
        })
      : [];
    const empMap = new Map(employees.map((e) => [e.id, e]));
    return successResponse(items.map((i) => ({ ...i, employee: empMap.get(i.employeeId) ?? null })));
  } catch (e) {
    console.error("GET /payroll/full-final error:", e);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createFNFSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const existing = await prisma.fullAndFinalSettlement.findFirst({
      where: { orgId, employeeId: parsed.data.employeeId, deletedAt: null },
    });
    if (existing) return conflict("F&F already exists for this employee");

    let components;
    try {
      components = await computeFullAndFinal({
        orgId,
        employeeId: parsed.data.employeeId,
        resignationDate: new Date(parsed.data.resignationDate),
        lastWorkingDate: new Date(parsed.data.lastWorkingDate),
        reason: parsed.data.reason ?? undefined,
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "EMPLOYEE_NOT_FOUND") return notFound("Employee not found");
      if (code === "EMPLOYEE_MISSING_DOJ") return validationError("Employee has no Date of Joining set. Update employee profile first.");
      throw err;
    }

    const record = await prisma.fullAndFinalSettlement.create({
      data: {
        orgId,
        employeeId: parsed.data.employeeId,
        resignationDate: new Date(parsed.data.resignationDate),
        lastWorkingDate: new Date(parsed.data.lastWorkingDate),
        reason: parsed.data.reason ?? null,
        status: "Computed",
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
        createdBy: userId,
        updatedBy: userId,
      },
    });
    await createAuditLog({
      orgId, userId, action: "Create", entityType: "FullAndFinalSettlement", entityId: record.id,
      changes: parsed.data, request: req,
    });
    return successResponse(record, undefined, 201);
  } catch (e) {
    console.error("POST /payroll/full-final error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
