import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createLeaveRequestSchema } from "@/lib/validations/leave";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { fireWorkflow } from "@/lib/workflows/executor";
import { resolveScope, employeeScopeFilter, getCallerEmployeeId } from "@/lib/rbac/scope";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { getHierarchyAccessibleEmployeeIds, intersectEmployeeIds } from "@/lib/rbac/hierarchy";
import { forbidden } from "@/lib/api-response";
import { resolveActivePolicyRules, evaluateLeavePolicy } from "@/lib/services/leave-policy-engine";
import type { Prisma } from "@quikit/database";

/** GET /api/v1/hrms/leaves/requests */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId, userId } = ctx;
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);

    let employeeId = searchParams.get("employeeId");
    const status = searchParams.get("status");
    const leaveTypeId = searchParams.get("leaveTypeId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    let managerId = searchParams.get("managerId");

    if (employeeId === "me" || employeeId === userId) {
      employeeId = (await getCallerEmployeeId(ctx)) ?? employeeId;
    }
    if (managerId === "me" || managerId === userId) {
      managerId = (await getCallerEmployeeId(ctx)) ?? managerId;
    }

    const scope = resolveScope(ctx, {
      all: "hrms.leave.read",
      team: "hrms.leave.read_team",
      self: "hrms.leave.read_self",
    });
    const scopeFilter = await employeeScopeFilter(ctx, scope);
    if (!scopeFilter.allow) return forbidden("No leave read permission");

    // Enforce role-priority hierarchy: lower-priority roles can not see higher-priority employees' leaves
    const hierarchy = await getHierarchyAccessibleEmployeeIds(ctx);
    const finalEmployeeIds = intersectEmployeeIds(scopeFilter.employeeIds, hierarchy);
    if (finalEmployeeIds && finalEmployeeIds.length === 0) {
      return successResponse([], paginationMeta(page, limit, 0));
    }

    // If explicit employeeId is requested, verify it's within hierarchy
    if (employeeId && !hierarchy.unlimited && !(hierarchy.employeeIds ?? []).includes(employeeId)) {
      return forbidden("Cannot view leaves of an employee above your role hierarchy");
    }

    const where: Prisma.LeaveRequestWhereInput = {
      orgId,
      deletedAt: null,
      ...(employeeId && { employeeId }),
      ...(status && { status: status as Prisma.LeaveRequestWhereInput["status"] }),
      ...(leaveTypeId && { leaveTypeId }),
      ...(managerId && { employee: { reportingManagerId: managerId } }),
      ...(finalEmployeeIds && { employeeId: { in: finalEmployeeIds } }),
    };

    if (dateFrom || dateTo) {
      where.startDate = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo) }),
      };
    }

    const [requests, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        orderBy: { appliedOn: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          employee: {
            select: {
              id: true, firstName: true, lastName: true, employeeCode: true,
              profilePhoto: true, department: { select: { id: true, name: true } },
            },
          },
          leaveType: { select: { id: true, name: true, code: true, color: true } },
          approvals: {
            include: { approver: { select: { id: true, firstName: true, lastName: true } } },
            orderBy: { level: "asc" },
          },
        },
      }),
      prisma.leaveRequest.count({ where }),
    ]);

    return successResponse(requests, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /leaves/requests error:", error);
    return internalError();
  }
});

/** POST /api/v1/hrms/leaves/requests — apply for leave */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createLeaveRequestSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;

    // Auto-compute duration from date range if not provided
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return validationError("Invalid date range");
    }
    if (end < start) {
      return validationError("End date must be on or after start date");
    }
    const duration = data.duration ?? Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    const leaveType = await prisma.leaveType.findFirst({
      where: { id: data.leaveTypeId, orgId, deletedAt: null },
    });

    if (!leaveType) return validationError("Invalid leave type");

    // Resolve auth userId to the caller's real Employee.id (exact match wins;
    // admin fallback is dev-only) so we never apply leave as the wrong person.
    const meId = await resolveEmployeeId(orgId, userId);
    const employee = meId
      ? await prisma.employee.findFirst({
          where: { orgId, deletedAt: null, id: meId },
          select: {
            id: true, reportingManagerId: true, gender: true, employmentType: true,
            workerType: true, dateOfJoining: true, departmentId: true,
            appRoles: { select: { roleId: true }, take: 1 },
          },
        })
      : null;
    if (!employee) return validationError("Employee record not found");
    const employeeId = employee.id;
    const employeeRoleId = employee.appRoles[0]?.roleId ?? null;

    // ── Frequency caps — max leave REQUESTS of this type per month / year ──
    // Counts the employee's existing Pending + Approved requests of this type
    // whose start date falls in the same month / year as the new request.
    if (leaveType.maxPerMonth != null || leaveType.maxPerYear != null) {
      const activeStatuses = ["Pending", "Approved"];
      if (leaveType.maxPerMonth != null) {
        const mStart = new Date(start.getFullYear(), start.getMonth(), 1);
        const mEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
        const used = await prisma.leaveRequest.count({
          where: {
            orgId, employeeId, leaveTypeId: leaveType.id,
            status: { in: activeStatuses as never },
            startDate: { gte: mStart, lte: mEnd },
          },
        });
        if (used >= leaveType.maxPerMonth) {
          return validationError(`Limit reached: max ${leaveType.maxPerMonth} ${leaveType.name} request(s) per month.`);
        }
      }
      if (leaveType.maxPerYear != null) {
        const yStart = new Date(start.getFullYear(), 0, 1);
        const yEnd = new Date(start.getFullYear(), 11, 31, 23, 59, 59, 999);
        const used = await prisma.leaveRequest.count({
          where: {
            orgId, employeeId, leaveTypeId: leaveType.id,
            status: { in: activeStatuses as never },
            startDate: { gte: yStart, lte: yEnd },
          },
        });
        if (used >= leaveType.maxPerYear) {
          return validationError(`Limit reached: max ${leaveType.maxPerYear} ${leaveType.name} request(s) per year.`);
        }
      }
    }

    // ── Once-in-a-lifetime cap (e.g. Marriage Leave) ──
    // The employee may take this leave type only a single time, ever. Any prior
    // Pending/Approved request of the same type blocks a new one.
    if (leaveType.isOnceInLifetime) {
      const priorCount = await prisma.leaveRequest.count({
        where: {
          orgId, employeeId, leaveTypeId: leaveType.id,
          status: { in: ["Pending", "Approved"] as never },
        },
      });
      if (priorCount > 0) {
        return validationError(`${leaveType.name} can only be availed once. You have already applied for it.`);
      }
    }

    // ── Policy enforcement ─────────────────────────────────
    const policyRules = await resolveActivePolicyRules({
      orgId,
      employee: {
        gender: employee.gender,
        employmentType: employee.employmentType,
        workerType: employee.workerType,
        dateOfJoining: employee.dateOfJoining,
        departmentId: employee.departmentId,
        roleId: employeeRoleId,
      },
    });

    if (policyRules) {
      const evaluation = await evaluateLeavePolicy({
        ctx: {
          orgId,
          employeeId,
          startDate: start,
          endDate: end,
          duration,
          leaveTypeCode: leaveType.code,
          leaveTypeId: leaveType.id,
          isPlanned: data.isPlanned,
          hasAttachments: Array.isArray(data.attachments) && data.attachments.length > 0,
        },
        employee: {
          gender: employee.gender,
          employmentType: employee.employmentType,
          workerType: employee.workerType,
          dateOfJoining: employee.dateOfJoining,
          departmentId: employee.departmentId,
          roleId: employeeRoleId,
        },
        rules: policyRules,
      });

      if (!evaluation.ok) {
        return validationError("Leave policy violation", {
          violations: evaluation.violations,
        });
      }
    }

    // Resolve approver: reporting manager → HR fallback → any other active employee
    let approverId: string | null = employee.reportingManagerId ?? null;
    if (!approverId) {
      const hrFallback = await prisma.employee.findFirst({
        where: {
          orgId,
          deletedAt: null,
          status: "Active",
          id: { not: employeeId },
          department: { code: "HR" },
        },
        select: { id: true },
      });
      approverId = hrFallback?.id ?? null;
    }
    if (!approverId) {
      const anyFallback = await prisma.employee.findFirst({
        where: { orgId, deletedAt: null, status: "Active", id: { not: employeeId } },
        select: { id: true },
      });
      approverId = anyFallback?.id ?? null;
    }

    const request = await prisma.leaveRequest.create({
      data: {
        orgId,
        employeeId,
        leaveTypeId: data.leaveTypeId,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        duration,
        dayBreakdown: data.dayBreakdown ? JSON.parse(JSON.stringify(data.dayBreakdown)) : undefined,
        reason: data.reason,
        attachments: data.attachments ? JSON.parse(JSON.stringify(data.attachments)) : undefined,
        status: "Pending",
        isPlanned: data.isPlanned,
        createdBy: userId,
        updatedBy: userId,
        approvals: approverId ? {
          create: {
            orgId,
            approverId,
            level: 1,
            status: "Pending",
          },
        } : undefined,
      },
      include: {
        leaveType: { select: { id: true, name: true, code: true, color: true } },
        approvals: {
          include: { approver: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });

    void fireWorkflow({
      orgId,
      event: "leave.requested",
      payload: {
        employeeId,
        leaveRequestId: request.id,
        leaveTypeId: request.leaveTypeId,
        duration: request.duration,
        startDate: request.startDate,
        endDate: request.endDate,
        approverId,
      },
    });

    return successResponse(request, undefined, 201);
  } catch (error) {
    console.error("POST /leaves/requests error:", error);
    return internalError();
  }
});
