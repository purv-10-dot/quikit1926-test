import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { Prisma } from "@quikit/database";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const groupBy = searchParams.get("groupBy") ?? "category";

    const where: Prisma.ExpenseClaimWhereInput = {
      orgId, deletedAt: null,
      ...(from || to ? {
        expenseDate: {
          ...(from && { gte: new Date(from) }),
          ...(to && { lte: new Date(to) }),
        },
      } : {}),
    };

    const [byCategory, byStatus, byMonth, totals] = await Promise.all([
      prisma.expenseClaim.groupBy({
        by: ["category"], where, _count: true, _sum: { totalAmount: true },
      }),
      prisma.expenseClaim.groupBy({
        by: ["status"], where, _count: true, _sum: { totalAmount: true },
      }),
      prisma.$queryRaw<Array<{ month: string; total: number; count: bigint }>>`
        SELECT TO_CHAR("expenseDate", 'YYYY-MM') AS month,
               SUM("totalAmount")::float AS total,
               COUNT(*) AS count
        FROM "app_quikhrms"."ExpenseClaim"
        WHERE "orgId" = ${orgId}
          AND "deletedAt" IS NULL
          AND "expenseDate" IS NOT NULL
          ${from ? Prisma.sql`AND "expenseDate" >= ${new Date(from)}` : Prisma.empty}
          ${to ? Prisma.sql`AND "expenseDate" <= ${new Date(to)}` : Prisma.empty}
        GROUP BY month
        ORDER BY month DESC
        LIMIT 12
      `,
      prisma.expenseClaim.aggregate({
        where, _count: true, _sum: { totalAmount: true },
        _avg: { totalAmount: true },
      }),
    ]);

    const byMonthSerialized = byMonth.map((m) => ({ ...m, count: Number(m.count) }));

    return successResponse({
      groupBy,
      totals: {
        claims: totals._count,
        totalAmount: Number(totals._sum.totalAmount ?? 0),
        avgAmount: Number(totals._avg.totalAmount ?? 0),
      },
      byCategory: byCategory.map((c) => ({ category: c.category, count: c._count, total: Number(c._sum.totalAmount ?? 0) })),
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count, total: Number(s._sum.totalAmount ?? 0) })),
      byMonth: byMonthSerialized,
    });
  } catch (error) {
    console.error("GET /expenses/reports error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.expense.read"] });
