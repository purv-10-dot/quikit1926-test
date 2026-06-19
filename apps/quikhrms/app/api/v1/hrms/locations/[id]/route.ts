import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updateOfficeLocationSchema } from "@/lib/validations/organization";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const location = await prisma.officeLocation.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: { _count: { select: { employees: { where: { deletedAt: null } } } } },
    });
    if (!location) return notFound("Location not found");
    return successResponse(location);
  } catch (error) {
    console.error("GET /locations/:id error:", error);
    return internalError();
  }
});

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.officeLocation.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Location not found");

    const body = await req.json();
    const parsed = updateOfficeLocationSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const location = await prisma.officeLocation.update({
      where: { id: params.id },
      data: { ...parsed.data, updatedBy: userId },
    });
    return successResponse(location);
  } catch (error) {
    console.error("PATCH /locations/:id error:", error);
    return internalError();
  }
});

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.officeLocation.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Location not found");

    await prisma.officeLocation.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("DELETE /locations/:id error:", error);
    return internalError();
  }
});
