import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, notFound } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { resolveDeptHeadApprover, resolveHrApprover, mailRequisitionApprovalRequest } from "@/lib/services/requisition-approval-service";

const schema = z.object({
  title: z.string().min(2).max(200),
  departmentId: z.string().optional(),
  positions: z.number().int().min(1).max(999).default(1),
  type: z.enum(["NewPosition", "Replacement", "Expansion"]).default("NewPosition"),
  employmentType: z.enum(["FullTime", "PartTime", "Contract", "Intern", "Consultant"]).default("FullTime"),
  workLocation: z.enum(["Office", "Remote", "Hybrid"]).default("Office"),
  experienceMin: z.number().int().optional(),
  experienceMax: z.number().int().optional(),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  jobDescription: z.string().optional(),
  justification: z.string().min(10, "Business justification is required").max(5000),
  targetJoiningDate: z.string().optional(),
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

    // Resolve approvers: DeptHead first, then HR (excluding raiser for self-safety)
    const deptHead = await resolveDeptHeadApprover(orgId, deptId, raiserId);
    if (!deptHead) return validationError("No Department Head approver found — contact HR");
    const hrApprover = await resolveHrApprover(orgId, raiserId);
    if (!hrApprover) return validationError("No HR approver configured");

    const requisition = await prisma.jobRequisition.create({
      data: {
        orgId,
        requisitionNumber: reqNumber(),
        title: data.title,
        departmentId: deptId ?? undefined,
        positions: data.positions,
        type: data.type,
        employmentType: data.employmentType,
        workLocation: data.workLocation,
        experienceMin: data.experienceMin,
        experienceMax: data.experienceMax,
        salaryMin: data.salaryMin,
        salaryMax: data.salaryMax,
        jobDescription: data.jobDescription,
        priority: data.priority,
        status: "PendingApproval",
        raisedById: raiserId,
        raisedAt: new Date(),
        justification: data.justification,
        createdById: raiserId,
        createdBy: userId, updatedBy: userId,
      },
    });

    await prisma.requisitionApproval.createMany({
      data: [
        { orgId, requisitionId: requisition.id, approverId: deptHead.id,    level: 1, role: "DeptHead", status: "Pending" },
        { orgId, requisitionId: requisition.id, approverId: hrApprover.id, level: 2, role: "HR",       status: "Pending" },
      ],
    });

    // Mail only the first approver (DeptHead). HR gets mail after DeptHead approves.
    void mailRequisitionApprovalRequest({
      orgId, requisitionId: requisition.id,
      recipientName: `${deptHead.firstName} ${deptHead.lastName}`.trim(),
      recipientEmail: deptHead.workEmail,
      approverRole: "DeptHead",
      raiserName: `${raiser.firstName} ${raiser.lastName}`.trim(),
    }).catch((e) => console.error("[requisition] DeptHead mail failed:", e));

    return successResponse({
      requisition,
      approvers: {
        deptHead: { name: `${deptHead.firstName} ${deptHead.lastName}`.trim(), email: deptHead.workEmail },
        hr: { name: `${hrApprover.firstName} ${hrApprover.lastName}`.trim(), email: hrApprover.workEmail },
      },
    }, undefined, 201);
  } catch (e) {
    console.error("POST /requisitions/raise", e);
    return internalError();
  }
});
