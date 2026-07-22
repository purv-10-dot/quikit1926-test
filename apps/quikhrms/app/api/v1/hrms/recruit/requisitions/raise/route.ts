import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, notFound, errorResponse } from "@/lib/api-response";
import { ErrorCode } from "@/lib/types/api";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { mailRequisitionApprovalRequest } from "@/lib/services/requisition-approval-service";
import { resolveApprovalChainLevels } from "@/lib/services/approval-chain";

const schema = z.object({
  title: z.string().min(2).max(200),
  departmentId: z.string().optional(),
  pipelineId: z.string().optional(),
  jobOpeningName: z.string().optional(),
  positions: z.number().int().min(1).max(999).default(1),
  type: z.enum(["NewPosition", "Replacement", "Expansion"]).default("NewPosition"),
  employmentType: z.enum(["FullTime", "PartTime", "Contract", "Intern"]).default("FullTime"),
  workLocation: z.enum(["Office", "Remote", "Hybrid"]).default("Office"),
  reportingToId: z.string().optional(),
  hiringManagerId: z.string().optional(),
  recruiterId: z.string().optional(),
  interviewPanelIds: z.array(z.string()).optional(),
  experienceMin: z.number().optional(),
  experienceMax: z.number().optional(),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  salaryCurrency: z.string().default("INR"),
  budget: z.number().optional(),
  targetJoiningDate: z.string().optional(),
  closedDate: z.string().optional(),
  etaToFillDays: z.number().int().optional(),
  jobGrade: z.string().optional(),
  costCenter: z.string().optional(),
  jobDescription: z.string().optional(),
  requirements: z.array(z.string()).optional(),
  niceToHave: z.array(z.string()).optional(),
  benefits: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  skillWeights: z.array(z.object({ skill: z.string().min(1), weight: z.number().int().min(1).max(10) })).optional(),
  education: z.string().optional(),
  passingYear: z.number().int().min(1950).max(2100).nullable().optional(),
  technicalQuestions: z.array(z.string().max(500)).min(1, "Add at least one technical question").max(50),
  referralBonusAmount: z.number().optional(),
  careerPageVisible: z.boolean().optional(),
  internalPostingOnly: z.boolean().optional(),
  postToJobPortal: z.boolean().optional(),
  rolePurpose: z.string().optional(),
  responsibilities: z.array(z.string()).optional(),
  justification: z.string().min(10, "Business justification is required").max(5000),
  priority: z.enum(["Low", "Medium", "High", "Urgent"]).default("Medium"),
});

function reqNumber(): string {
  const d = new Date();
  return `REQ-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const raiserId = await resolveEmployeeId(orgId, userId);
    if (!raiserId) return notFound("Employee record not found");
    const raiser = await prisma.employee.findFirst({
      where: { id: raiserId, orgId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, workEmail: true, departmentId: true },
    });
    if (!raiser) return notFound("Employee record not found");

    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const data = parsed.data;

    const deptId = data.departmentId || raiser.departmentId || null;

    // Approval is driven by the org's configurable Requisition approval chain
    // (Settings → Approval Chains). No chain → block (mirrors Leave); the UI
    // prompts the admin to configure one.
    // allowSelf: a requisition raiser who holds the approver role can approve
    // their own requisition (small teams where admin raises + approves).
    const chain = await resolveApprovalChainLevels(orgId, "Requisition", raiserId, true);
    if (!chain.ok) {
      return errorResponse(ErrorCode.APPROVAL_CHAIN_NOT_CONFIGURED, chain.message, 422, {
        module: "Requisition", reason: chain.reason,
      });
    }

    const requisition = await prisma.jobRequisition.create({
      data: {
        orgId,
        requisitionNumber: reqNumber(),
        title: data.title,
        jobOpeningName: data.jobOpeningName,
        departmentId: deptId ?? undefined,
        pipelineId: data.pipelineId,
        reportingToId: data.reportingToId,
        hiringManagerId: data.hiringManagerId,
        recruiterId: data.recruiterId,
        interviewPanel: data.interviewPanelIds ? JSON.parse(JSON.stringify(data.interviewPanelIds)) : undefined,
        positions: data.positions,
        type: data.type,
        employmentType: data.employmentType,
        workLocation: data.workLocation,
        experienceMin: data.experienceMin,
        experienceMax: data.experienceMax,
        salaryMin: data.salaryMin,
        salaryMax: data.salaryMax,
        salaryCurrency: data.salaryCurrency,
        budget: data.budget,
        targetJoiningDate: data.targetJoiningDate ? new Date(data.targetJoiningDate) : undefined,
        closedDate: data.closedDate ? new Date(data.closedDate) : undefined,
        etaToFillDays: data.etaToFillDays,
        jobGrade: data.jobGrade,
        costCenter: data.costCenter,
        jobDescription: data.jobDescription,
        requirements: data.requirements ? JSON.parse(JSON.stringify(data.requirements)) : undefined,
        niceToHave: data.niceToHave ? JSON.parse(JSON.stringify(data.niceToHave)) : undefined,
        benefits: data.benefits ? JSON.parse(JSON.stringify(data.benefits)) : undefined,
        skills: data.skills ? JSON.parse(JSON.stringify(data.skills)) : undefined,
        skillWeights: data.skillWeights ? JSON.parse(JSON.stringify(data.skillWeights)) : undefined,
        education: data.education,
        passingYear: data.passingYear,
        technicalQuestions: data.technicalQuestions ? JSON.parse(JSON.stringify(data.technicalQuestions)) : undefined,
        referralBonusAmount: data.referralBonusAmount,
        careerPageVisible: data.careerPageVisible,
        internalPostingOnly: data.internalPostingOnly,
        postToJobPortal: data.postToJobPortal,
        rolePurpose: data.rolePurpose,
        responsibilities: data.responsibilities ? JSON.parse(JSON.stringify(data.responsibilities)) : undefined,
        priority: data.priority,
        status: "PendingApproval",
        raisedById: raiserId,
        raisedAt: new Date(),
        justification: data.justification,
        createdById: raiserId,
        createdBy: userId, updatedBy: userId,
      },
    });

    // One approval row per resolved chain level (role left null — chain levels
    // aren't the legacy DeptHead/HR roles).
    await prisma.requisitionApproval.createMany({
      data: chain.levels.map((l) => ({
        orgId, requisitionId: requisition.id, approverId: l.approverId, level: l.level, status: "Pending" as const,
      })),
    });

    // Mail only the level-1 approver. Later levels are mailed as each one approves.
    const first = chain.levels[0];
    const firstApprover = await prisma.employee.findFirst({
      where: { id: first.approverId, orgId },
      select: { firstName: true, lastName: true, workEmail: true },
    });
    if (firstApprover) {
      void mailRequisitionApprovalRequest({
        orgId, requisitionId: requisition.id,
        recipientName: `${firstApprover.firstName} ${firstApprover.lastName}`.trim(),
        recipientEmail: firstApprover.workEmail,
        approverRole: "DeptHead", // variant selector only — picks the "request" email
        raiserName: `${raiser.firstName} ${raiser.lastName}`.trim(),
      }).catch((e) => console.error("[requisition] approver mail failed:", e));
    }

    return successResponse({ requisition }, undefined, 201);
  } catch (e) {
    console.error("POST /requisitions/raise", e);
    return internalError();
  }
});
