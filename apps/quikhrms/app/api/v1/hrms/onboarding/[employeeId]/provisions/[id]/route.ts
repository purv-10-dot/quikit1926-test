import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updateEmployeeProvisionSchema } from "@/lib/validations/provisions";
import { createAuditLog } from "@/lib/utils/audit";

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.employeeProvision.findFirst({
      where: { id: params.id, orgId, employeeId: params.employeeId, deletedAt: null },
    });
    if (!existing) return notFound("Provision not found");

    const body = await req.json();
    const parsed = updateEmployeeProvisionSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const data = parsed.data;

    const becameDone = data.status === "ProvDone" && existing.status !== "ProvDone";

    const provision = await prisma.employeeProvision.update({
      where: { id: params.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.assignedTo !== undefined ? { assignedTo: data.assignedTo } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.dueDate !== undefined ? { dueDate: data.dueDate ? new Date(data.dueDate) : null } : {}),
        ...(data.meta !== undefined ? { meta: data.meta ? JSON.parse(JSON.stringify(data.meta)) : undefined } : {}),
        ...(becameDone ? { provisionedAt: new Date(), provisionedBy: userId } : {}),
        updatedBy: userId,
      },
    });

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "EmployeeProvision", entityId: provision.id,
      changes: { status: provision.status, name: provision.name },
    });

    return successResponse(provision);
  } catch (error) {
    console.error("PATCH /onboarding/[employeeId]/provisions/[id] error:", error);
    return internalError();
  }
});

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.employeeProvision.findFirst({
      where: { id: params.id, orgId, employeeId: params.employeeId, deletedAt: null },
    });
    if (!existing) return notFound("Provision not found");

    await prisma.employeeProvision.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("DELETE /onboarding/[employeeId]/provisions/[id] error:", error);
    return internalError();
  }
});
