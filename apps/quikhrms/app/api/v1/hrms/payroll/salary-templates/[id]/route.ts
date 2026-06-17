import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, notFound, conflict } from "@/lib/api-response";
import { updateSalaryStructureSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (_req: NextRequest, { orgId }, { id }) => {
  try {
    const record = await prisma.salaryStructure.findFirst({
      where: { id, orgId, deletedAt: null },
      include: {
        components: { include: { component: true }, orderBy: { sortOrder: "asc" } },
        _count: { select: { employeeSalaries: true } },
      },
    });
    if (!record) return notFound();
    return successResponse(record);
  } catch (e) {
    console.error("GET /payroll/salary-templates/[id] error:", e);
    return internalError();
  }
});

export const PUT = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const body = await req.json();
    const parsed = updateSalaryStructureSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const existing = await prisma.salaryStructure.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound();

    const { components, ...rest } = parsed.data;

    if (components) {
      const catalog = await prisma.salaryComponent.findMany({
        where: { orgId, id: { in: components.map((c) => c.componentId) }, deletedAt: null },
        select: { id: true, category: true },
      });
      const basicCount = catalog.filter((c) => c.category === "Basic").length;
      if (basicCount > 1) return conflict("Only one Basic component allowed per template");
    }

    if (rest.isDefault === true) {
      await prisma.salaryStructure.updateMany({
        where: { orgId, deletedAt: null, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }

    const record = await prisma.$transaction(async (tx) => {
      await tx.salaryStructure.update({
        where: { id },
        data: { ...rest, updatedBy: userId },
      });
      if (components) {
        await tx.salaryStructureComponent.deleteMany({ where: { structureId: id } });
        await tx.salaryStructureComponent.createMany({
          data: components.map((c, idx) => ({
            orgId,
            structureId: id,
            componentId: c.componentId,
            amountType: c.amountType,
            amountValue: c.amountValue ?? null,
            formula: c.formula ?? null,
            sortOrder: c.sortOrder ?? idx,
          })),
        });
      }
      return tx.salaryStructure.findUnique({
        where: { id },
        include: { components: { include: { component: true } } },
      });
    });

    await createAuditLog({ orgId, userId, action: "Update", entityType: "SalaryStructure", entityId: id, changes: parsed.data });
    return successResponse(record);
  } catch (e) {
    console.error("PUT /payroll/salary-templates/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const existing = await prisma.salaryStructure.findFirst({
      where: { id, orgId, deletedAt: null },
      include: { _count: { select: { employeeSalaries: true } } },
    });
    if (!existing) return notFound();
    if (existing._count.employeeSalaries > 0) return validationError("Cannot delete template assigned to employees");

    await prisma.salaryStructure.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, isDefault: false, updatedBy: userId },
    });
    await createAuditLog({ orgId, userId, action: "Delete", entityType: "SalaryStructure", entityId: id });
    return successResponse({ id });
  } catch (e) {
    console.error("DELETE /payroll/salary-templates/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
