import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { sendStepRequest } from "@/lib/services/offboarding-automation";

const ACTION_STEP_TYPES = new Set(["CustomTask", "AssetReturn", "AccessRevoke", "KnowledgeTransfer", "Clearance"]);

// HR clicks "Send to assignee(s)" on an offboarding step → emails every assigned
// employee (they open the app and mark it done). Marks the task In Progress.
export const POST = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string; instanceId: string; title: string; status: string; stepType: string | null; config: Record<string, unknown> | null }>>`
      SELECT id, "instanceId", title, status, "stepType", config FROM "app_quikhrms"."OffboardingTask" WHERE id = ${params.taskId} AND "orgId" = ${orgId} LIMIT 1`;
    const task = rows[0];
    if (!task) return notFound("Task not found");
    if (!ACTION_STEP_TYPES.has(task.stepType ?? "CustomTask")) return validationError("This step can't be sent to an assignee.");

    const cfg = (task.config ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(cfg.assignEmployeeIds) ? (cfg.assignEmployeeIds as string[]).filter(Boolean) : (cfg.assignEmployeeId ? [cfg.assignEmployeeId as string] : []);
    if (!ids.length) return validationError("No employees are assigned to this step.");

    await sendStepRequest(task, orgId); // emails assignees + marks In Progress
    return successResponse({ sent: ids.length });
  } catch (error) {
    console.error("POST /offboarding/tasks/[taskId]/notify-assignees error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.offboarding.write"] });
