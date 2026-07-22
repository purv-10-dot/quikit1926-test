import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { sendExitInterviewInvite } from "@/lib/services/exit-interview-service";
import { createAuditLog } from "@/lib/utils/audit";

// POST /offboarding/:employeeId/exit-interview/send — emails the departing
// employee a link to self-fill the exit interview.
export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const instance = await prisma.offboardingInstance.findFirst({
      where: { orgId, employeeId: params.employeeId, deletedAt: null },
      select: { id: true },
    });
    if (!instance) return notFound("Offboarding not found");

    const result = await sendExitInterviewInvite(orgId, instance.id);
    if (!result.sent) return validationError(result.reason ?? "Could not send exit interview");

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "OffboardingInstance", entityId: instance.id,
      metadata: { action: "ExitInterviewSent", to: result.to },
    });
    return successResponse({ sent: true, to: result.to });
  } catch (error) {
    console.error("POST /offboarding/:employeeId/exit-interview/send error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.offboarding.write"] });
