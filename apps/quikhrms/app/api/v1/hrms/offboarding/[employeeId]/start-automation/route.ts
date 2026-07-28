import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";
import { setAutomated, advanceAutomation } from "@/lib/services/offboarding-automation";

// POST /offboarding/:employeeId/start-automation  { enabled?: boolean }
// Turns the "Start offboarding" completion-chained automation on (default) / off.
export const POST = withAuth(async (req: NextRequest, { orgId }, params) => {
  try {
    const body = await req.json().catch(() => ({}));
    const enabled = body?.enabled !== false;

    const instance = await prisma.offboardingInstance.findFirst({
      where: { orgId, employeeId: params.employeeId, deletedAt: null },
      select: { id: true },
    });
    if (!instance) return notFound("Offboarding not found");

    await setAutomated(instance.id, orgId, enabled);
    if (enabled) await advanceAutomation(instance.id, orgId);

    return successResponse({ automated: enabled });
  } catch (error) {
    console.error("POST /offboarding/[employeeId]/start-automation error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.offboarding.write"] });
