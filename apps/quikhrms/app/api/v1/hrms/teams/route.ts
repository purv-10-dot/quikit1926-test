import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createTeamSchema } from "@/lib/validations/organization";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit, sort, order } = parsePagination(searchParams);
    const search = searchParams.get("search");
    const departmentId = searchParams.get("departmentId");

    const where = {
      orgId,
      deletedAt: null,
      ...(search && { name: { contains: search, mode: "insensitive" as const } }),
      ...(departmentId && { departmentId }),
    };

    const [teams, total] = await Promise.all([
      prisma.hrmsTeam.findMany({
        where,
        orderBy: sort ? { [sort]: order } : { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          department: { select: { id: true, name: true } },
          lead: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
          _count: { select: { employees: { where: { deletedAt: null } } } },
        },
      }),
      prisma.hrmsTeam.count({ where }),
    ]);

    return successResponse(teams, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /teams error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createTeamSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const team = await prisma.hrmsTeam.create({
      data: { orgId, ...parsed.data, createdBy: userId, updatedBy: userId },
      include: {
        department: { select: { id: true, name: true } },
        lead: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return successResponse(team, undefined, 201);
  } catch (error) {
    console.error("POST /teams error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.org.write"] });
