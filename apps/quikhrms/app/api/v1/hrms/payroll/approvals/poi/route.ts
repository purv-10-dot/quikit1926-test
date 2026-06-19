import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createInvestmentProofSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const fy = url.searchParams.get("fy");

    const proofs = await prisma.investmentProof.findMany({
      where: {
        orgId, deletedAt: null,
        ...(status ? { status: status as never } : {}),
        ...(fy ? { financialYear: fy } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    const empIds = [...new Set(proofs.map((p) => p.employeeId))];
    const employees = empIds.length
      ? await prisma.employee.findMany({
          where: { orgId, deletedAt: null, id: { in: empIds } },
          select: { id: true, employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } } },
        })
      : [];
    const empMap = new Map(employees.map((e) => [e.id, e]));
    const rows = proofs.map((p) => ({ ...p, employee: empMap.get(p.employeeId) ?? null }));
    return successResponse(rows);
  } catch (e) {
    console.error("GET /payroll/approvals/poi error:", e);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createInvestmentProofSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const record = await prisma.investmentProof.create({
      data: {
        orgId,
        ...parsed.data,
        fileUrl: parsed.data.fileUrl ?? null,
        remarks: parsed.data.remarks ?? null,
        status: "Submitted",
        createdBy: userId,
        updatedBy: userId,
      },
    });
    await createAuditLog({ orgId, userId, action: "Create", entityType: "InvestmentProof", entityId: record.id, changes: parsed.data });
    return successResponse(record, undefined, 201);
  } catch (e) {
    console.error("POST /payroll/approvals/poi error:", e);
    return internalError();
  }
});
