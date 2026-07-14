import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createDesignationSchema } from "@/lib/validations/organization";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit, sort, order } = parsePagination(searchParams);
    const search = searchParams.get("search");

    const where = {
      orgId,
      deletedAt: null,
      ...(search && { title: { contains: search, mode: "insensitive" as const } }),
    };

    const [designations, total] = await Promise.all([
      prisma.designation.findMany({
        where,
        orderBy: sort ? { [sort]: order } : { level: "asc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          department: { select: { id: true, name: true } },
          _count: { select: { employees: { where: { deletedAt: null } } } },
        },
      }),
      prisma.designation.count({ where }),
    ]);

    return successResponse(designations, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /designations error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createDesignationSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const designation = await prisma.designation.create({
      data: { orgId, ...parsed.data, createdBy: userId, updatedBy: userId },
    });
    return successResponse(designation, undefined, 201);
  } catch (error) {
    console.error("POST /designations error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.org.write"] });
