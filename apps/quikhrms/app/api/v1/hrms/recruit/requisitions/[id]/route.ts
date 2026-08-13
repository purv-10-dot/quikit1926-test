import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updateRequisitionSchema } from "@/lib/validations/recruit";
import { holdApplicationsForRequisition } from "@/lib/recruit/requisition-hold";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const r = await prisma.jobRequisition.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        department: { select: { id: true, name: true } },
        hiringManager: { select: { id: true, firstName: true, lastName: true } },
        recruiter: { select: { id: true, firstName: true, lastName: true } },
        jobLevel: { select: { id: true, code: true, name: true, slaDays: true } },
        recruiterSplits: { where: { deletedAt: null }, select: { employeeId: true, positionsAssigned: true } },
        applications: { where: { deletedAt: null }, include: {
          candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
        }},
      },
    });
    if (!r) return notFound("Requisition not found");
    return successResponse(r);
  } catch (error) { console.error("GET /recruit/requisitions/:id error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.recruit.read"] });

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.jobRequisition.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Requisition not found");
    const body = await req.json();
    const parsed = updateRequisitionSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    if (parsed.data.jobLevelId) {
      const level = await prisma.jobLevel.findFirst({ where: { id: parsed.data.jobLevelId, orgId, deletedAt: null } });
      if (!level) return validationError("Selected job level not found");
    }
    if (parsed.data.recruiterAssignments?.length) {
      const ids = parsed.data.recruiterAssignments.map((a) => a.employeeId);
      const found = await prisma.employee.findMany({ where: { id: { in: ids }, orgId, deletedAt: null }, select: { id: true } });
      if (found.length !== new Set(ids).size) return validationError("One or more assigned recruiters are not in your organization.");
    }

    const {
      responsibilities, requirements, niceToHave, skills, skillWeights, benefits, technicalQuestions,
      interviewPanelIds, targetJoiningDate, closedDate, recruiterAssignments,
      ...rest
    } = parsed.data;
    const r = await prisma.jobRequisition.update({
      where: { id: params.id },
      data: {
        ...rest,
        ...(responsibilities && { responsibilities: JSON.parse(JSON.stringify(responsibilities)) }),
        ...(requirements && { requirements: JSON.parse(JSON.stringify(requirements)) }),
        ...(niceToHave && { niceToHave: JSON.parse(JSON.stringify(niceToHave)) }),
        ...(skills && { skills: JSON.parse(JSON.stringify(skills)) }),
        ...(skillWeights && { skillWeights: JSON.parse(JSON.stringify(skillWeights)) }),
        ...(benefits && { benefits: JSON.parse(JSON.stringify(benefits)) }),
        ...(technicalQuestions && { technicalQuestions: JSON.parse(JSON.stringify(technicalQuestions)) }),
        ...(interviewPanelIds && { interviewPanel: JSON.parse(JSON.stringify(interviewPanelIds)) }),
        ...(targetJoiningDate !== undefined && { targetJoiningDate: targetJoiningDate ? new Date(targetJoiningDate) : null }),
        ...(closedDate !== undefined && { closedDate: closedDate ? new Date(closedDate) : null }),
        ...(rest.status === "ReqClosed" && !closedDate && { closedDate: new Date() }),
        updatedBy: userId,
      },
    });

    // Full-replace the recruiter split when HR explicitly resubmits it. Omit
    // `recruiterAssignments` entirely on an edit to leave the existing split
    // untouched (e.g. when only editing unrelated fields).
    if (recruiterAssignments) {
      await prisma.requisitionRecruiter.deleteMany({ where: { requisitionId: params.id, orgId } });
      if (recruiterAssignments.length) {
        await prisma.requisitionRecruiter.createMany({
          data: recruiterAssignments.map((s) => ({
            orgId, requisitionId: params.id, employeeId: s.employeeId,
            positionsAssigned: s.positionsAssigned, createdBy: userId, updatedBy: userId,
          })),
        });
      }
    }

    // Cascade to candidates when the requisition is put On Hold or Cancelled:
    // park + archive every active application and email the candidates. Held
    // candidates are reviewed/restored later via the Resume flow. Fire-and-forget
    // so the status change returns immediately.
    const enteringHold = r.status === "ReqOnHold" && existing.status !== "ReqOnHold";
    const enteringCancel = r.status === "ReqCancelled" && existing.status !== "ReqCancelled";
    if (enteringHold || enteringCancel) {
      void holdApplicationsForRequisition(orgId, params.id, userId, enteringCancel ? "cancel" : "hold")
        .catch((e) => console.error("[requisition] hold cascade failed:", e));
    }

    // Log Start/End Date revisions specifically — these two fields are what the
    // "Revise Date" flow changes, and the requisition detail popup surfaces this
    // history so HR can see who pushed the date, when, and why (a mandatory
    // reason from that same flow, since generic requisition edits otherwise
    // have no audit trail at all today).
    const closedDateChanged = existing.closedDate?.getTime() !== r.closedDate?.getTime();
    const targetDateChanged = existing.targetJoiningDate?.getTime() !== r.targetJoiningDate?.getTime();
    if (closedDateChanged || targetDateChanged) {
      const reason = typeof body.dateRevisionReason === "string" ? body.dateRevisionReason.trim() : "";
      void createAuditLog({
        orgId, userId, action: "Update", entityType: "Requisition", entityId: r.id,
        before: { closedDate: existing.closedDate, targetJoiningDate: existing.targetJoiningDate },
        after: { closedDate: r.closedDate, targetJoiningDate: r.targetJoiningDate },
        metadata: reason ? { reason } : undefined,
      });
    }

    return successResponse(r);
  } catch (error) { console.error("PATCH /recruit/requisitions/:id error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.recruit.write"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.jobRequisition.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Requisition not found");
    await prisma.jobRequisition.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
    return successResponse({ deleted: true });
  } catch (error) { console.error("DELETE /recruit/requisitions/:id error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.recruit.write"] });
