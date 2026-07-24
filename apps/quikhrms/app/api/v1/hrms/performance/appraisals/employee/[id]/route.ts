import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, forbidden, validationError, internalError } from "@/lib/api-response";
import { updateEmployeeAppraisalSchema } from "@/lib/validations/performance";
import { resolveScope, employeeScopeFilter, getCallerEmployeeId } from "@/lib/rbac/scope";
import { PERF_READ_MAP, stripUnpublishedAppraisal, isDirectManagerOf } from "@/lib/rbac/performance-access";

export const GET = withAuth(async (_req: NextRequest, ctx, params) => {
  try {
    const { orgId } = ctx;
    const appraisal = await prisma.employeeAppraisal.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, profilePhoto: true, department: { select: { name: true } }, designation: { select: { title: true } } } },
        cycle: true,
      },
    });
    if (!appraisal) return notFound("Appraisal not found");

    // Access: reviewee, their manager, or a read-scoped viewer (HR = read-all).
    const callerId = await getCallerEmployeeId(ctx);
    const isHR = ctx.permissions.includes("*") || ctx.permissions.includes("hrms.performance.appraise");
    const isReviewee = !!callerId && appraisal.employeeId === callerId;
    const isManager = !isReviewee && (await isDirectManagerOf(ctx, appraisal.employeeId));
    const sf = await employeeScopeFilter(ctx, resolveScope(ctx, PERF_READ_MAP));
    const inReadScope = sf.allow && (sf.employeeIds === undefined || sf.employeeIds.includes(appraisal.employeeId));
    if (!isHR && !isReviewee && !isManager && !inReadScope) {
      return forbidden("You don't have access to this appraisal");
    }

    // Confidentiality: the reviewee cannot see manager/calibration/final fields
    // until the appraisal is published (Completed).
    const canSeePrivileged = isHR || isManager || appraisal.status === "Completed";
    return successResponse(stripUnpublishedAppraisal(appraisal as unknown as Record<string, unknown>, canSeePrivileged));
  } catch (error) { console.error("GET /appraisals/employee/:id error:", error); return internalError(); }
});

export const PATCH = withAuth(async (req: NextRequest, ctx, params) => {
  try {
    const { orgId, userId } = ctx;
    const existing = await prisma.employeeAppraisal.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Appraisal not found");

    const body = await req.json();
    const parsed = updateEmployeeAppraisalSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const data = parsed.data;

    // Field-level authority. Reviewee → self fields only. Manager → manager
    // fields. HR/calibration (hrms.performance.appraise) → everything incl.
    // calibration/final/promotion/salary + status. Reject any field the caller
    // isn't authorised to write.
    const callerId = await getCallerEmployeeId(ctx);
    const isHR = ctx.permissions.includes("*") || ctx.permissions.includes("hrms.performance.appraise");
    const isReviewee = !!callerId && existing.employeeId === callerId;
    const isManager = !isHR && !isReviewee && (await isDirectManagerOf(ctx, existing.employeeId));
    if (!isHR && !isReviewee && !isManager) return forbidden("You can't edit this appraisal.");

    const SELF = ["selfRating", "selfComments", "selfResponses", "employeeAcknowledged", "employeeFeedback"];
    const MGR = ["managerRating", "managerComments", "managerResponses"];
    const HRF = ["calibratedRating", "finalRating", "finalBand", "promotionRecommendation", "salaryRevisionRecommended", "status"];

    const allowed = new Set<string>();
    if (isReviewee || isHR) SELF.forEach((f) => allowed.add(f));
    if (isManager || isHR) MGR.forEach((f) => allowed.add(f));
    if (isHR) HRF.forEach((f) => allowed.add(f));

    const provided = Object.keys(data).filter((k) => (data as Record<string, unknown>)[k] !== undefined);
    const illegal = provided.filter((k) => !allowed.has(k));
    if (illegal.length) return forbidden(`You're not allowed to set: ${illegal.join(", ")}`);

    const updateData: Record<string, unknown> = { updatedBy: userId };
    if (data.selfRating !== undefined) updateData.selfRating = data.selfRating;
    if (data.selfComments !== undefined) updateData.selfComments = data.selfComments;
    if (data.selfResponses) updateData.selfResponses = JSON.parse(JSON.stringify(data.selfResponses));
    if (data.managerRating !== undefined) updateData.managerRating = data.managerRating;
    if (data.managerComments !== undefined) updateData.managerComments = data.managerComments;
    if (data.managerResponses) updateData.managerResponses = JSON.parse(JSON.stringify(data.managerResponses));
    if (data.calibratedRating !== undefined) updateData.calibratedRating = data.calibratedRating;
    if (data.finalRating !== undefined) updateData.finalRating = data.finalRating;
    if (data.finalBand !== undefined) updateData.finalBand = data.finalBand;
    if (data.promotionRecommendation !== undefined) updateData.promotionRecommendation = data.promotionRecommendation;
    if (data.salaryRevisionRecommended !== undefined) updateData.salaryRevisionRecommended = data.salaryRevisionRecommended;
    if (data.status) updateData.status = data.status;
    if (data.employeeAcknowledged) {
      updateData.employeeAcknowledged = true;
      updateData.employeeAcknowledgedAt = new Date();
    }
    if (data.employeeFeedback) updateData.employeeFeedback = data.employeeFeedback;

    const appraisal = await prisma.employeeAppraisal.update({ where: { id: params.id }, data: updateData });
    return successResponse(appraisal);
  } catch (error) { console.error("PATCH /appraisals/employee/:id error:", error); return internalError(); }
});
