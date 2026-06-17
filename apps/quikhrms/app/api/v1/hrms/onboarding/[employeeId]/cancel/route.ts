import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, conflict, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const { employeeId } = params;
    const body = await req.json().catch(() => ({}));
    const reason = typeof body?.reason === "string" ? body.reason : undefined;

    const instance = await prisma.onboardingInstance.findFirst({
      where: { orgId, employeeId, deletedAt: null },
    });
    if (!instance) return notFound("Onboarding not found");
    if (instance.status === "OnboardCompleted") return conflict("Already completed, cannot cancel");
    if (instance.status === "OnboardCancelled") return conflict("Already cancelled");

    const updated = await prisma.onboardingInstance.update({
      where: { id: instance.id },
      data: {
        status: "OnboardCancelled",
        notes: reason ? `Cancelled: ${reason}` : (instance.notes ?? "Cancelled"),
        updatedBy: userId,
      },
    });

    await createAuditLog({
      orgId, userId, action: "StatusChange", entityType: "OnboardingInstance",
      entityId: instance.id, metadata: { to: "OnboardCancelled", reason },
    });

    return successResponse({ instance: updated });
  } catch (error) {
    console.error("POST /onboarding/[employeeId]/cancel error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.onboarding.write"] });
