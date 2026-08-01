import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, forbidden, internalError } from "@/lib/api-response";
import { isAutomated } from "@/lib/services/onboarding-automation";

export const GET = withAuth(async (_req: NextRequest, { orgId, userId, permissions }, params) => {
  try {
    // This GET lazily CREATES an onboarding instance if none exists, so it must
    // be gated: only the employee themselves or an onboarding reader/manager.
    const isSelf = userId === params.employeeId;
    const canRead = permissions.includes("*")
      || permissions.includes("hrms.onboarding.read")
      || permissions.includes("hrms.onboarding.write")
      || permissions.includes("hrms.employee.read");
    if (!isSelf && !canRead) return forbidden();

    let instance = await prisma.onboardingInstance.findFirst({
      where: { orgId, employeeId: params.employeeId, deletedAt: null },
      include: {
        tasks: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        template: { select: { id: true, name: true } },
      },
    });

    // Auto-create an empty onboarding instance if employee exists but record missing.
    if (!instance) {
      const emp = await prisma.employee.findFirst({
        where: { id: params.employeeId, orgId, deletedAt: null },
        select: { id: true },
      });
      if (!emp) return notFound("Employee not found");

      const startDate = new Date();
      const created = await prisma.onboardingInstance.create({
        data: {
          orgId,
          employeeId: emp.id,
          startDate,
          status: "NotStarted",
          createdBy: userId,
          updatedBy: userId,
        },
      });
      // No system-default tasks — the checklist comes from a template or is added
      // manually. A self-healed instance starts empty.

      instance = await prisma.onboardingInstance.findFirst({
        where: { id: created.id },
        include: {
          tasks: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
          template: { select: { id: true, name: true } },
        },
      });
    }
    if (!instance) return notFound("Onboarding not found");

    // Phase drives which mandatory system step is always present:
    //   PreOnboarding → Background Verification (BGV)
    //   Onboarding    → Complete Profile
    // (phase is a new column, read via raw SQL.)
    const phaseRows = await prisma.$queryRaw<Array<{ phase: string | null }>>`
      SELECT phase FROM "app_quikhrms"."OnboardingInstance" WHERE id = ${instance.id} LIMIT 1`;
    const phase = phaseRows[0]?.phase ?? "Onboarding";

    // Per-task phase (raw-SQL column) — the tracker shows ONLY the tasks that
    // belong to the instance's current phase, so pre-onboarding and onboarding
    // have completely separate checklists.
    let taskPhaseRows = await prisma.$queryRaw<Array<{ id: string; phase: string | null }>>`
      SELECT id, phase FROM "app_quikhrms"."OnboardingTask" WHERE "instanceId" = ${instance.id}`;
    let phaseOf = new Map(taskPhaseRows.map((r) => [r.id, r.phase ?? "Onboarding"]));

    const isClosed = instance.status === "OnboardCompleted" || instance.status === "OnboardCancelled";
    const sysStep = phase === "PreOnboarding"
      ? { stepType: "BGV", title: "Background Verification", config: { bgvChecks: ["Education", "Employment", "Criminal", "Address"], bgvStatus: {} } }
      : { stepType: "CompleteProfile", title: "Complete Profile", config: undefined as Record<string, unknown> | undefined };
    const hasSysStep = instance.tasks.some((t) => t.stepType === sysStep.stepType && (phaseOf.get(t.id) ?? "Onboarding") === phase);
    if (!hasSysStep && !isClosed) {
      // Two concurrent GETs (e.g. a double-fetch on page load) can both pass
      // the `!hasSysStep` check above before either commits its INSERT —
      // without protection that creates two BGV/CompleteProfile rows. A
      // partial unique index (one sortOrder=-1 row per instance+phase, see
      // the DB migration note) backs this: the race loser's create() throws
      // P2002, which we swallow here and just re-fetch — the winner's row is
      // picked up by the query below either way.
      try {
        const createdSys = await prisma.onboardingTask.create({
          data: {
            orgId,
            instanceId: instance.id,
            title: sysStep.title,
            stepType: sysStep.stepType,
            category: "TaskOther",
            assigneeRole: "HRRole",
            isMandatory: true,
            status: "TaskPending",
            sortOrder: -1, // always first
            config: sysStep.config as object | undefined,
          },
        });
        // New tasks default to phase='Onboarding'; tag the pre-onboarding BGV step.
        if (phase === "PreOnboarding") {
          await prisma.$executeRaw`
            UPDATE "app_quikhrms"."OnboardingTask" SET phase = 'PreOnboarding' WHERE id = ${createdSys.id}`;
        }
      } catch (e) {
        if (!(e && typeof e === "object" && (e as { code?: string }).code === "P2002")) throw e;
      }
      instance = await prisma.onboardingInstance.findFirst({
        where: { id: instance.id },
        include: {
          tasks: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
          template: { select: { id: true, name: true } },
        },
      });
      if (!instance) return notFound("Onboarding not found");
      taskPhaseRows = await prisma.$queryRaw<Array<{ id: string; phase: string | null }>>`
        SELECT id, phase FROM "app_quikhrms"."OnboardingTask" WHERE "instanceId" = ${instance.id}`;
      phaseOf = new Map(taskPhaseRows.map((r) => [r.id, r.phase ?? "Onboarding"]));
    }

    // Only the current phase's tasks are surfaced + counted.
    const phaseTasks = instance.tasks.filter((t) => (phaseOf.get(t.id) ?? "Onboarding") === phase);
    const total = phaseTasks.length;
    const completed = phaseTasks.filter((t) => t.status === "TaskCompleted" || t.status === "TaskSkipped").length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    const employee = await prisma.employee.findFirst({
      where: { id: instance.employeeId, orgId, deletedAt: null },
      select: {
        id: true, firstName: true, lastName: true, employeeCode: true, jobTitle: true, dateOfJoining: true,
        department: { select: { name: true } },
        designation: { select: { title: true } },
        reportingManager: { select: { firstName: true, lastName: true } },
      },
    });

    const automated = await isAutomated(instance.id, orgId);

    return successResponse({ ...instance, tasks: phaseTasks, employee, progress, totalTasks: total, completedTasks: completed, automated, phase });
  } catch (error) {
    console.error("GET /onboarding/[employeeId] error:", error);
    return internalError();
  }
});
