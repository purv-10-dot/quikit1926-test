import { NextRequest } from "next/server";
import { Prisma } from "@quikit/database";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

type BgvStatus = "Pending" | "In Progress" | "Completed" | null;

/** Derive a coarse BGV status from the instance's BGV step (stepType "BGV"). */
function bgvStatusOf(
  tasks: Array<{ status: string; stepType: string | null; config: unknown }>,
): BgvStatus {
  const t = tasks.find((x) => x.stepType === "BGV");
  if (!t) return null;
  if (t.status === "TaskCompleted") return "Completed";
  const cfg = (t.config ?? {}) as Record<string, unknown>;
  const checks = Array.isArray(cfg.bgvChecks) ? (cfg.bgvChecks as string[]) : [];
  const st = (cfg.bgvStatus ?? {}) as Record<string, string>;
  if (checks.length > 0 && checks.every((c) => st[c] === "clear")) return "Completed";
  if (checks.some((c) => st[c])) return "In Progress";
  return "Pending";
}

/**
 * GET /api/v1/hrms/pre-onboarding/roster
 * Lists employees whose onboarding instance is still in the "PreOnboarding"
 * phase (pre-joining). `phase` is a raw-SQL column on OnboardingInstance, so we
 * resolve the matching employeeIds first, then load the employees and their
 * onboarding tasks (for stage progress + BGV status shown on each card).
 */
export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim();

    // employeeIds whose instance is in the PreOnboarding phase.
    const phaseRows = await prisma.$queryRaw<Array<{ employeeId: string }>>`
      SELECT "employeeId" FROM "app_quikhrms"."OnboardingInstance"
      WHERE "orgId" = ${orgId} AND "deletedAt" IS NULL AND phase = 'PreOnboarding'`;
    const employeeIds = phaseRows.map((r) => r.employeeId);
    if (employeeIds.length === 0) return successResponse([]);

    const [employees, instances] = await Promise.all([
      prisma.employee.findMany({
        where: {
          orgId,
          deletedAt: null,
          id: { in: employeeIds },
          ...(search && {
            OR: [
              { firstName: { contains: search, mode: "insensitive" as const } },
              { lastName: { contains: search, mode: "insensitive" as const } },
              { workEmail: { contains: search, mode: "insensitive" as const } },
              { personalEmail: { contains: search, mode: "insensitive" as const } },
              { employeeCode: { contains: search, mode: "insensitive" as const } },
            ],
          }),
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          displayName: true,
          jobTitle: true,
          dateOfJoining: true,
          employmentType: true,
          workLocation: true,
          sourceOfHire: true,
          department: { select: { id: true, name: true } },
        },
      }),
      prisma.onboardingInstance.findMany({
        where: { orgId, deletedAt: null, employeeId: { in: employeeIds } },
        select: {
          id: true,
          employeeId: true,
          tasks: { select: { id: true, status: true, stepType: true, config: true } },
        },
      }),
    ]);

    // Per-task phase (raw-SQL column). This roster is the Pre-Onboarding list, so
    // count only PRE-ONBOARDING-phase tasks. Null/absent phase = Onboarding.
    const instanceIds = instances.map((i) => i.id);
    const taskPhaseRows = instanceIds.length
      ? await prisma.$queryRaw<Array<{ id: string; phase: string | null }>>`
          SELECT id, phase FROM "app_quikhrms"."OnboardingTask" WHERE "instanceId" IN (${Prisma.join(instanceIds)})`
      : [];
    const phaseOf = new Map(taskPhaseRows.map((r) => [r.id, r.phase ?? "Onboarding"]));

    // employeeId → { progress, tasks, bgv } derived from pre-onboarding tasks.
    const progressByEmp = new Map<string, { taskDone: number; taskTotal: number; progressPct: number; bgvStatus: BgvStatus }>();
    for (const inst of instances) {
      const t = inst.tasks.filter((x) => (phaseOf.get(x.id) ?? "Onboarding") === "PreOnboarding");
      const total = t.length;
      const done = t.filter((x) => x.status === "TaskCompleted" || x.status === "TaskSkipped").length;
      progressByEmp.set(inst.employeeId, {
        taskDone: done,
        taskTotal: total,
        progressPct: total > 0 ? Math.round((done / total) * 100) : 0,
        bgvStatus: bgvStatusOf(t),
      });
    }

    const rows = employees.map((e) => ({
      ...e,
      ...(progressByEmp.get(e.id) ?? { taskDone: 0, taskTotal: 0, progressPct: 0, bgvStatus: null as BgvStatus }),
    }));

    return successResponse(rows);
  } catch (error) {
    console.error("GET /pre-onboarding/roster error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.onboarding.read"] });
