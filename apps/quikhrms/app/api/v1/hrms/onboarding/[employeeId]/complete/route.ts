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

    // This finalizes the ONBOARDING phase (Day-1 checklist) — a candidate
    // still in Pre-Onboarding hasn't even joined yet, so completing here would
    // wrongly activate the employee and skip the whole Onboarding phase.
    // "Move to Onboarding" is the only valid way out of Pre-Onboarding.
    const phaseRows = await prisma.$queryRaw<Array<{ phase: string | null }>>`
      SELECT phase FROM "app_quikhrms"."OnboardingInstance" WHERE id = ${instance.id} LIMIT 1`;
    if ((phaseRows[0]?.phase ?? "Onboarding") === "PreOnboarding") {
      return conflict("Still in Pre-Onboarding — use \"Move to Onboarding\" first.");
    }

    // Scope pending-task counting to the current (Onboarding) phase — a
    // completed/skipped Pre-Onboarding step must never count against this gate.
    const taskPhaseRows = await prisma.$queryRaw<Array<{ id: string; phase: string | null }>>`
      SELECT id, phase FROM "app_quikhrms"."OnboardingTask" WHERE "instanceId" = ${instance.id}`;
    const phaseOf = new Map(taskPhaseRows.map((r) => [r.id, r.phase ?? "Onboarding"]));
    const onboardingTasks = instance.tasks.filter((t) => (phaseOf.get(t.id) ?? "Onboarding") === "Onboarding");

    const pendingMandatory = onboardingTasks.filter(
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
