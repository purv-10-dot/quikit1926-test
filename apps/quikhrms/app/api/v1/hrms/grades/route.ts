import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createGradeSchema } from "@/lib/validations/organization";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit, sort, order } = parsePagination(searchParams);

    const where = { orgId, deletedAt: null };

    const [grades, total] = await Promise.all([
      prisma.grade.findMany({
        where,
        orderBy: sort ? { [sort]: order } : { level: "asc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { employees: { where: { deletedAt: null } } } } },
      }),
      prisma.grade.count({ where }),
    ]);

    return successResponse(grades, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /grades error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createGradeSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const grade = await prisma.grade.create({
      data: { orgId, ...parsed.data, createdBy: userId, updatedBy: userId },
    });
    return successResponse(grade, undefined, 201);
  } catch (error) {
    console.error("POST /grades error:", error);
    return internalError();
  }
});
