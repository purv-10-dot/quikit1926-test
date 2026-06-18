import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updateGradeSchema } from "@/lib/validations/organization";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const grade = await prisma.grade.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!grade) return notFound("Grade not found");
    return successResponse(grade);
  } catch (error) {
    console.error("GET /grades/:id error:", error);
    return internalError();
  }
});

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.grade.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Grade not found");

    const body = await req.json();
    const parsed = updateGradeSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const grade = await prisma.grade.update({
      where: { id: params.id },
      data: { ...parsed.data, updatedBy: userId },
    });
    return successResponse(grade);
  } catch (error) {
    console.error("PATCH /grades/:id error:", error);
    return internalError();
  }
});

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.grade.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Grade not found");

    await prisma.grade.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("DELETE /grades/:id error:", error);
    return internalError();
  }
});
