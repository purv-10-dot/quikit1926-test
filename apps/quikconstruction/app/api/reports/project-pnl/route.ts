import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("reports");

/**
 * GET /api/reports/project-pnl
 *
 * Revenue = Σ CnClientInvoice.total (non-cancelled) per project.
 * Costs split into 4 buckets:
 *   billsCost     — Σ CnVendorBill.total
 *   materialsCost — Σ ledger.amount where transactionType='dpr_consumption'
 *   expensesCost  — Σ CnExpense.amount
 *   labourCost    — attendance-weighted allocation of finalized payroll line basicAmount
 *
 * Labour distribution:
 *   For each payroll line (employee × run), pull that employee's attendance
 *   rows within the run's period. Group by projectId → daysPerProject.
 *   Allocate `basicAmount × daysPerProject / totalPaidDays` to each project.
 *   Attendance rows with null projectId → not allocated to any project.
 */
export const GET = withTenantAuth(async ({ tenantId }) => {
  const [projects, invoices, bills, consumption, expenses, finalizedPayrolls] = await Promise.all([
    db.cnProject.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, code: true, name: true, status: true, projectValue: true },
      orderBy: { code: "asc" },
    }),
    db.cnClientInvoice.findMany({
      where: { tenantId, deletedAt: null, status: { not: "cancelled" } },
      select: { projectId: true, total: true, paidAmount: true },
    }),
    db.cnVendorBill.findMany({
      where: { tenantId, deletedAt: null, status: { not: "cancelled" } },
      select: { projectId: true, total: true, paidAmount: true },
    }),
    db.cnStockLedger.groupBy({
      by: ["projectId"],
      where: { tenantId, transactionType: "dpr_consumption" },
      _sum: { amount: true },
    }),
    db.cnExpense.groupBy({
      by: ["projectId"],
      where: { tenantId, deletedAt: null, status: { not: "cancelled" } },
      _sum: { amount: true },
    }),
    db.cnPayroll.findMany({
      where: { tenantId, deletedAt: null, status: { in: ["finalized", "paid"] } },
      select: { id: true, periodStart: true, periodEnd: true, lines: { select: { employeeId: true, basicAmount: true } } },
    }),
  ]);

  // Compute labour cost per project via attendance distribution
  const labourByProject = new Map<string, number>();
  for (const payroll of finalizedPayrolls) {
    const empIds = payroll.lines.map(l => l.employeeId);
    const attendance = await db.cnAttendance.findMany({
      where: {
        tenantId,
        employeeId: { in: empIds },
        date: { gte: payroll.periodStart, lte: payroll.periodEnd },
        status: { in: ["P", "HD"] },
      },
      select: { employeeId: true, projectId: true, status: true },
    });
    for (const line of payroll.lines) {
      const rows = attendance.filter(a => a.employeeId === line.employeeId);
      // total weighted days (P=1, HD=0.5), across all attendance rows — denominator
      const totalDays = rows.reduce((s, r) => s + (r.status === "P" ? 1 : 0.5), 0);
      if (totalDays <= 0) continue;
      // per-project days
      const perProject = new Map<string, number>();
      for (const r of rows) {
        if (!r.projectId) continue;
        const w = r.status === "P" ? 1 : 0.5;
        perProject.set(r.projectId, (perProject.get(r.projectId) ?? 0) + w);
      }
      const basic = Number(line.basicAmount);
      for (const [projectId, days] of perProject) {
        const share = basic * (days / totalDays);
        labourByProject.set(projectId, (labourByProject.get(projectId) ?? 0) + share);
      }
    }
  }

  const rows = projects.map(p => {
    const rev = invoices.filter(i => i.projectId === p.id).reduce((s, i) => s + Number(i.total), 0);
    const revPaid = invoices.filter(i => i.projectId === p.id).reduce((s, i) => s + Number(i.paidAmount), 0);
    const billsCost = bills.filter(b => b.projectId === p.id).reduce((s, b) => s + Number(b.total), 0);
    const billsPaid = bills.filter(b => b.projectId === p.id).reduce((s, b) => s + Number(b.paidAmount), 0);
    const materialsCost = Number(consumption.find(c => c.projectId === p.id)?._sum.amount ?? 0);
    const expensesCost = Number(expenses.find(e => e.projectId === p.id)?._sum.amount ?? 0);
    const labourCost = labourByProject.get(p.id) ?? 0;
    const totalCost = billsCost + materialsCost + expensesCost + labourCost;
    return {
      projectId: p.id, code: p.code, name: p.name, status: p.status,
      value: p.projectValue ? Number(p.projectValue) : null,
      revenue: rev, revenuePaid: revPaid,
      billsCost, billsPaid,
      materialsCost, expensesCost, labourCost,
      totalCost,
      margin: rev - totalCost,
      marginPct: rev > 0 ? ((rev - totalCost) / rev) * 100 : 0,
    };
  });

  return NextResponse.json({ success: true, data: rows });
});
