import { prisma } from "@/lib/prisma";

export interface PolicySnapshot {
  policyId: string;
  name: string;
  category: string;
  maxPerTransaction: number | null;
  maxPerMonth: number | null;
  maxPerYear: number | null;
  requiresReceipt: boolean;
  receiptThreshold: number;
  requiresPreApproval: boolean;
  approvalLevels: number;
  approvalChain: unknown;
  snapshotAt: string;
}

export async function buildPolicySnapshot(orgId: string, policyId: string): Promise<PolicySnapshot | null> {
  const policy = await prisma.expensePolicy.findFirst({
    where: { id: policyId, orgId, deletedAt: null },
  });
  if (!policy) return null;
  return {
    policyId: policy.id,
    name: policy.name,
    category: policy.category,
    maxPerTransaction: policy.maxPerTransaction != null ? Number(policy.maxPerTransaction) : null,
    maxPerMonth: policy.maxPerMonth != null ? Number(policy.maxPerMonth) : null,
    maxPerYear: policy.maxPerYear != null ? Number(policy.maxPerYear) : null,
    requiresReceipt: policy.requiresReceipt,
    receiptThreshold: Number(policy.receiptThreshold),
    requiresPreApproval: policy.requiresPreApproval,
    approvalLevels: policy.approvalLevels,
    approvalChain: policy.approvalChain ?? null,
    snapshotAt: new Date().toISOString(),
  };
}

export async function validateAgainstSnapshot(
  orgId: string,
  snap: PolicySnapshot,
  employeeId: string,
  amount: number,
  date: Date,
  receiptUrl: string | null,
): Promise<{ ok: boolean; violations: string[] }> {
  const violations: string[] = [];
  if (snap.maxPerTransaction != null && amount > snap.maxPerTransaction) {
    violations.push(`Exceeds per-transaction limit (${snap.maxPerTransaction})`);
  }
  if (snap.requiresReceipt && amount > snap.receiptThreshold && !receiptUrl) {
    violations.push(`Receipt required for amounts above ${snap.receiptThreshold}`);
  }
  if (snap.maxPerMonth != null) {
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    const monthTotal = await prisma.expenseClaim.aggregate({
      where: {
        orgId, employeeId, policyId: snap.policyId, deletedAt: null,
        status: { in: ["Submitted", "ManagerApproved", "FinanceApproved", "Approved", "Paid"] },
        expenseDate: { gte: monthStart, lte: monthEnd },
      },
      _sum: { totalAmount: true },
    });
    const used = Number(monthTotal._sum.totalAmount ?? 0);
    if (used + amount > snap.maxPerMonth) {
      violations.push(`Exceeds monthly limit (used ${used}, limit ${snap.maxPerMonth})`);
    }
  }
  if (snap.maxPerYear != null) {
    const yearStart = new Date(date.getFullYear(), 0, 1);
    const yearEnd = new Date(date.getFullYear(), 11, 31);
    const yearTotal = await prisma.expenseClaim.aggregate({
      where: {
        orgId, employeeId, policyId: snap.policyId, deletedAt: null,
        status: { in: ["Submitted", "ManagerApproved", "FinanceApproved", "Approved", "Paid"] },
        expenseDate: { gte: yearStart, lte: yearEnd },
      },
      _sum: { totalAmount: true },
    });
    const used = Number(yearTotal._sum.totalAmount ?? 0);
    if (used + amount > snap.maxPerYear) {
      violations.push(`Exceeds yearly limit (used ${used}, limit ${snap.maxPerYear})`);
    }
  }
  return { ok: violations.length === 0, violations };
}

export async function validateAgainstPolicy(
  orgId: string,
  policyId: string,
  employeeId: string,
  amount: number,
  date: Date,
): Promise<{ ok: boolean; violations: string[] }> {
  const policy = await prisma.expensePolicy.findFirst({
    where: { id: policyId, orgId, deletedAt: null, isActive: true },
  });

  if (!policy) return { ok: false, violations: ["Policy not found or inactive"] };

  const violations: string[] = [];

  if (policy.maxPerTransaction && amount > Number(policy.maxPerTransaction)) {
    violations.push(`Exceeds per-transaction limit (${policy.maxPerTransaction})`);
  }

  if (policy.maxPerMonth) {
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    const monthTotal = await prisma.expenseClaim.aggregate({
      where: {
        orgId, employeeId, policyId, deletedAt: null,
        status: { in: ["Submitted", "ManagerApproved", "FinanceApproved", "Approved", "Paid"] },
        expenseDate: { gte: monthStart, lte: monthEnd },
      },
      _sum: { totalAmount: true },
    });
    const used = Number(monthTotal._sum.totalAmount ?? 0);
    if (used + amount > Number(policy.maxPerMonth)) {
      violations.push(`Exceeds monthly limit (used ${used}, limit ${policy.maxPerMonth})`);
    }
  }

  if (policy.maxPerYear) {
    const yearStart = new Date(date.getFullYear(), 0, 1);
    const yearEnd = new Date(date.getFullYear(), 11, 31);
    const yearTotal = await prisma.expenseClaim.aggregate({
      where: {
        orgId, employeeId, policyId, deletedAt: null,
        status: { in: ["Submitted", "ManagerApproved", "FinanceApproved", "Approved", "Paid"] },
        expenseDate: { gte: yearStart, lte: yearEnd },
      },
      _sum: { totalAmount: true },
    });
    const used = Number(yearTotal._sum.totalAmount ?? 0);
    if (used + amount > Number(policy.maxPerYear)) {
      violations.push(`Exceeds yearly limit (used ${used}, limit ${policy.maxPerYear})`);
    }
  }

  return { ok: violations.length === 0, violations };
}

export function nextStatusAfterApproval(
  currentStatus: string,
  action: "ExpApproved" | "ExpRejected" | "Escalated",
  currentLevel: number,
  totalLevels: number,
): string {
  if (action === "ExpRejected") return "Rejected";
  if (action === "Escalated") return currentStatus;

  if (currentLevel >= totalLevels) return "Approved";
  if (currentLevel === 1 && totalLevels >= 2) return "ManagerApproved";
  if (currentLevel === 2) return "FinanceApproved";
  return currentStatus;
}
