import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createOfficeLocationSchema } from "@/lib/validations/organization";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit, sort, order } = parsePagination(searchParams);
    const search = searchParams.get("search");

    const where = {
      orgId,
      deletedAt: null,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { city: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [locations, total] = await Promise.all([
      prisma.officeLocation.findMany({
        where,
        orderBy: sort ? { [sort]: order } : { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { employees: { where: { deletedAt: null } } } },
        },
      }),
      prisma.officeLocation.count({ where }),
    ]);

    return successResponse(locations, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /locations error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createOfficeLocationSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const location = await prisma.officeLocation.create({
      data: { orgId, ...parsed.data, createdBy: userId, updatedBy: userId },
    });
    return successResponse(location, undefined, 201);
  } catch (error) {
    console.error("POST /locations error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.org.write"] });
