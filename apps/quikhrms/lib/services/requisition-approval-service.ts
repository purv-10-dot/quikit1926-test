import { prisma } from "@/lib/prisma";
import { queueEmail } from "@/lib/services/mailer";
import { buildRequisitionApprovalEmail } from "@/lib/email-templates/requisition-approval";
import { whereEmployeeHasAnyRole, sortByMaxRolePriorityDesc, appRolesNameSelect } from "@/lib/rbac/queries";

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
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";
  const openCount = await openHeadcountForDept(params.orgId, req.departmentId);

  const tpl = buildRequisitionApprovalEmail({
    variant: params.approverRole === "HR" ? "approved_to_next" : "request_to_approver",
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
  });
  await queueEmail(params.orgId, { to: params.recipientEmail, subject: tpl.subject, html: tpl.html, kind: "requisition.approval" });
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
  const tpl = buildRequisitionApprovalEmail({
    variant: "decision_to_raiser",
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
  });
  await queueEmail(params.orgId, { to: params.raiserEmail, subject: tpl.subject, html: tpl.html, kind: "requisition.decision" });
}
