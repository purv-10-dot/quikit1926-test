import { NextRequest } from "next/server";
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
          employeeId: true,
          tasks: { select: { status: true, stepType: true, config: true } },
        },
      }),
    ]);

    // employeeId → { progress, tasks, bgv } derived from onboarding tasks.
    const progressByEmp = new Map<string, { taskDone: number; taskTotal: number; progressPct: number; bgvStatus: BgvStatus }>();
    for (const inst of instances) {
      const total = inst.tasks.length;
      const done = inst.tasks.filter((t) => t.status === "TaskCompleted" || t.status === "TaskSkipped").length;
      progressByEmp.set(inst.employeeId, {
        taskDone: done,
        taskTotal: total,
        progressPct: total > 0 ? Math.round((done / total) * 100) : 0,
        bgvStatus: bgvStatusOf(inst.tasks),
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
