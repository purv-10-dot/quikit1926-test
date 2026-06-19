import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updateDesignationSchema } from "@/lib/validations/organization";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const designation = await prisma.designation.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: { department: { select: { id: true, name: true } } },
    });
    if (!designation) return notFound("Designation not found");
    return successResponse(designation);
  } catch (error) {
    console.error("GET /designations/:id error:", error);
    return internalError();
  }
});

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.designation.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Designation not found");

    const body = await req.json();
    const parsed = updateDesignationSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const designation = await prisma.designation.update({
      where: { id: params.id },
      data: { ...parsed.data, updatedBy: userId },
    });
    return successResponse(designation);
  } catch (error) {
    console.error("PATCH /designations/:id error:", error);
    return internalError();
  }
});

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.designation.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Designation not found");

    await prisma.designation.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("DELETE /designations/:id error:", error);
    return internalError();
  }
});
