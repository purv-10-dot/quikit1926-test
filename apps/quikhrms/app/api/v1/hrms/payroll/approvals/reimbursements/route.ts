import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createReimbursementClaimSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");

    const claims = await prisma.reimbursementClaim.findMany({
      where: {
        orgId,
        deletedAt: null,
        ...(status ? { status: status as never } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    const empIds = [...new Set(claims.map((c) => c.employeeId))];
    const employees = empIds.length
      ? await prisma.employee.findMany({
          where: { orgId, deletedAt: null, id: { in: empIds } },
          select: { id: true, employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } } },
        })
      : [];
    const empMap = new Map(employees.map((e) => [e.id, e]));
    const rows = claims.map((c) => ({ ...c, employee: empMap.get(c.employeeId) ?? null }));
    return successResponse(rows);
  } catch (e) {
    console.error("GET /payroll/approvals/reimbursements error:", e);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createReimbursementClaimSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const record = await prisma.reimbursementClaim.create({
      data: {
        orgId,
        employeeId: parsed.data.employeeId,
        componentId: parsed.data.componentId ?? null,
        componentName: parsed.data.componentName,
        billDate: new Date(parsed.data.billDate),
        billNumber: parsed.data.billNumber ?? null,
        amountClaimed: parsed.data.amountClaimed,
        fileUrl: parsed.data.fileUrl ?? null,
        description: parsed.data.description ?? null,
        status: "Submitted",
        createdBy: userId,
        updatedBy: userId,
      },
    });
    await createAuditLog({ orgId, userId, action: "Create", entityType: "ReimbursementClaim", entityId: record.id, changes: parsed.data });
    return successResponse(record, undefined, 201);
  } catch (e) {
    console.error("POST /payroll/approvals/reimbursements error:", e);
    return internalError();
  }
});
