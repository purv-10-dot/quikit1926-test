import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError, notFound, validationError, conflict } from "@/lib/api-response";
import { runBackground } from "@/lib/run-background";
import { runPayrollCompute, markPayrollComputeFailed } from "@/lib/jobs/run-payroll-compute";
import {
  getPayrollComputeState,
  setPayrollComputeState,
} from "@/lib/services/payroll-compute-state";

export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const run = await prisma.payRun.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!run) return notFound();
    if (run.status !== "Draft" && run.status !== "Processing") {
      return validationError(`Cannot compute a ${run.status} pay run`);
    }

    const existing = await getPayrollComputeState(orgId, id);
    if (existing && (existing.status === "queued" || existing.status === "running")) {
      return conflict(`Compute already ${existing.status} for this run`);
    }

    await setPayrollComputeState(orgId, id, {
      status: "queued",
      runId: id,
      orgId,
      startedAt: undefined,
      finishedAt: undefined,
      error: undefined,
    });

    // Compute in-process (no queue/worker). Returns immediately; the run computes
    // in the background and updates the PayRun compute* columns — the UI polls
    // GET .../compute/status for progress.
    runBackground(
      `payroll-compute:${id}`,
      () => runPayrollCompute({ orgId, userId, runId: id }),
      (err) => markPayrollComputeFailed(orgId, id, err),
    );

    return successResponse({ runId: id, status: "processing" }, undefined, 202);
  } catch (e) {
    console.error("POST /payroll/runs/[id]/compute error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
