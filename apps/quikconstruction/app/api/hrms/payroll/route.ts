import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { payrollRunSchema } from "@/lib/schemas/hrms";

const withOrgAuth = withOrgAuthForModule("hrms");

export const GET = withOrgAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const list = await db.cnPayroll.findMany({
    where: { orgId, deletedAt: includeDeleted ? { not: null } : null },
    include: { _count: { select: { lines: true } } },
    orderBy: { periodStart: "desc" },
  });
  return NextResponse.json({ success: true, data: list });
});

/**
 * POST /api/hrms/payroll — generate a payroll run from attendance.
 *
 * Algorithm (per employee):
 *   - daysPresent = count(status=P) + 0.5 * count(status=HD) in period
 *   - hoursWorked = sum(hoursWorked) in period
 *   - basicAmount:
 *       monthly → monthlyWage × (daysPresent / totalWorkingDays)
 *       daily   → daysPresent × dailyWage
 *       hourly  → hoursWorked × hourlyWage
 *   - deductions = 0 (extend later)
 *   - netAmount = basicAmount
 */
export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const input = payrollRunSchema.parse(await req.json());
  const dup = await db.cnPayroll.findFirst({ where: { orgId, runNumber: input.runNumber, deletedAt: null }, select: { id: true } });
  if (dup) return NextResponse.json({ success: false, error: `Run '${input.runNumber}' already exists` }, { status: 409 });

  const start = new Date(input.periodStart);
  const end = new Date(input.periodEnd);
  const msPerDay = 86400000;
  const workingDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / msPerDay) + 1);

  const employees = await db.cnEmployee.findMany({
    where: { orgId, deletedAt: null, status: "active" },
    select: { id: true, empType: true, monthlyWage: true, dailyWage: true, hourlyWage: true },
  });

  const attendance = await db.cnAttendance.findMany({
    where: { orgId, date: { gte: start, lte: end } },
    select: { employeeId: true, status: true, hoursWorked: true },
  });

  const lines: Array<{ employeeId: string; daysPresent: number; hoursWorked: number; basicAmount: number; deductions: number; netAmount: number; }> = [];

  for (const emp of employees) {
    const rows = attendance.filter(a => a.employeeId === emp.id);
    const daysPresent = rows.filter(r => r.status === "P").length + 0.5 * rows.filter(r => r.status === "HD").length;
    const hoursWorked = rows.reduce((s, r) => s + Number(r.hoursWorked ?? 0), 0);
    let basicAmount = 0;
    if (emp.empType === "permanent" && emp.monthlyWage) {
      basicAmount = Number(emp.monthlyWage) * (daysPresent / workingDays);
    } else if (emp.empType === "daily_wage" && emp.dailyWage) {
      basicAmount = daysPresent * Number(emp.dailyWage);
    } else if (emp.empType === "contract" && emp.hourlyWage) {
      basicAmount = hoursWorked * Number(emp.hourlyWage);
    }
    if (basicAmount <= 0 && daysPresent <= 0) continue;
    lines.push({ employeeId: emp.id, daysPresent, hoursWorked, basicAmount, deductions: 0, netAmount: basicAmount });
  }

  const totalGross = lines.reduce((s, l) => s + l.basicAmount, 0);
  const totalNet = lines.reduce((s, l) => s + l.netAmount, 0);

  const payroll = await db.cnPayroll.create({
    data: {
      orgId,
      runNumber: input.runNumber,
      periodStart: start,
      periodEnd: end,
      status: "draft",
      totalGross,
      totalNet,
      remarks: input.remarks ?? null,
      createdBy: userId,
      lines: { create: lines },
    },
    include: { lines: true },
  });

  return NextResponse.json({ success: true, data: payroll }, { status: 201 });
});
