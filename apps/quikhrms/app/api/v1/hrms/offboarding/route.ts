import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import type { Prisma } from "@quikit/database";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const status = searchParams.get("status");

    const where: Prisma.OffboardingInstanceWhereInput = {
      orgId,
      deletedAt: null,
      ...(status && { status: status as Prisma.EnumOffboardingStatusFilter["equals"] }),
    };

    const [instances, total, counts] = await Promise.all([
      prisma.offboardingInstance.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { tasks: true } },
        },
      }),
      prisma.offboardingInstance.count({ where }),
      prisma.offboardingInstance.groupBy({
        by: ["status"], where: { orgId, deletedAt: null }, _count: true,
      }),
    ]);

    return successResponse({ instances, counts }, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /offboarding error:", error);
    return internalError();
  }
});
