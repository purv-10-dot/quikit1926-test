import { prisma } from "@/lib/prisma";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildRequisitionApprovalEmail } from "@/lib/email-templates/requisition-approval";
import { appBaseUrl } from "@/lib/utils/app-url";

export async function openHeadcountForDept(orgId: string, departmentId: string | null): Promise<number> {
  if (!departmentId) return 0;
  return prisma.jobRequisition.count({
    where: {
      orgId, deletedAt: null,
      departmentId,
      status: { in: ["PendingApproval", "ReqApproved", "ReqOpen"] },
    },
  });
}

interface MailRequestParams {
  orgId: string;
  requisitionId: string;
  recipientName: string;
  recipientEmail: string | null;
  approverRole: "DeptHead" | "HR";
  raiserName: string;
  previousComment?: string | null;
}

export async function mailRequisitionApprovalRequest(params: MailRequestParams): Promise<void> {
  if (!params.recipientEmail) return;
  const req = await prisma.jobRequisition.findFirst({
    where: { id: params.requisitionId, orgId: params.orgId },
    include: { department: { select: { name: true } } },
  });
  if (!req) return;
  const company = await prisma.companySettings.findUnique({
    where: { orgId: params.orgId }, select: { companyName: true },
  });
  const base = appBaseUrl();
  const openCount = await openHeadcountForDept(params.orgId, req.departmentId);

  const data = {
    variant: (params.approverRole === "HR" ? "approved_to_next" : "request_to_approver") as
      | "approved_to_next"
      | "request_to_approver",
    recipientName: params.recipientName,
    approverRole: params.approverRole,
    raiserName: params.raiserName,
    title: req.title,
    department: req.department?.name ?? null,
    positions: req.positions,
    employmentType: req.employmentType,
    workLocation: req.workLocation,
    justification: req.justification,
    reviewUrl: `${base}/recruit/approvals`,
    companyName: company?.companyName ?? "Our Company",
    openDeptHeadcount: openCount,
    comment: params.previousComment ?? null,
  };
  await resolveAndSend(params.orgId, {
    key: "requisition.approval",
    to: params.recipientEmail,
    vars: {
      recipientName: data.recipientName,
      raiserName: data.raiserName,
      title: data.title,
      department: data.department ?? "",
      positions: data.positions,
      employmentType: data.employmentType,
      workLocation: data.workLocation,
      justification: data.justification ?? "",
      reviewUrl: data.reviewUrl,
      openDeptHeadcount: data.openDeptHeadcount ?? "",
      companyName: data.companyName,
    },
    fallback: () => buildRequisitionApprovalEmail(data),
  });
}

export async function mailRequisitionDecision(params: {
  orgId: string;
  requisitionId: string;
  raiserName: string;
  raiserEmail: string | null;
  status: "Approved" | "Rejected";
  comment: string | null;
}): Promise<void> {
  if (!params.raiserEmail) return;
  const req = await prisma.jobRequisition.findFirst({
    where: { id: params.requisitionId, orgId: params.orgId },
    include: { department: { select: { name: true } } },
  });
  if (!req) return;
  const company = await prisma.companySettings.findUnique({
    where: { orgId: params.orgId }, select: { companyName: true },
  });
  const data = {
    variant: "decision_to_raiser" as const,
    recipientName: params.raiserName,
    raiserName: params.raiserName,
    title: req.title,
    department: req.department?.name ?? null,
    positions: req.positions,
    employmentType: req.employmentType,
    workLocation: req.workLocation,
    justification: req.justification,
    companyName: company?.companyName ?? "Our Company",
    status: params.status,
    comment: params.comment ?? null,
  };
  await resolveAndSend(params.orgId, {
    key: "requisition.decision",
    to: params.raiserEmail,
    vars: {
      recipientName: data.recipientName,
      raiserName: data.raiserName,
      title: data.title,
      department: data.department ?? "",
      positions: data.positions,
      employmentType: data.employmentType,
      workLocation: data.workLocation,
      status: data.status,
      comment: data.comment ?? "",
      reviewUrl: "",
      companyName: data.companyName,
    },
    fallback: () => buildRequisitionApprovalEmail(data),
  });
}
