import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withServiceAuth } from "@/lib/with-auth";
import { successResponse, internalError, notFound, validationError } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";

function fyBounds(fy: string): { start: Date; end: Date } {
  const [s] = fy.split("-");
  const y = Number(s);
  return { start: new Date(`${y}-04-01`), end: new Date(`${y + 1}-03-31`) };
}

export const GET = withServiceAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return notFound("Employee record not found");

    const url = new URL(req.url);
    const fy = url.searchParams.get("fy");
    const month = url.searchParams.get("month"); // "YYYY-MM" — single-month filter
    const where: Record<string, unknown> = {
      orgId, employeeId, deletedAt: null,
      status: { in: ["Released", "Generated"] },
    };
    if (month) {
      // Match by pay period, not payDate: the payslip whose period starts within
      // the requested calendar month. Takes precedence over `fy` when both given.
      const m = /^(\d{4})-(\d{2})$/.exec(month);
      if (!m) return validationError("month must be in YYYY-MM format");
      const y = Number(m[1]);
      const mon = Number(m[2]) - 1; // JS months are 0-based
      if (mon < 0 || mon > 11) return validationError("month must be 01–12");
      const start = new Date(y, mon, 1);
      const end = new Date(y, mon + 1, 0, 23, 59, 59, 999);
      where.periodStart = { gte: start, lte: end };
    } else if (fy) {
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
