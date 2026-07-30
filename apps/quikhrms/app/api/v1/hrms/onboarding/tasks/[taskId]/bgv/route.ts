import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";

// HR / vendor sets a Background Verification check to Clear / Discrepancy / Pending.
// The BGV step completes only when EVERY configured check is Clear.
export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const task = await prisma.onboardingTask.findFirst({ where: { id: params.taskId, orgId } });
    if (!task) return notFound("Task not found");
    if (task.stepType !== "BGV") return validationError("This step is not a Background Verification step.");

    const body = await req.json().catch(() => ({}));
    const check = String(body?.check ?? "");
    const status = body?.status as "clear" | "discrepancy" | "pending" | undefined;
    if (!check || !status || !["clear", "discrepancy", "pending"].includes(status)) {
      return validationError("Provide a check and a status (clear / discrepancy / pending).");
    }

    const config = (task.config ?? {}) as Record<string, unknown>;
    const checks = Array.isArray(config.bgvChecks) ? (config.bgvChecks as string[]) : [];
    if (checks.length && !checks.includes(check)) return validationError("Unknown check.");
    const bgvStatus = { ...((config.bgvStatus ?? {}) as Record<string, string>) };
    bgvStatus[check] = status;

    const allClear = checks.length > 0 && checks.every((c) => bgvStatus[c] === "clear");
    const anyDiscrepancy = checks.some((c) => bgvStatus[c] === "discrepancy");

    await prisma.onboardingTask.update({
      where: { id: task.id },
      data: {
        config: JSON.parse(JSON.stringify({ ...config, bgvStatus })),
        status: allClear ? "TaskCompleted" : anyDiscrepancy ? "TaskBlocked" : "TaskInProgress",
        ...(allClear ? { completedAt: new Date(), completedBy: userId } : {}),
      },
    });

    return successResponse({ check, status, allClear, anyDiscrepancy });
  } catch (error) {
    console.error("POST /onboarding/tasks/[taskId]/bgv error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.onboarding.write"] });
