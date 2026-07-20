import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, withServiceAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createRequisitionSchema } from "@/lib/validations/recruit";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { generateRequisitionNumber } from "@/lib/utils/requisition-number";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { fireWorkflow } from "@/lib/workflows/executor";
import type { Prisma } from "@quikit/database";

export const GET = withServiceAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const search = searchParams.get("search");

    const { data, total } = await (async () => {
      const where: Prisma.JobRequisitionWhereInput = {
        orgId, deletedAt: null,
        ...(status && { status: status as Prisma.JobRequisitionWhereInput["status"] }),
        ...(priority && { priority: priority as Prisma.JobRequisitionWhereInput["priority"] }),
        ...(search && { OR: [
          { title: { contains: search, mode: "insensitive" } },
          { requisitionNumber: { contains: search, mode: "insensitive" } },
        ] }),
      };

      const [reqs, total] = await Promise.all([
        prisma.jobRequisition.findMany({
          where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
          include: {
            department: { select: { id: true, name: true } },
            hiringManager: { select: { id: true, firstName: true, lastName: true } },
            recruiter: { select: { id: true, firstName: true, lastName: true } },
            pipeline: { select: { id: true, name: true, isDefault: true } },
            _count: { select: { applications: true } },
          },
        }),
        prisma.jobRequisition.count({ where }),
      ]);
      return { data: reqs, total };
    })();
    return successResponse(data, paginationMeta(page, limit, total));
  } catch (error) { console.error("GET /recruit/requisitions error:", error); return internalError(); }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createRequisitionSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;
    const requisitionNumber = await generateRequisitionNumber(orgId);
    const creatorEmpId = await resolveEmployeeId(orgId, userId);
    if (!creatorEmpId) return validationError("Employee record not found for current user");

    // Verify pipeline belongs to this tenant.
    const pipeline = await prisma.hiringPipeline.findFirst({
      where: { id: data.pipelineId, orgId, deletedAt: null },
    });
    if (!pipeline) return validationError("Selected pipeline not found");

    const req_ = await prisma.jobRequisition.create({
      data: {
        orgId, requisitionNumber,
        pipelineId: data.pipelineId,
        title: data.title, departmentId: data.departmentId,
        reportingToId: data.reportingToId, positions: data.positions,
        type: data.type, employmentType: data.employmentType, workLocation: data.workLocation,
        experienceMin: data.experienceMin, experienceMax: data.experienceMax,
        salaryMin: data.salaryMin, salaryMax: data.salaryMax, salaryCurrency: data.salaryCurrency,
        jobDescription: data.jobDescription,
        responsibilities: data.responsibilities ? JSON.parse(JSON.stringify(data.responsibilities)) : undefined,
        requirements: data.requirements ? JSON.parse(JSON.stringify(data.requirements)) : undefined,
        niceToHave: data.niceToHave ? JSON.parse(JSON.stringify(data.niceToHave)) : undefined,
        skills: data.skills ? JSON.parse(JSON.stringify(data.skills)) : undefined,
        skillWeights: data.skillWeights ? JSON.parse(JSON.stringify(data.skillWeights)) : undefined,
        education: data.education,
        passingYear: data.passingYear,
        technicalQuestions: data.technicalQuestions ? JSON.parse(JSON.stringify(data.technicalQuestions)) : undefined,
        benefits: data.benefits ? JSON.parse(JSON.stringify(data.benefits)) : undefined,
        priority: data.priority,
        careerPageVisible: data.careerPageVisible,
        internalPostingOnly: data.internalPostingOnly,
        postToJobPortal: data.postToJobPortal,
        referralBonusAmount: data.referralBonusAmount,
        rolePurpose: data.rolePurpose,
        // Previously dropped on create — persisted so they show up when editing.
        interviewPanel: data.interviewPanelIds ? JSON.parse(JSON.stringify(data.interviewPanelIds)) : undefined,
        jobOpeningName: data.jobOpeningName,
        budget: data.budget,
        jobGrade: data.jobGrade,
        costCenter: data.costCenter,
        jobLocation: data.jobLocation,
        jobDuration: data.jobDuration,
        workTimings: data.workTimings,
        interviewMode: data.interviewMode,
        etaToFillDays: data.etaToFillDays,
        targetJoiningDate: data.targetJoiningDate ? new Date(data.targetJoiningDate) : undefined,
        closedDate: data.closedDate ? new Date(data.closedDate) : undefined,
        createdById: creatorEmpId, hiringManagerId: data.hiringManagerId, recruiterId: data.recruiterId,
        createdBy: userId, updatedBy: userId,
      },
      include: { department: { select: { id: true, name: true } } },
    });

    void fireWorkflow({
      orgId, event: "recruit.requisition.created",
      payload: { requisitionId: req_.id, title: req_.title, departmentId: req_.departmentId },
    });

    return successResponse(req_, undefined, 201);
  } catch (error) { console.error("POST /recruit/requisitions error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.recruit.write"] });
