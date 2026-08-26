import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError, forbidden } from "@/lib/api-response";
import { updateRequisitionSchema } from "@/lib/validations/recruit";
import { holdApplicationsForRequisition } from "@/lib/recruit/requisition-hold";
import { createAuditLog } from "@/lib/utils/audit";
import { countBusinessDays, getHolidayDateSet } from "@/lib/recruit/sla";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { generatePositionsForRequisition } from "@/lib/services/requisition-positions";

export const GET = withAuth(async (_req: NextRequest, { orgId, userId, permissions }, params) => {
  try {
    const canSeeAll = permissions.includes("*") || permissions.includes("hrms.recruit.read");
    const canSeeSelf = canSeeAll || permissions.includes("hrms.recruit.read_self");
    if (!canSeeSelf) return forbidden("No recruitment read permission");

    // Recruiter (self-only) scope: block a direct link/URL to a requisition
    // they're not assigned to, same rule as the list endpoint.
    const employeeId = canSeeAll ? null : await resolveEmployeeId(orgId, userId);

    const r = await prisma.jobRequisition.findFirst({
      where: {
        id: params.id, orgId, deletedAt: null,
        ...(!canSeeAll && { OR: [
          { recruiterId: employeeId },
          { recruiterSplits: { some: { employeeId: employeeId ?? "", deletedAt: null } } },
        ] }),
      },
      include: {
        department: { select: { id: true, name: true } },
        hiringManager: { select: { id: true, firstName: true, lastName: true } },
        recruiter: { select: { id: true, firstName: true, lastName: true } },
        raiser: { select: { id: true, firstName: true, lastName: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
        pipeline: { select: { id: true, name: true, isDefault: true } },
        jobLevel: { select: { id: true, code: true, name: true, slaDays: true } },
        recruiterSplits: { where: { deletedAt: null }, select: { employeeId: true, positionsAssigned: true } },
        _count: { select: { applications: true } },
        applications: { where: { deletedAt: null }, include: {
          candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
        }},
      },
    });
    if (!r) return notFound("Requisition not found");
    return successResponse(r);
  } catch (error) { console.error("GET /recruit/requisitions/:id error:", error); return internalError(); }
});

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

    // SLA pause: entering ReqOnHold freezes the SLA clock at that instant;
    // leaving it (to any other status) folds the paused interval — in
    // business days, matching how the SLA age itself is measured — into
    // slaPausedDays so the clock resumes exactly where it left off, instead
    // of penalizing the recruiter for time the requisition sat on hold.
    const slaEnteringHold = rest.status === "ReqOnHold" && existing.status !== "ReqOnHold";
    const slaLeavingHold = existing.status === "ReqOnHold" && rest.status !== undefined && rest.status !== "ReqOnHold";
    let slaPauseFields: Record<string, unknown> = {};
    if (slaEnteringHold) {
      slaPauseFields = { slaPausedAt: new Date() };
    } else if (slaLeavingHold && existing.slaPausedAt) {
      const now = new Date();
      const holidayDates = await getHolidayDateSet(orgId, existing.slaPausedAt, now);
      slaPauseFields = {
        slaPausedAt: null,
        slaPausedDays: existing.slaPausedDays + countBusinessDays(existing.slaPausedAt, now, holidayDates),
      };
    } else if (slaLeavingHold) {
      slaPauseFields = { slaPausedAt: null };
    }

    const r = await prisma.jobRequisition.update({
      where: { id: params.id },
      data: {
        ...rest,
        ...slaPauseFields,
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
        // The TRUE closure timestamp — stamped once, the moment status enters
        // ReqClosed, independent of whatever `closedDate` (HR's editable
        // target) happens to hold. `closedDate` is never touched here anymore.
        ...(rest.status === "ReqClosed" && existing.status !== "ReqClosed" && { actualClosedAt: new Date() }),
        updatedBy: userId,
      },
    });

    // Backfill RequisitionPosition seats to match the current Positions count.
    // Seats are only ever generated up front at create time
    // (generatePositionsForRequisition, see requisitions/route.ts POST) — raising
    // Positions on an edit (e.g. 1 → 3) never created the missing -02/-03 seats,
    // so Assign Recruiter / position tracking kept only seeing the original 1.
    // Re-running this on every edit (not just when `positions` is part of THIS
    // request) also self-heals any requisition already stuck from that gap
    // before this fix existed. Idempotent (ON CONFLICT DO NOTHING on
    // sequenceNo) — never touches an existing seat, only adds missing ones.
    // Positions DECREASED is deliberately left alone: an existing seat may
    // already have a recruiter/candidate on it, so shrinking the count never
    // auto-deletes a seat; HR cancels one manually if it's truly unneeded.
    await generatePositionsForRequisition(orgId, params.id, existing.requisitionNumber, r.positions, userId);

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

    // Log Job Level / SLA-override changes — these directly determine whether
    // a requisition shows as breaching SLA, so a silent change here (e.g. to
    // "launder" a breach) must leave a trace, same as the date fields above.
    const jobLevelChanged = existing.jobLevelId !== r.jobLevelId;
    const customSlaChanged = existing.customSlaDays !== r.customSlaDays || existing.customSlaReason !== r.customSlaReason;
    if (jobLevelChanged || customSlaChanged) {
      void createAuditLog({
        orgId, userId, action: "Update", entityType: "Requisition", entityId: r.id,
        before: { jobLevelId: existing.jobLevelId, customSlaDays: existing.customSlaDays, customSlaReason: existing.customSlaReason },
        after: { jobLevelId: r.jobLevelId, customSlaDays: r.customSlaDays, customSlaReason: r.customSlaReason },
      });
    }

    // Log status changes on their own — e.g. Open → On Hold → Closed —
    // distinct from generic field edits below, so the Activity timeline can
    // show "Status changed" as its own kind of event.
    if (existing.status !== r.status) {
      void createAuditLog({
        orgId, userId, action: "StatusChange", entityType: "Requisition", entityId: r.id,
        before: { status: existing.status }, after: { status: r.status },
      });
    }

    // Generic edit trail — everything else meaningful that can change on this
    // form (date/SLA-override/status are logged separately above, so excluded
    // here to avoid double-logging the same field twice).
    const genericBefore = {
      title: existing.title, positions: existing.positions, priority: existing.priority,
      departmentId: existing.departmentId, hiringManagerId: existing.hiringManagerId,
      recruiterId: existing.recruiterId, employmentType: existing.employmentType,
      workLocation: existing.workLocation, experienceMin: existing.experienceMin?.toString(),
      experienceMax: existing.experienceMax?.toString(), salaryMin: existing.salaryMin?.toString(),
      salaryMax: existing.salaryMax?.toString(), budget: existing.budget?.toString(),
      jobDescription: existing.jobDescription,
    };
    const genericAfter = {
      title: r.title, positions: r.positions, priority: r.priority,
      departmentId: r.departmentId, hiringManagerId: r.hiringManagerId,
      recruiterId: r.recruiterId, employmentType: r.employmentType,
      workLocation: r.workLocation, experienceMin: r.experienceMin?.toString(),
      experienceMax: r.experienceMax?.toString(), salaryMin: r.salaryMin?.toString(),
      salaryMax: r.salaryMax?.toString(), budget: r.budget?.toString(),
      jobDescription: r.jobDescription,
    };
    if (JSON.stringify(genericBefore) !== JSON.stringify(genericAfter)) {
      void createAuditLog({
        orgId, userId, action: "Update", entityType: "Requisition", entityId: r.id,
        before: genericBefore, after: genericAfter,
      });
    }

    return successResponse(r);
  } catch (error) { console.error("PATCH /recruit/requisitions/:id error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.recruit.write", "hrms.recruit.requisition.write"], anyPermission: true });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.jobRequisition.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Requisition not found");
    await prisma.jobRequisition.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
    return successResponse({ deleted: true });
  } catch (error) { console.error("DELETE /recruit/requisitions/:id error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.recruit.write", "hrms.recruit.requisition.write"], anyPermission: true });
