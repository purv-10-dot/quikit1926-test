import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, conflict, internalError } from "@/lib/api-response";

// Move a candidate from Pre-Onboarding → Onboarding. Gated: every pre-onboarding
// step must be done and BGV must be fully Clear (no discrepancy).
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

    // All steps done/skipped?
    const pending = instance.tasks.filter((t) => t.status !== "TaskCompleted" && t.status !== "TaskSkipped");
    if (pending.length > 0) {
      return conflict(`${pending.length} pre-onboarding step(s) still pending.`);
    }

    // BGV must be fully Clear (no discrepancy).
    const bgv = instance.tasks.find((t) => t.stepType === "BGV");
    if (bgv) {
      const cfg = (bgv.config ?? {}) as Record<string, unknown>;
      const checks = Array.isArray(cfg.bgvChecks) ? (cfg.bgvChecks as string[]) : [];
      const bgvStatus = (cfg.bgvStatus ?? {}) as Record<string, string>;
      const allClear = checks.length === 0 || checks.every((c) => bgvStatus[c] === "clear");
      if (!allClear) return conflict("Background Verification is not fully Clear.");
    }

    // Flip the phase — the GET route will then inject the Complete Profile step
    // and the Day-1 onboarding checklist takes over.
    await prisma.$executeRaw`
      UPDATE "app_quikhrms"."OnboardingInstance" SET phase = 'Onboarding', "updatedBy" = ${userId} WHERE id = ${instance.id}`;

    return successResponse({ phase: "Onboarding" });
  } catch (error) {
    console.error("POST /onboarding/[employeeId]/to-onboarding error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.onboarding.write"] });
