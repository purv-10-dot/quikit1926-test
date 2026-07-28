import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createReviewFormSchema } from "@/lib/validations/performance";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const where = { orgId, deletedAt: null };
    const [forms, total] = await Promise.all([
      prisma.reviewForm.findMany({ where, orderBy: { name: "asc" }, skip: (page - 1) * limit, take: limit }),
      prisma.reviewForm.count({ where }),
    ]);
    return successResponse(forms, paginationMeta(page, limit, total));
  } catch (error) { console.error("GET /review-forms error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.performance.appraise"] });

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createReviewFormSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const form = await prisma.reviewForm.create({
      data: { orgId, name: parsed.data.name, sections: JSON.parse(JSON.stringify(parsed.data.sections)), createdBy: userId, updatedBy: userId },
    });
    return successResponse(form, undefined, 201);
  } catch (error) { console.error("POST /review-forms error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.performance.appraise"] });
