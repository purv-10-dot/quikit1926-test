import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, withServiceAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, errorResponse } from "@/lib/api-response";
import { ErrorCode } from "@/lib/types/api";
import { createLeaveRequestSchema } from "@/lib/validations/leave";
import { createAuditLog } from "@/lib/utils/audit";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { fireWorkflow } from "@/lib/workflows/executor";
import { resolveScope, employeeScopeFilter, getCallerEmployeeId } from "@/lib/rbac/scope";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { resolveApprovalChainLevels } from "@/lib/services/approval-chain";
import { getHierarchyAccessibleEmployeeIds, intersectEmployeeIds } from "@/lib/rbac/hierarchy";
import { forbidden } from "@/lib/api-response";
import { resolveActivePolicyRules, evaluateLeavePolicy } from "@/lib/services/leave-policy-engine";
import type { Prisma } from "@quikit/database";

/** GET /api/v1/hrms/leaves/requests */
export const GET = withServiceAuth(async (req: NextRequest, ctx) => {
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
    let approverId = searchParams.get("approverId");

    if (employeeId === "me" || employeeId === userId) {
      employeeId = (await getCallerEmployeeId(ctx)) ?? employeeId;
    }
    if (managerId === "me" || managerId === userId) {
      managerId = (await getCallerEmployeeId(ctx)) ?? managerId;
    }
    let approverSelfView = false;
    if (approverId === "me" || approverId === userId) {
      approverId = (await getCallerEmployeeId(ctx)) ?? approverId;
      approverSelfView = true;
    }

    // Self-approver view: requests the caller is an approver on. Being an
    // approver is itself the authorization (same rule as pending-approvals), so
    // this bypasses leave-read scope + hierarchy narrowing — an approver can
    // always see the requests routed through them, even without broad read
    // permission. Strictly limited to rows where they hold an approval.
    if (approverSelfView && approverId) {
      const selfWhere: Prisma.LeaveRequestWhereInput = {
        orgId,
        deletedAt: null,
        approvals: { some: { approverId } },
        ...(status && { status: status as Prisma.LeaveRequestWhereInput["status"] }),
        ...(leaveTypeId && { leaveTypeId }),
      };
      if (dateFrom || dateTo) {
        selfWhere.startDate = {
          ...(dateFrom && { gte: new Date(dateFrom) }),
          ...(dateTo && { lte: new Date(dateTo) }),
        };
      }
      const [selfRequests, selfTotal] = await Promise.all([
        prisma.leaveRequest.findMany({
          where: selfWhere,
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
        prisma.leaveRequest.count({ where: selfWhere }),
      ]);
      return successResponse(selfRequests, paginationMeta(page, limit, selfTotal));
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
      // approverId=me → requests the caller has an approval row on (routed to
      // them or already actioned by them) — powers the chain-approver history.
      ...(approverId && { approvals: { some: { approverId } } }),
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

/**
 * POST /api/v1/hrms/leaves/requests — apply for leave.
 *
 * withServiceAuth: this is the one intended AI-Runtime write tool (apply_leave,
 * P1-3). It runs as the acting employee (self only) and the resulting audit row
 * is attributed to the agent when the runtime applies it (P2-1).
 */
export const POST = withServiceAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId, userId } = ctx;
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

    // ── Balance enforcement (ALWAYS runs, independent of policy docs) ──
    // The policy engine's balance check only runs when an active leave-policy
    // document exists AND has a rule for this leave type. Most orgs have none,
    // so without this guard a request can exceed the employee's entitlement
    // (e.g. a 3-day request against a 1-day quota). Uses the same available-
    // balance formula as the balance cards + policy engine, and additionally
    // subtracts days already committed to other Pending/Approved requests of
    // this type this year (`taken` only increments on approval, so pending
    // requests don't reduce `available` — count them here to stop stacking).
    if (!leaveType.isNegativeBalanceAllowed || leaveType.maxNegativeBalance != null) {
      const startYear = start.getFullYear();
      const yStart = new Date(startYear, 0, 1);
      const yEnd = new Date(startYear, 11, 31, 23, 59, 59, 999);
      const [balRow, pendingAgg] = await Promise.all([
        prisma.leaveBalance.findFirst({
          where: { orgId, employeeId, leaveTypeId: leaveType.id, year: startYear, deletedAt: null },
          select: { accrued: true, taken: true, adjusted: true, carriedForward: true, encashed: true, lapsed: true },
        }),
        // `taken` only reflects Approved leave; Pending requests don't reduce it.
        // Subtract still-Pending days so a user can't stack requests past quota.
        prisma.leaveRequest.aggregate({
          where: {
            orgId, employeeId, leaveTypeId: leaveType.id,
            status: { in: ["Pending"] as never },
            startDate: { gte: yStart, lte: yEnd },
          },
          _sum: { duration: true },
        }),
      ]);
      const opening = Number(leaveType.maxBalance ?? 0);
      const available = opening
        + Number(balRow?.accrued ?? 0) + Number(balRow?.carriedForward ?? 0) + Number(balRow?.adjusted ?? 0)
        - Number(balRow?.taken ?? 0) - Number(balRow?.encashed ?? 0) - Number(balRow?.lapsed ?? 0);
      const pendingDays = Number(pendingAgg._sum.duration ?? 0);
      const effectiveAvailable = available - pendingDays;
      const remainingAfter = effectiveAvailable - duration;
      if (remainingAfter < 0) {
        if (!leaveType.isNegativeBalanceAllowed) {
          return validationError(
            `Insufficient ${leaveType.name} balance. Available: ${effectiveAvailable} day(s)` +
            (pendingDays > 0 ? ` (after ${pendingDays} pending)` : "") +
            `, requested: ${duration}.`,
          );
        }
        if (leaveType.maxNegativeBalance != null && Math.abs(remainingAfter) > Number(leaveType.maxNegativeBalance)) {
          return validationError(
            `Requesting ${duration} day(s) would exceed the allowed negative balance of ${Number(leaveType.maxNegativeBalance)} day(s) for ${leaveType.name}.`,
          );
        }
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

    // Approvers come from the org's configured Leave approval chain — one
    // approval row per level, actioned in order (level 1 → 2 → … → Approved).
    // If no active chain is set up, applying is blocked (no manager/random
    // fallback). The APPROVAL_CHAIN_NOT_CONFIGURED code lets the UI offer a
    // "Notify admin" action.
    const chainResult = await resolveApprovalChainLevels(orgId, "Leave", employeeId);
    if (!chainResult.ok) {
      return errorResponse(
        ErrorCode.APPROVAL_CHAIN_NOT_CONFIGURED,
        chainResult.message,
        422,
        { module: "Leave", reason: chainResult.reason },
      );
    }
    const firstApproverId = chainResult.levels[0].approverId;

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
        approvals: {
          create: chainResult.levels.map((l) => ({
            orgId,
            approverId: l.approverId,
            level: l.level,
            status: "Pending" as const,
          })),
        },
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
        approverId: firstApproverId,
      },
    });

    // Attributable audit trail — when the AI Runtime applies leave on the
    // employee's behalf, `actor: ctx` stamps actorType/actingAgentId (P2-1).
    void createAuditLog({
      orgId,
      userId,
      action: "Create",
      entityType: "LeaveRequest",
      entityId: request.id,
      metadata: { leaveTypeId: request.leaveTypeId, duration: request.duration },
      request: req,
      actor: ctx,
    });

    return successResponse(request, undefined, 201);
  } catch (error) {
    console.error("POST /leaves/requests error:", error);
    return internalError();
  }
});
