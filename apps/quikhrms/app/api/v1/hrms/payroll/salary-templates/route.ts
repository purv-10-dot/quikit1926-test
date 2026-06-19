import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, conflict } from "@/lib/api-response";
import { salaryStructureSchema } from "@/lib/validations/payroll";
import { markStepCompleted } from "@/lib/services/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const list = await prisma.salaryStructure.findMany({
      where: { orgId, deletedAt: null },
      include: {
        components: { include: { component: true }, orderBy: { sortOrder: "asc" } },
        _count: { select: { employeeSalaries: true } },
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
    return successResponse(list);
  } catch (e) {
    console.error("GET /payroll/salary-templates error:", e);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = salaryStructureSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const existing = await prisma.salaryStructure.findFirst({
      where: { orgId, code: parsed.data.code, deletedAt: null },
    });
    if (existing) return conflict("Template code already exists");

    const { components, ...rest } = parsed.data;

    const componentIds = components.map((c) => c.componentId);
    const catalog = await prisma.salaryComponent.findMany({
      where: { orgId, id: { in: componentIds }, deletedAt: null },
      select: { id: true, category: true },
    });
    const basicCount = catalog.filter((c) => c.category === "Basic").length;
    if (basicCount > 1) return conflict("Only one Basic component allowed per template");

    if (rest.isDefault) {
      await prisma.salaryStructure.updateMany({
        where: { orgId, deletedAt: null, isDefault: true },
        data: { isDefault: false },
      });
    }

    const record = await prisma.salaryStructure.create({
      data: {
        orgId,
        ...rest,
        createdBy: userId,
        updatedBy: userId,
        components: {
          create: components.map((c, idx) => ({
            orgId,
            componentId: c.componentId,
            amountType: c.amountType,
            amountValue: c.amountValue ?? null,
            formula: c.formula ?? null,
            sortOrder: c.sortOrder ?? idx,
          })),
        },
      },
      include: { components: { include: { component: true } } },
    });

    await markStepCompleted(orgId, userId, "salaryComponentsCompleted");
    await createAuditLog({ orgId, userId, action: "Create", entityType: "SalaryStructure", entityId: record.id, changes: parsed.data });
    return successResponse(record, undefined, 201);
  } catch (e) {
    console.error("POST /payroll/salary-templates error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
