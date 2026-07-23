import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, notFound } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { createWfhSchema } from "@/lib/validations/wfh";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildWfhNoticeEmail } from "@/lib/email-templates/wfh-notice";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { resolveEffectiveWfhQuotaGroup } from "@/lib/services/wfh-quota";
import { APP_ID, rolePriority } from "@/lib/rbac/registry";

export const GET = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const status = searchParams.get("status");
    const scope = searchParams.get("scope") ?? "me"; // me | team | all

    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return notFound("Employee record not found");

    const where: Record<string, unknown> = { orgId, deletedAt: null };
    if (status) where.status = status;

    if (scope === "me") {
      where.employeeId = employeeId;
    } else if (scope === "team") {
      const reports = await prisma.employee.findMany({
        where: { orgId, deletedAt: null, reportingManagerId: employeeId },
        select: { id: true },
      });
      where.employeeId = { in: reports.map((r) => r.id) };
    }
    // scope=all → no employee filter (HR / admin view)

    const [items, total] = await Promise.all([
      prisma.wfhRequest.findMany({
        where, orderBy: { appliedOn: "desc" }, skip: (page - 1) * limit, take: limit,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, jobTitle: true, department: { select: { name: true } } } },
          approvals: {
            orderBy: { level: "asc" },
            include: { approver: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
          },
        },
      }),
      prisma.wfhRequest.count({ where }),
    ]);

    return successResponse(items, paginationMeta(page, limit, total));
  } catch (e) {
    console.error("GET /wfh/requests", e);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return notFound("Employee record not found");

    const body = await req.json().catch(() => ({}));
    const parsed = createWfhSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const data = parsed.data;

    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (start.getTime() < today.getTime()) return validationError("Start date cannot be in the past");

    const oneDay = 24 * 60 * 60 * 1000;
    let days: number;
    if (data.isHalfDay) days = 0.5;
    else days = Math.floor((end.getTime() - start.getTime()) / oneDay) + 1;

    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, orgId, deletedAt: null },
      select: {
        id: true, firstName: true, lastName: true, employeeCode: true, jobTitle: true,
        reportingManagerId: true,
        department: { select: { name: true } },
        appRoles: { select: { role: { select: { name: true } } } },
      },
    });
    if (!employee) return notFound("Employee record not found");
    const employeeRoleName = employee.appRoles[0]?.role.name ?? null;

    // Yearly quota enforcement (effective group = explicit > department mapping)
    const effective = await resolveEffectiveWfhQuotaGroup(orgId, employeeId);
    if (effective.group) {
      const yearStart = new Date(start.getFullYear(), 0, 1);
      const yearEnd = new Date(start.getFullYear() + 1, 0, 1);
      const usedRows = await prisma.wfhRequest.findMany({
        where: {
          orgId, employeeId, deletedAt: null,
          status: { in: ["Pending", "Approved"] },
          startDate: { gte: yearStart, lt: yearEnd },
        },
        select: { days: true },
      });
      const used = usedRows.reduce((sum, r) => sum + Number(r.days), 0);
      if (used + days > effective.group.yearlyQuota) {
        return validationError(
          `WFH quota exceeded. Group "${effective.group.name}" allows ${effective.group.yearlyQuota} days/year. Already used: ${used}, remaining: ${Math.max(0, effective.group.yearlyQuota - used)}.`,
        );
      }
    }

    // Resolve HR + SuperAdmin reference roles via UserAppRole join.
    // Priorities now live in the static ROLE_PRIORITY map (registry.ts) since
    // AppRole no longer carries a `priority` column.
    const hrAdminPriority = rolePriority("admin");

    const hrApprovers = await prisma.hrmsUserAppRole.findMany({
      where: {
        orgId: orgId,
        role: { appId: APP_ID, name: { in: ["admin"] } },
        userId: { not: employee.id },
        employee: { orgId, deletedAt: null, status: "Active" },
      },
      select: {
        userId: true,
        role: { select: { name: true } },
        employee: { select: { id: true, firstName: true, lastName: true, workEmail: true } },
      },
    });
    // Prefer hr_admin over hr_manager via priority map.
    hrApprovers.sort(
      (a, b) => rolePriority(b.role.name) - rolePriority(a.role.name),
    );
    const hrApprover = hrApprovers[0]?.employee ?? null;

    const superAdminLink = await prisma.hrmsUserAppRole.findFirst({
      where: {
        orgId: orgId,
        role: { appId: APP_ID, name: "admin" },
        userId: { not: employee.id },
        employee: { orgId, deletedAt: null, status: "Active" },
      },
      select: { employee: { select: { id: true, firstName: true, lastName: true, workEmail: true } } },
    });
    const superAdminApprover = superAdminLink?.employee ?? null;

    // Decide approval flow
    //  - Employee is super_admin → auto-approve (no approver above)
    //  - Employee above HR Admin priority → SuperAdmin only
    //  - No reporting manager → HR only
    //  - Else → Manager → HR
    const empPriority = rolePriority(employeeRoleName);
    const isSuperAdminEmployee = employeeRoleName === "admin";
    const isAboveHr = !isSuperAdminEmployee && empPriority > hrAdminPriority;

    type FlowRow = { approverId: string; role: "Manager" | "HR" | "SuperAdmin"; approverName: string; approverEmail: string | null };
    const flow: FlowRow[] = [];

    if (isSuperAdminEmployee) {
      // Auto-approve path; no approvals required
    } else if (isAboveHr) {
      if (!superAdminApprover) return validationError("No Super Admin approver configured");
      flow.push({
        approverId: superAdminApprover.id,
        role: "SuperAdmin",
        approverName: `${superAdminApprover.firstName} ${superAdminApprover.lastName}`.trim(),
        approverEmail: superAdminApprover.workEmail,
      });
    } else {
      if (employee.reportingManagerId) {
        const mgr = await prisma.employee.findFirst({
          where: { id: employee.reportingManagerId, orgId, deletedAt: null },
          select: { id: true, firstName: true, lastName: true, workEmail: true },
        });
        if (mgr) {
          flow.push({
            approverId: mgr.id,
            role: "Manager",
            approverName: `${mgr.firstName} ${mgr.lastName}`.trim(),
            approverEmail: mgr.workEmail,
          });
        }
      }
      if (!hrApprover) return validationError("No HR approver configured");
      flow.push({
        approverId: hrApprover.id,
        role: "HR",
        approverName: `${hrApprover.firstName} ${hrApprover.lastName}`.trim(),
        approverEmail: hrApprover.workEmail,
      });
    }

    const wfh = await prisma.wfhRequest.create({
      data: {
        orgId, employeeId,
        startDate: start, endDate: end,
        days, isHalfDay: data.isHalfDay, session: data.session,
        reason: data.reason,
        attachments: data.attachments ? JSON.parse(JSON.stringify(data.attachments)) : null,
        status: isSuperAdminEmployee ? "Approved" : "Pending",
        createdBy: userId, updatedBy: userId,
      },
    });

    if (flow.length > 0) {
      await prisma.wfhApproval.createMany({
        data: flow.map((f, idx) => ({
          orgId, wfhRequestId: wfh.id,
          approverId: f.approverId, level: idx + 1, role: f.role, status: "Pending",
        })),
      });
    }

    // Notify first approver
    void (async () => {
      try {
        const first = flow[0];
        if (!first?.approverEmail) return;
        const company = await prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } });
        const wfhData = {
          variant: "submitted_to_manager" as const,
          recipientName: first.approverName,
          employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
          employeeCode: employee.employeeCode,
          jobTitle: employee.jobTitle,
          department: employee.department?.name ?? null,
          startDate: start.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }),
          endDate: end.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }),
          days: String(days),
          isHalfDay: data.isHalfDay,
          session: data.session,
          reason: data.reason,
          companyName: company?.companyName ?? "Our Company",
        };
        await resolveAndSend(orgId, {
          key: "wfh.approver-request",
          to: first.approverEmail,
          vars: { ...wfhData },
          fallback: () => buildWfhNoticeEmail(wfhData),
        });
      } catch (e) { console.error("wfh approver mail failed", e); }
    })();

    return successResponse(wfh, undefined, 201);
  } catch (e) {
    console.error("POST /wfh/requests", e);
    return internalError();
  }
});
