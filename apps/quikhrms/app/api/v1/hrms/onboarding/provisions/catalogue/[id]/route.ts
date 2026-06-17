import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updateProvisionItemSchema } from "@/lib/validations/provisions";

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.provisionItem.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Provision item not found");

    const body = await req.json();
    const parsed = updateProvisionItemSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const data = parsed.data;

    const item = await prisma.provisionItem.update({
      where: { id: params.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.departmentIds !== undefined ? { departmentIds: JSON.parse(JSON.stringify(data.departmentIds ?? [])) } : {}),
        ...(data.roleIds !== undefined ? { roleIds: JSON.parse(JSON.stringify(data.roleIds ?? [])) } : {}),
        ...(data.designationIds !== undefined ? { designationIds: JSON.parse(JSON.stringify(data.designationIds ?? [])) } : {}),
        ...(data.ownerAssigneeRole !== undefined ? { ownerAssigneeRole: data.ownerAssigneeRole } : {}),
        updatedBy: userId,
      },
    });
    return successResponse(item);
  } catch (error) {
    console.error("PATCH /onboarding/provisions/catalogue/[id] error:", error);
    return internalError();
  }
});

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.provisionItem.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Provision item not found");

    await prisma.provisionItem.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), isActive: false, updatedBy: userId },
    });
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("DELETE /onboarding/provisions/catalogue/[id] error:", error);
    return internalError();
  }
});
