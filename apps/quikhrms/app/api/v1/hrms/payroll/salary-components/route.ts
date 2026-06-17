import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, conflict } from "@/lib/api-response";
import { salaryComponentSchema, SalaryComponentTypeEnum } from "@/lib/validations/payroll";
import { markStepCompleted } from "@/lib/services/payroll";
import { createAuditLog } from "@/lib/utils/audit";
export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const url = new URL(req.url);
    const typeParam = url.searchParams.get("type");
    const parsed = typeParam ? SalaryComponentTypeEnum.safeParse(typeParam) : null;

    const list = await prisma.salaryComponent.findMany({
      where: {
        orgId,
        deletedAt: null,
        ...(parsed?.success ? { type: parsed.data } : {}),
      },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });
    return successResponse(list);
  } catch (e) {
    console.error("GET /payroll/salary-components error:", e);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = salaryComponentSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const existing = await prisma.salaryComponent.findFirst({
      where: { orgId, code: parsed.data.code },
    });
    if (existing?.deletedAt) {
      const restored = await prisma.salaryComponent.update({
        where: { id: existing.id },
        data: { ...parsed.data, deletedAt: null, updatedBy: userId },
      });
        await createAuditLog({ orgId, userId, action: "Update", entityType: "SalaryComponent", entityId: restored.id, changes: parsed.data });
      return successResponse(restored, undefined, 200);
    }

    let finalCode = parsed.data.code;
    if (existing) {
      const siblings = await prisma.salaryComponent.findMany({
        where: { orgId, code: { startsWith: `${parsed.data.code}_` } },
        select: { code: true },
      });
      const used = new Set([parsed.data.code, ...siblings.map((s) => s.code)]);
      let n = 2;
      while (used.has(`${parsed.data.code}_${n}`)) n++;
      finalCode = `${parsed.data.code}_${n}`;
    }

    const record = await prisma.salaryComponent.create({
      data: { orgId, ...parsed.data, code: finalCode, createdBy: userId, updatedBy: userId },
    });
    await markStepCompleted(orgId, userId, "salaryComponentsCompleted");
    await createAuditLog({ orgId, userId, action: "Create", entityType: "SalaryComponent", entityId: record.id, changes: parsed.data });
    return successResponse(record, undefined, 201);
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return conflict("Component code already exists. Pick a different code.");
    }
    console.error("POST /payroll/salary-components error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
