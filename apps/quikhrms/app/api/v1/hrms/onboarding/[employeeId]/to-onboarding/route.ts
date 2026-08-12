import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, conflict, internalError } from "@/lib/api-response";
import { addDays, normalizeStepConfig } from "@/lib/services/boarding";

type TaskTpl = {
  title: string; description?: string; assigneeRole: string;
  dueInDays: number; category: string; isMandatory: boolean; sortOrder: number;
  stepType?: string; config?: Record<string, unknown> | null;
};

// Move a candidate from Pre-Onboarding → Onboarding. Gated: every pre-onboarding
// step must be done and BGV must be fully Clear (no discrepancy). On success the
// instance flips to the Onboarding phase and a FRESH Day-1 checklist is seeded
// from the org's active onboarding template — the pre-onboarding tasks are kept
// (phase-tagged) but no longer shown.
export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const instance = await prisma.onboardingInstance.findFirst({
      where: { orgId, employeeId: params.employeeId, deletedAt: null },
      include: { tasks: true },
    });
    if (!instance) return notFound("Onboarding not found");

    const phaseRows = await prisma.$queryRaw<Array<{ phase: string | null }>>`
      SELECT phase FROM "app_quikhrms"."OnboardingInstance" WHERE id = ${instance.id} LIMIT 1`;
    if ((phaseRows[0]?.phase ?? "Onboarding") !== "PreOnboarding") {
      return conflict("This is not a pre-onboarding record.");
    }

    // Scope the gate to PRE-ONBOARDING tasks only (phase is a raw-SQL column).
    const taskPhaseRows = await prisma.$queryRaw<Array<{ id: string; phase: string | null }>>`
      SELECT id, phase FROM "app_quikhrms"."OnboardingTask" WHERE "instanceId" = ${instance.id}`;
    const phaseOf = new Map(taskPhaseRows.map((r) => [r.id, r.phase ?? "Onboarding"]));
    const preTasks = instance.tasks.filter((t) => phaseOf.get(t.id) === "PreOnboarding");

    // All pre-onboarding steps done/skipped?
    const pending = preTasks.filter((t) => t.status !== "TaskCompleted" && t.status !== "TaskSkipped");
    if (pending.length > 0) {
      return conflict(`${pending.length} pre-onboarding step(s) still pending.`);
    }

    // BGV must be fully Clear (no discrepancy).
    const bgv = preTasks.find((t) => t.stepType === "BGV");
    if (bgv) {
      const cfg = (bgv.config ?? {}) as Record<string, unknown>;
      const checks = Array.isArray(cfg.bgvChecks) ? (cfg.bgvChecks as string[]) : [];
      const bgvStatus = (cfg.bgvStatus ?? {}) as Record<string, string>;
      const allClear = checks.length === 0 || checks.every((c) => bgvStatus[c] === "clear");
      if (!allClear) return conflict("Background Verification is not fully Clear.");
    }

    // Flip the phase and re-open the instance (pre-onboarding completion must NOT
    // leave it closed). The GET route then injects the Complete Profile step.
    await prisma.$executeRaw`
      UPDATE "app_quikhrms"."OnboardingInstance"
      SET phase = 'Onboarding', status = 'InProgress', "completedAt" = NULL, "updatedBy" = ${userId}
      WHERE id = ${instance.id}`;

    // Seed the Day-1 checklist from the org's active onboarding-kind template —
    // ONLY if this instance has no onboarding-phase tasks yet (idempotent).
    const existingOnboarding = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*)::bigint AS n FROM "app_quikhrms"."OnboardingTask"
      WHERE "instanceId" = ${instance.id} AND phase = 'Onboarding'`;
    if (Number(existingOnboarding[0]?.n ?? 0) === 0) {
      const tmplRows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "app_quikhrms"."OnboardingTemplate"
        WHERE "orgId" = ${orgId} AND "deletedAt" IS NULL AND "isActive" = true AND kind = 'Onboarding'
        ORDER BY "createdAt" DESC LIMIT 1`;
      const tmplId = tmplRows[0]?.id;
      // The instance still points at the PRE-onboarding template it was built
      // from. Re-point it at the Day-1 template (or clear it) so the tracker's
      // "Re-apply template" rebuilds the onboarding checklist — not the
      // pre-onboarding one.
      await prisma.onboardingInstance.update({
        where: { id: instance.id },
        data: { templateId: tmplId ?? null, updatedBy: userId },
      });
      if (tmplId) {
        const tmpl = await prisma.onboardingTemplate.findFirst({ where: { id: tmplId, orgId } });
        const tasks = ((tmpl?.tasks as unknown as TaskTpl[]) ?? []);
        if (tasks.length > 0) {
          // New tasks default to phase='Onboarding' (column default), so no extra
          // tagging is needed.
          await prisma.onboardingTask.createMany({
            data: tasks.map((t, idx) => ({
              orgId,
              instanceId: instance.id,
              title: t.title,
              description: t.description ?? null,
              assigneeRole: (t.assigneeRole ?? "HRRole") as "HRRole",
              category: (t.category ?? "TaskOther") as "TaskOther",
              dueDate: addDays(instance.startDate, t.dueInDays ?? 7),
              isMandatory: t.isMandatory ?? true,
              sortOrder: t.sortOrder ?? idx,
              stepType: t.stepType ?? null,
              config: normalizeStepConfig(t.stepType, t.config) as never,
            })),
          });
        }
      }
    }

    return successResponse({ phase: "Onboarding" });
  } catch (error) {
    console.error("POST /onboarding/[employeeId]/to-onboarding error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.onboarding.write"] });
