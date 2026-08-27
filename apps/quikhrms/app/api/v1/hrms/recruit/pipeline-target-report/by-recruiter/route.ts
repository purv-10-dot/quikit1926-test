import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/with-auth";
import { successResponse, forbidden, validationError, internalError } from "@/lib/api-response";
import { computePipelineTargetActualsByRecruiter } from "@/lib/recruit/pipeline-targets";

/**
 * GET /api/v1/hrms/recruit/pipeline-target-report/by-recruiter
 *
 * All-recruiters-side-by-side comparison — one overall Achievement% per
 * recruiter, for the given range (defaults to today). HR/Admin-only (the
 * "see every recruiter" scope) — a self-scoped recruiter has no business
 * comparing themselves against everyone else here.
 */
const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId, permissions } = ctx;
    const canSeeAll = permissions.includes("*") || permissions.includes("hrms.recruit.performance.read");
    if (!canSeeAll) return forbidden("No recruiter-performance read permission");

    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
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

    const report = await computePipelineTargetActualsByRecruiter(orgId, { from, to });
    return successResponse({ ...report, from: fromStr, to: toStr });
  } catch (error) {
    console.error("GET /recruit/pipeline-target-report/by-recruiter error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.performance.read"] });
