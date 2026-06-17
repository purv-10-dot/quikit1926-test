import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, notFound } from "@/lib/api-response";
import { upsertLegalEntitySchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (_req: NextRequest, { orgId }, { id }) => {
  try {
    const record = await prisma.legalEntity.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!record) return notFound();
    return successResponse(record);
  } catch (e) {
    console.error("GET /legal-entities/[id] error:", e);
    return internalError();
  }
});

export const PUT = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const existing = await prisma.legalEntity.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound();
    const body = await req.json();
    const parsed = upsertLegalEntitySchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    if (parsed.data.isPrimary && !existing.isPrimary) {
      await prisma.legalEntity.updateMany({
        where: { orgId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const updated = await prisma.legalEntity.update({
      where: { id },
      data: { ...parsed.data, updatedBy: userId },
    });
    await createAuditLog({
      orgId, userId, action: "Update", entityType: "LegalEntity", entityId: id,
      before: existing as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
      request: req,
    });
    return successResponse(updated);
  } catch (e) {
    console.error("PUT /legal-entities/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

export const DELETE = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const existing = await prisma.legalEntity.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound();

    const empCount = await prisma.employee.count({ where: { orgId, legalEntityId: id, deletedAt: null } });
    if (empCount > 0) return validationError(`Cannot delete — ${empCount} employees still mapped to this entity`);

    await prisma.legalEntity.update({ where: { id }, data: { deletedAt: new Date(), updatedBy: userId } });
    await createAuditLog({ orgId, userId, action: "Delete", entityType: "LegalEntity", entityId: id, request: req });
    return successResponse({ id, deleted: true });
  } catch (e) {
    console.error("DELETE /legal-entities/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
