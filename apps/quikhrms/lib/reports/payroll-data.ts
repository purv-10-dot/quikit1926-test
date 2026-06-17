import { prisma } from "@/lib/prisma";
import { dateRange } from "./format";
import type { ReportContext } from "./types";

export interface ScopedLine { componentCode: string; componentName: string; type: string; category: string; amount: unknown }
export interface ScopedEmployee {
  id: string; employeeCode: string; firstName: string; lastName: string;
  panNumber: string | null; uanNumber: string | null; pfAccountNumber: string | null; esiNumber: string | null;
  bankAccounts: unknown; department: { name: string } | null; designation: { title: string } | null;
}

/**
 * Resolve the payslips a payroll/statutory report should cover:
 *   filters.payRunId → that run; else date range on periodStart; else latest run.
 * Returns payslips (with lines) and an employee lookup map.
 */
export async function getScopedPayslips(ctx: ReportContext) {
  const { orgId, dateFrom, dateTo, filters } = ctx;
  const where: Record<string, unknown> = { orgId, deletedAt: null };
  const payRunId = filters?.payRunId as string | undefined;
  if (payRunId) where.payRunId = payRunId;
  else if (dateFrom || dateTo) Object.assign(where, dateRange("periodStart", dateFrom, dateTo));
  else {
    const latest = await prisma.payRun.findFirst({
      where: { orgId, deletedAt: null }, orderBy: { periodStart: "desc" }, select: { id: true },
    });
    if (!latest) return { payslips: [], empMap: new Map<string, ScopedEmployee>() };
    where.payRunId = latest.id;
  }

  const payslips = await prisma.payslip.findMany({
    where,
    include: { lines: { orderBy: { sortOrder: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
  const empIds = [...new Set(payslips.map((p) => p.employeeId))];
  const emps = empIds.length
    ? await prisma.employee.findMany({
        where: { orgId, id: { in: empIds } },
        select: {
          id: true, employeeCode: true, firstName: true, lastName: true,
          panNumber: true, uanNumber: true, pfAccountNumber: true, esiNumber: true,
          bankAccounts: true, department: { select: { name: true } }, designation: { select: { title: true } },
        },
      })
    : [];
  const empMap = new Map<string, ScopedEmployee>(emps.map((e) => [e.id, e as ScopedEmployee]));
  return { payslips, empMap };
}

export interface EmpBasic { id: string; employeeCode: string; firstName: string; lastName: string; department: { name: string } | null }

/** Lightweight id → {code, name, dept} map, shared across report definitions. */
export async function employeeBasics(orgId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map<string, EmpBasic>();
  const emps = await prisma.employee.findMany({
    where: { orgId, id: { in: unique } },
    select: { id: true, employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } } },
  });
  return new Map<string, EmpBasic>(emps.map((e) => [e.id, e as EmpBasic]));
}

export const lineByCode = (lines: ScopedLine[], code: string): number => {
  const l = lines.find((x) => x.componentCode === code);
  return l ? Number(l.amount) : 0;
};

export const sumByCategory = (lines: ScopedLine[], category: string): number =>
  lines.filter((l) => l.category === category).reduce((s, l) => s + Number(l.amount), 0);
