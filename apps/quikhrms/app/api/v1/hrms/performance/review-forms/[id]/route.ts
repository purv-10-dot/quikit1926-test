import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updateReviewFormSchema } from "@/lib/validations/performance";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const form = await prisma.reviewForm.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!form) return notFound("Review form not found");
    return successResponse(form);
  } catch (error) { console.error("GET /review-forms/:id error:", error); return internalError(); }
});

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.reviewForm.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Review form not found");
    const body = await req.json();
    const parsed = updateReviewFormSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const { sections, ...rest } = parsed.data;
    const form = await prisma.reviewForm.update({
      where: { id: params.id },
      data: { ...rest, ...(sections && { sections: JSON.parse(JSON.stringify(sections)) }), updatedBy: userId },
    });
    return successResponse(form);
  } catch (error) { console.error("PATCH /review-forms/:id error:", error); return internalError(); }
});

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.reviewForm.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Review form not found");
    await prisma.reviewForm.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
    return successResponse({ deleted: true });
  } catch (error) { console.error("DELETE /review-forms/:id error:", error); return internalError(); }
});
