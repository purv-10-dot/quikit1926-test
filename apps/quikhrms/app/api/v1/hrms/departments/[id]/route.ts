import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updateDepartmentSchema } from "@/lib/validations/organization";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const department = await prisma.department.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        head: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
        parentDepartment: { select: { id: true, name: true } },
        childDepartments: { where: { deletedAt: null }, select: { id: true, name: true, code: true } },
        teams: { where: { deletedAt: null }, select: { id: true, name: true } },
        _count: { select: { employees: { where: { deletedAt: null } } } },
      },
    });
    if (!department) return notFound("Department not found");
    return successResponse(department);
  } catch (error) {
    console.error("GET /departments/:id error:", error);
    return internalError();
  }
});

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.department.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Department not found");

    const body = await req.json();
    const parsed = updateDepartmentSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const department = await prisma.department.update({
      where: { id: params.id },
      data: { ...parsed.data, updatedBy: userId },
    });
    return successResponse(department);
  } catch (error) {
    console.error("PATCH /departments/:id error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.org.write"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.department.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Department not found");

    await prisma.department.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("DELETE /departments/:id error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.org.write"] });
