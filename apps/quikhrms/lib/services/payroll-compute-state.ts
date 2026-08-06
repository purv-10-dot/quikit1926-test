import { prisma } from "@/lib/prisma";

/**
 * Transient compute job state — persisted on the PayRun row itself
 * (compute* columns). Lifecycle: queued → running → done | failed.
 *
 * Was a separate PayrollComputeState table (1:1, keyed by PayRun id); folded
 * into PayRun. `computeStatus = null` means no compute has been run/queued, so
 * getPayrollComputeState() returns null (preserving the old "no row" semantics).
 */
type ComputeJobStatus = "queued" | "running" | "done" | "failed";

export interface PayrollComputeState {
  status: ComputeJobStatus;
  runId: string;
  orgId: string;
  startedAt?: string;
  finishedAt?: string;
  employeeCount?: number;
  totalGross?: number;
  totalNet?: number;
  totalDeductions?: number;
  error?: string;
}

const computeSelect = {
  id: true,
  orgId: true,
  computeStatus: true,
  computeStartedAt: true,
  computeFinishedAt: true,
  computeEmployeeCount: true,
  computeTotalGross: true,
  computeTotalNet: true,
  computeTotalDeductions: true,
  computeError: true,
} as const;

interface ComputeStateRow {
  id: string;
  orgId: string;
  computeStatus: string | null;
  computeStartedAt: Date | null;
  computeFinishedAt: Date | null;
  computeEmployeeCount: number | null;
  computeTotalGross: number | null;
  computeTotalNet: number | null;
  computeTotalDeductions: number | null;
  computeError: string | null;
}

function toState(row: ComputeStateRow): PayrollComputeState {
  return {
    status: (row.computeStatus ?? "queued") as ComputeJobStatus,
    runId: row.id,
    orgId: row.orgId,
    startedAt: row.computeStartedAt?.toISOString(),
    finishedAt: row.computeFinishedAt?.toISOString(),
    employeeCount: row.computeEmployeeCount ?? undefined,
    totalGross: row.computeTotalGross ?? undefined,
    totalNet: row.computeTotalNet ?? undefined,
    totalDeductions: row.computeTotalDeductions ?? undefined,
    error: row.computeError ?? undefined,
  };
}

export async function setPayrollComputeState(
  orgId: string,
  runId: string,
  partial: Partial<PayrollComputeState>,
): Promise<PayrollComputeState> {
  // Only fields present on `partial` are written; `undefined` is skipped by
  // Prisma, so this behaves like the old merge-into-existing semantics.
  const row = await prisma.payRun.update({
    where: { id: runId },
    data: {
      ...(partial.status ? { computeStatus: partial.status } : {}),
      computeStartedAt: partial.startedAt ? new Date(partial.startedAt) : undefined,
      computeFinishedAt: partial.finishedAt ? new Date(partial.finishedAt) : undefined,
      computeEmployeeCount: partial.employeeCount,
      computeTotalGross: partial.totalGross,
      computeTotalNet: partial.totalNet,
      computeTotalDeductions: partial.totalDeductions,
      computeError: partial.error,
    },
    select: computeSelect,
  });
  return toState(row);
}

export async function getPayrollComputeState(
  orgId: string,
  runId: string,
): Promise<PayrollComputeState | null> {
  const row = await prisma.payRun.findFirst({
    where: { id: runId, orgId },
    select: computeSelect,
  });
  // No compute has ever been queued/run for this PayRun → behave like "no row".
  if (!row || row.computeStatus === null) return null;
  return toState(row);
}
