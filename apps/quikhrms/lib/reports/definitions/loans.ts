import { prisma } from "@/lib/prisma";
import type { ReportDefinition } from "../types";
import { fmtDate, fullName, num, dateRange } from "../format";
import { employeeBasics } from "../payroll-data";

const empSelect = { employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } } } as const;

export const loansReports: ReportDefinition[] = [
  {
    key: "loan-register",
    label: "Loan & Advance Register",
    description: "All employee loans/advances with principal, EMI, outstanding and status.",
    category: "Loans & Expenses",
    async run({ orgId }) {
      const loans = await prisma.employeeLoan.findMany({
        where: { orgId, deletedAt: null },
        orderBy: { createdAt: "desc" },
      });
      const empMap = await employeeBasics(orgId, loans.map((l) => l.employeeId));
      return {
        title: "Loan & Advance Register",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "loanType", label: "Type", width: 12 },
          { key: "principal", label: "Principal", width: 14, money: true },
          { key: "emi", label: "EMI", width: 12, money: true },
          { key: "outstanding", label: "Outstanding", width: 14, money: true },
          { key: "progress", label: "EMIs Paid", width: 12 },
          { key: "status", label: "Status", width: 12 },
          { key: "holdUntil", label: "On Hold Till", width: 14 },
        ],
        rows: loans.map((l) => {
          const e = empMap.get(l.employeeId);
          return {
          code: e?.employeeCode ?? "", name: fullName(e), loanType: l.loanType,
          principal: num(l.principalAmount), emi: num(l.emiAmount), outstanding: num(l.outstandingAmount),
          progress: `${l.emisPaid}/${l.tenureMonths}`, status: l.status, holdUntil: fmtDate(l.holdUntil),
          };
        }),
      };
    },
  },
  {
    key: "loan-emi-schedule",
    label: "Loan Repayment / EMI Schedule",
    description: "Recorded loan repayments including EMI deductions, prepayments and waivers.",
    category: "Loans & Expenses",
    usesDateRange: true,
    async run({ orgId, dateFrom, dateTo }) {
      const reps = await prisma.loanRepayment.findMany({
        where: { orgId, ...dateRange("repaidOn", dateFrom, dateTo) },
        orderBy: { repaidOn: "desc" },
        take: 20000,
      });
      const loanIds = [...new Set(reps.map((r) => r.loanId))];
      const loans = loanIds.length ? await prisma.employeeLoan.findMany({ where: { orgId, id: { in: loanIds } }, select: { id: true, employeeId: true, loanType: true } }) : [];
      const loanMap = new Map(loans.map((l) => [l.id, l]));
      const empMap = await employeeBasics(orgId, loans.map((l) => l.employeeId));
      return {
        title: "Loan Repayment / EMI Schedule",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "loanType", label: "Loan Type", width: 12 },
          { key: "amount", label: "Amount", width: 14, money: true },
          { key: "emiNumber", label: "EMI #", width: 8 },
          { key: "repaidOn", label: "Repaid On", width: 12 },
          { key: "manual", label: "Manual", width: 8 },
          { key: "notes", label: "Notes", width: 28 },
        ],
        rows: reps.map((r) => {
          const loan = loanMap.get(r.loanId);
          const e = loan ? empMap.get(loan.employeeId) : undefined;
          return {
            code: e?.employeeCode ?? "", name: fullName(e), loanType: loan?.loanType ?? "",
            amount: num(r.amount), emiNumber: r.emiNumber, repaidOn: fmtDate(r.repaidOn), manual: r.isManual ? "Yes" : "No", notes: r.notes ?? "",
          };
        }),
      };
    },
  },
  {
    key: "reimbursement",
    label: "Reimbursement Report",
    description: "Reimbursement claims by component with claimed/approved amounts and status.",
    category: "Loans & Expenses",
    usesDateRange: true,
    async run({ orgId, dateFrom, dateTo }) {
      const claims = await prisma.reimbursementClaim.findMany({
        where: { orgId, deletedAt: null, ...dateRange("billDate", dateFrom, dateTo) },
        orderBy: { billDate: "desc" },
        take: 10000,
      });
      const empMap = await employeeBasics(orgId, claims.map((c) => c.employeeId));
      return {
        title: "Reimbursement Report",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "component", label: "Component", width: 18 },
          { key: "billDate", label: "Bill Date", width: 12 },
          { key: "merchant", label: "Merchant", width: 18 },
          { key: "claimed", label: "Claimed", width: 12, money: true },
          { key: "approved", label: "Approved", width: 12, money: true },
          { key: "status", label: "Status", width: 12 },
        ],
        rows: claims.map((c) => {
          const e = empMap.get(c.employeeId);
          return {
            code: e?.employeeCode ?? "", name: fullName(e), component: c.componentName,
            billDate: fmtDate(c.billDate), merchant: c.merchantName ?? "", claimed: num(c.amountClaimed),
            approved: c.amountApproved == null ? "" : num(c.amountApproved), status: c.status,
          };
        }),
      };
    },
  },
  {
    key: "expense-claims",
    label: "Expense Claims Report",
    description: "Employee expense claims by category with amount and approval status.",
    category: "Loans & Expenses",
    usesDateRange: true,
    async run({ orgId, dateFrom, dateTo }) {
      const claims = await prisma.expenseClaim.findMany({
        where: { orgId, deletedAt: null, ...dateRange("expenseDate", dateFrom, dateTo) },
        include: { employee: { select: empSelect } },
        orderBy: { createdAt: "desc" },
        take: 10000,
      });
      return {
        title: "Expense Claims Report",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "category", label: "Category", width: 14 },
          { key: "title", label: "Title", width: 24 },
          { key: "amount", label: "Amount", width: 14, money: true },
          { key: "expenseDate", label: "Expense Date", width: 12 },
          { key: "status", label: "Status", width: 14 },
        ],
        rows: claims.map((c) => ({
          code: c.employee?.employeeCode ?? "", name: fullName(c.employee), category: c.category, title: c.title,
          amount: num(c.totalAmount), expenseDate: fmtDate(c.expenseDate), status: c.status,
        })),
      };
    },
  },
];
