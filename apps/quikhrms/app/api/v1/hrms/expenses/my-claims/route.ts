import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import type { Prisma } from "@quikit/database";

export const GET = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const status = searchParams.get("status");

    const where: Prisma.ExpenseClaimWhereInput = {
      orgId, employeeId: userId, deletedAt: null,
      ...(status && { status: status as Prisma.EnumExpenseClaimStatusFilter["equals"] }),
    };

    const [claims, total, summary] = await Promise.all([
      prisma.expenseClaim.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
        include: { policy: { select: { id: true, name: true } } },
      }),
      prisma.expenseClaim.count({ where }),
      prisma.expenseClaim.groupBy({
        by: ["status"],
        where: { orgId, employeeId: userId, deletedAt: null },
        _count: true,
        _sum: { totalAmount: true },
      }),
    ]);

    return successResponse({ claims, summary }, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /expenses/my-claims error:", error);
    return internalError();
  }
});
