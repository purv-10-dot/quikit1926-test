import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, forbidden, internalError } from "@/lib/api-response";
import { resolveScope, employeeScopeFilter } from "@/lib/rbac/scope";
import { Prisma } from "@quikit/database";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId } = ctx;
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const groupBy = searchParams.get("groupBy") ?? "category";

    // Aggregates must never span beyond the caller's read-scope — a self/team
    // reader must not see org-wide totals.
    const scope = resolveScope(ctx, {
      all: "hrms.expense.read",
      team: "hrms.expense.read_team",
      self: "hrms.expense.read_self",
    });
    const sf = await employeeScopeFilter(ctx, scope);
    if (!sf.allow) return forbidden("No expense read permission");
    const empIds = sf.employeeIds; // undefined ⇒ unrestricted
    if (empIds && empIds.length === 0) {
      return successResponse({
        groupBy,
        totals: { claims: 0, totalAmount: 0, avgAmount: 0 },
        byCategory: [], byStatus: [], byMonth: [],
      });
    }

    const where: Prisma.ExpenseClaimWhereInput = {
      orgId, deletedAt: null,
      ...(empIds && { employeeId: { in: empIds } }),
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
          ${empIds ? Prisma.sql`AND "employeeId" IN (${Prisma.join(empIds)})` : Prisma.empty}
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
