import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, conflict, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";
import { allocateProRataLeaveBalances } from "@/lib/services/leave-allocation";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const { employeeId } = params;
    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "true";

    const instance = await prisma.onboardingInstance.findFirst({
      where: { orgId, employeeId, deletedAt: null },
      include: { tasks: true },
    });
    if (!instance) return notFound("Onboarding not found");
    if (instance.status === "OnboardCompleted") return conflict("Already completed");

    const pendingMandatory = instance.tasks.filter(
      (t) => t.isMandatory && t.status !== "TaskCompleted" && t.status !== "TaskSkipped",
    );

    if (pendingMandatory.length > 0 && !force) {
      return conflict(`${pendingMandatory.length} mandatory tasks pending. Pass ?force=true to override.`);
    }

    const [updatedInstance, updatedEmployee] = await prisma.$transaction([
      prisma.onboardingInstance.update({
        where: { id: instance.id },
        data: { status: "OnboardCompleted", completedAt: new Date(), updatedBy: userId },
      }),
      prisma.employee.update({
        where: { id: employeeId },
        data: { status: "Active", inviteStatus: "Invited", updatedBy: userId },
      }),
    ]);

    if (updatedEmployee.dateOfJoining) {
      try {
        await allocateProRataLeaveBalances({
          orgId, userId, employeeId,
          dateOfJoining: updatedEmployee.dateOfJoining,
        });
      } catch (err) {
        console.error("[onboarding.complete] pro-rata leave allocation failed:", err);
      }
    }

    await prisma.hrmsNotification.create({
      data: {
        orgId, employeeId,
        type: "Success",
        channel: "InApp",
        title: "Welcome aboard!",
        message: `Your onboarding is complete. You are now an active employee.`,
        entityType: "OnboardingInstance",
        entityId: instance.id,
      },
    }).catch(() => null);

    await createAuditLog({
      orgId, userId, action: "StatusChange", entityType: "OnboardingInstance",
      entityId: instance.id,
      metadata: { to: "OnboardCompleted", employeeActivated: true, forced: force, pendingTasks: pendingMandatory.length },
    });

    return successResponse({ instance: updatedInstance, employee: updatedEmployee, activated: true });
  } catch (error) {
    console.error("POST /onboarding/[employeeId]/complete error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.onboarding.write"] });
