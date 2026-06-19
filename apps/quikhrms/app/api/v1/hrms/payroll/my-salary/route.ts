import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError, notFound } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";

type AmountType = "Fixed" | "PercentOfBasic" | "PercentOfCTC" | "PercentOfGross" | "Formula";

function calcMonthly(amountType: AmountType, value: number, monthlyCTC: number, basicMonthly: number): number {
  switch (amountType) {
    case "Fixed": return value;
    case "PercentOfCTC": return (monthlyCTC * value) / 100;
    case "PercentOfBasic": return (basicMonthly * value) / 100;
    case "PercentOfGross": return (monthlyCTC * value) / 100;
    default: return 0;
  }
}

export const GET = withAuth(async (_req: NextRequest, { orgId, userId }) => {
  try {
    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return notFound("Employee record not found");

    const active = await prisma.employeeSalary.findFirst({
      where: { orgId, employeeId, deletedAt: null, isActive: true },
      include: {
        structure: {
          include: {
            components: {
              include: { component: true },
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
      orderBy: { effectiveFrom: "desc" },
    });

    if (!active) return successResponse(null);

    const ctc = Number(active.ctc);
    const monthlyCTC = ctc / 12;

    const compRows = (active.structure?.components ?? []).map((sc) => ({
      id: sc.id,
      componentId: sc.componentId,
      name: sc.component.name,
      code: sc.component.code,
      type: sc.component.type,
      category: sc.component.category,
      amountType: sc.amountType as AmountType,
      amountValue: sc.amountValue ? Number(sc.amountValue) : 0,
    }));

    const basicRow = compRows.find((r) => r.category === "Basic");
    const basicMonthly = basicRow ? calcMonthly(basicRow.amountType, basicRow.amountValue, monthlyCTC, 0) : 0;

    const computed = compRows.map((r) => {
      const monthly = calcMonthly(r.amountType, r.amountValue, monthlyCTC, basicMonthly);
      return { ...r, monthly, annual: monthly * 12 };
    });

    const earnings = computed.filter((r) => r.type === "Earning");
    const deductions = computed.filter((r) => r.type === "Deduction");
    const benefits = computed.filter((r) => r.type === "Benefit");

    const sumEarningsMonthly = earnings.reduce((s, r) => s + r.monthly, 0);
    const fixedAllowanceMonthly = Math.max(0, monthlyCTC - sumEarningsMonthly);

    return successResponse({
      ctc,
      currency: active.currency,
      effectiveFrom: active.effectiveFrom,
      effectiveTo: active.effectiveTo,
      structure: active.structure ? { id: active.structure.id, name: active.structure.name, code: active.structure.code } : null,
      monthlyCTC,
      fixedAllowanceMonthly,
      fixedAllowanceAnnual: fixedAllowanceMonthly * 12,
      earnings,
      deductions,
      benefits,
    });
  } catch (e) {
    console.error("GET /payroll/my-salary error:", e);
    return internalError();
  }
});
