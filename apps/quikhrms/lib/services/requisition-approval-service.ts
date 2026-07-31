import { prisma } from "@/lib/prisma";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildRequisitionApprovalEmail } from "@/lib/email-templates/requisition-approval";
import { whereEmployeeHasAnyRole, sortByMaxRolePriorityDesc, appRolesNameSelect } from "@/lib/rbac/queries";
import { appBaseUrl } from "@/lib/utils/app-url";

export async function resolveDeptHeadApprover(orgId: string, departmentId: string | null, raiserId: string): Promise<{ id: string; firstName: string; lastName: string; workEmail: string | null } | null> {
  if (departmentId) {
    const dept = await prisma.department.findFirst({
      where: { id: departmentId, orgId, deletedAt: null },
      select: {
        headId: true,
        head: { select: { id: true, firstName: true, lastName: true, workEmail: true } },
      },
    });
    if (dept?.head && dept.head.id !== raiserId) return dept.head;
  }
  // Fallback: highest-priority active manager in same department (excluding raiser).
  // Priority gone from AppRole — fetch candidates + JS-sort by ROLE_PRIORITY.
  if (departmentId) {
    const mgrs = await prisma.employee.findMany({
      where: {
        orgId, deletedAt: null, status: "Active",
        departmentId,
        id: { not: raiserId },
        ...whereEmployeeHasAnyRole(["admin"]),
      },
      select: { id: true, firstName: true, lastName: true, workEmail: true, ...appRolesNameSelect },
    });
    const mgr = sortByMaxRolePriorityDesc(mgrs)[0] ?? null;
    if (mgr) return { id: mgr.id, firstName: mgr.firstName, lastName: mgr.lastName, workEmail: mgr.workEmail };
  }
  // Absolute fallback: raiser's reporting manager
  const raiser = await prisma.employee.findUnique({
    where: { id: raiserId },
    select: { reportingManagerId: true },
  });
  if (raiser?.reportingManagerId) {
    return prisma.employee.findFirst({
      where: { id: raiser.reportingManagerId, orgId, deletedAt: null, status: "Active" },
      select: { id: true, firstName: true, lastName: true, workEmail: true },
    });
  }
  return null;
}

export async function resolveHrApprover(orgId: string, excludeId?: string | null): Promise<{ id: string; firstName: string; lastName: string; workEmail: string | null } | null> {
  const hrs = await prisma.employee.findMany({
    where: {
      orgId, deletedAt: null, status: "Active",
      ...(excludeId ? { id: { not: excludeId } } : {}),
      ...whereEmployeeHasAnyRole(["admin"]),
    },
    select: { id: true, firstName: true, lastName: true, workEmail: true, ...appRolesNameSelect },
  });
  const hr = sortByMaxRolePriorityDesc(hrs)[0] ?? null;
  if (!hr) return null;
  return { id: hr.id, firstName: hr.firstName, lastName: hr.lastName, workEmail: hr.workEmail };
}

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
