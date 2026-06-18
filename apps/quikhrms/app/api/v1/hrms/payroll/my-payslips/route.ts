import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError, notFound } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";

function fyBounds(fy: string): { start: Date; end: Date } {
  const [s] = fy.split("-");
  const y = Number(s);
  return { start: new Date(`${y}-04-01`), end: new Date(`${y + 1}-03-31`) };
}

export const GET = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return notFound("Employee record not found");

    const url = new URL(req.url);
    const fy = url.searchParams.get("fy");
    const where: Record<string, unknown> = {
      orgId, employeeId, deletedAt: null,
      status: { in: ["Released", "Generated"] },
    };
    if (fy) {
      const { start, end } = fyBounds(fy);
      where.periodStart = { gte: start, lte: end };
    }

    const payslips = await prisma.payslip.findMany({
      where,
      include: { payRun: { select: { payDate: true, status: true } } },
      orderBy: { periodStart: "desc" },
    });

    // Aggregate YTD totals
    const totals = {
      grossEarnings: 0,
      totalDeductions: 0,
      netPay: 0,
      tdsDeducted: 0,
      epfEmployee: 0,
      months: payslips.length,
    };

    if (fy) {
      const ids = payslips.map((p) => p.id);
      if (ids.length > 0) {
        const lines = await prisma.payslipLine.findMany({
          where: { orgId, payslipId: { in: ids }, category: { in: ["IncomeTax", "EPFEmployee"] } },
        });
        for (const l of lines) {
          if (l.category === "IncomeTax") totals.tdsDeducted += Number(l.amount);
          if (l.category === "EPFEmployee") totals.epfEmployee += Number(l.amount);
        }
      }
      for (const p of payslips) {
        totals.grossEarnings += Number(p.grossEarnings);
        totals.totalDeductions += Number(p.totalDeductions);
        totals.netPay += Number(p.netPay);
      }
    }

    return successResponse({ payslips, totals });
  } catch (e) {
    console.error("GET /payroll/my-payslips error:", e);
    return internalError();
  }
});
