import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError, notFound } from "@/lib/api-response";
import { getPayrollComputeState } from "@/lib/services/payroll-compute-state";

export const GET = withAuth(async (_req: NextRequest, { orgId }, { id }) => {
  try {
    const run = await prisma.payRun.findFirst({
      where: { id, orgId, deletedAt: null },
      select: { id: true, status: true, employeeCount: true, totalGross: true, totalNet: true, totalDeductions: true },
    });
    if (!run) return notFound();

    const state = await getPayrollComputeState(orgId, id);
    return successResponse({
      runId: id,
      runStatus: run.status,
      compute: state ?? { status: "idle" },
      employeeCount: run.employeeCount,
      totalGross: run.totalGross,
      totalNet: run.totalNet,
      totalDeductions: run.totalDeductions,
    });
  } catch (e) {
    console.error("GET /payroll/runs/[id]/compute/status error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.read"] });
