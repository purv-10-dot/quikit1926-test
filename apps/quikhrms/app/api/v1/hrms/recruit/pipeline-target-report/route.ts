import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/with-auth";
import { successResponse, forbidden, validationError, internalError } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { computePipelineTargetActuals } from "@/lib/recruit/pipeline-targets";

/**
 * GET /api/v1/hrms/recruit/pipeline-target-report
 *
 * Target-vs-actual for the daily pipeline-throughput benchmarks (Job Levels
 * → Pipeline Targets). Defaults to TODAY when no range is given (the
 * dashboard "today" cards); an explicit from/to serves the Recruiter Report.
 *
 * Same self/all scope split as /recruiter-performance: a self-only caller
 * always gets their own requisitions' numbers, regardless of a
 * `recruiterId` query param.
 */
const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  recruiterId: z.string().optional(),
});

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId, permissions } = ctx;
    const canSeeAll = permissions.includes("*") || permissions.includes("hrms.recruit.performance.read");
    const canSeeSelf = canSeeAll || permissions.includes("hrms.recruit.performance.read_self");
    if (!canSeeSelf) return forbidden("No recruiter-performance read permission");

    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      recruiterId: searchParams.get("recruiterId") ?? undefined,
    });
    if (!parsed.success) return validationError("Invalid query params", parsed.error.flatten());

    const todayStr = new Date().toISOString().slice(0, 10);
    const fromStr = parsed.data.from ?? todayStr;
    const toStr = parsed.data.to ?? fromStr;
    const from = new Date(`${fromStr}T00:00:00.000Z`);
    const to = new Date(`${toStr}T23:59:59.999Z`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
      return validationError("Invalid date range");
    }

    const callerEmployeeId = await resolveEmployeeId(orgId, ctx.userId);
    const recruiterId = canSeeAll ? parsed.data.recruiterId : callerEmployeeId ?? undefined;

    const report = await computePipelineTargetActuals(orgId, { from, to, recruiterId });
    return successResponse({ ...report, from: fromStr, to: toStr, scope: recruiterId ? "recruiter" : "all" });
  } catch (error) {
    console.error("GET /recruit/pipeline-target-report error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.performance.read", "hrms.recruit.performance.read_self"], anyPermission: true });
