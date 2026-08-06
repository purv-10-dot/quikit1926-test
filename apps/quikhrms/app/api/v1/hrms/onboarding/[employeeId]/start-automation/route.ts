import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";
import { setAutomated, advanceAutomation } from "@/lib/services/onboarding-automation";

// POST /onboarding/:employeeId/start-automation  { enabled?: boolean }
// Turns the "Start onboarding" completion-chained automation on (default) or off.
// On enable it kicks off the chain by sending the first sendable step's request.
export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const body = await req.json().catch(() => ({}));
    const enabled = body?.enabled !== false;

    const instance = await prisma.onboardingInstance.findFirst({
      where: { orgId, employeeId: params.employeeId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!instance) return notFound("Onboarding not found");

    await setAutomated(instance.id, orgId, enabled);

    if (enabled) {
      if (instance.status === "NotStarted") {
        await prisma.onboardingInstance.update({ where: { id: instance.id }, data: { status: "InProgress", updatedBy: userId } });
      }
      await advanceAutomation(instance.id, orgId);
    }

    return successResponse({ automated: enabled });
  } catch (error) {
    console.error("POST /onboarding/[employeeId]/start-automation error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.onboarding.write"] });
