import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { assignLeaveGroupSchema } from "@/lib/validations/leave";
import { createAuditLog } from "@/lib/utils/audit";
import { APP_ID } from "@/lib/rbac/registry";
import { allocateGroupLeaveBalances } from "@/lib/services/leave-allocation";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const group = await prisma.leaveGroup.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!group) return notFound("Leave group not found");

    const body = await req.json();
    const parsed = assignLeaveGroupSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const { assignments } = parsed.data;

    const empIds = assignments.filter((a) => a.employeeId).map((a) => a.employeeId!) as string[];
    const roleIds = assignments.filter((a) => a.roleId).map((a) => a.roleId!) as string[];

    if (empIds.length) {
      const valid = await prisma.employee.count({
        where: { orgId, id: { in: empIds }, deletedAt: null },
      });
      if (valid !== new Set(empIds).size) return validationError("Invalid employee(s) selected");

      // Exclusivity: an employee may belong to at most ONE leave group. Reject
      // if any selected employee is already assigned to a different active
      // group, and name them so the admin knows where to unassign first.
      const conflicts = await prisma.leaveGroupAssignment.findMany({
        where: {
          orgId,
          assigneeType: "Employee",
          employeeId: { in: empIds },
          leaveGroupId: { not: params.id },
          leaveGroup: { deletedAt: null },
        },
        select: { employeeId: true, leaveGroup: { select: { name: true } } },
      });
      if (conflicts.length) {
        const emps = await prisma.employee.findMany({
          where: { orgId, id: { in: conflicts.map((c) => c.employeeId!).filter(Boolean) } },
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        });
        const nameById = new Map(emps.map((e) => [e.id, `${e.firstName} ${e.lastName} (${e.employeeCode})`]));
        const detail = conflicts
          .map((c) => `${nameById.get(c.employeeId!) ?? c.employeeId} — already in "${c.leaveGroup?.name ?? "another group"}"`)
          .join("; ");
        return validationError(
          `An employee can only be in one leave group. Unassign them from their current group first: ${detail}`,
        );
      }
    }
    if (roleIds.length) {
      const valid = await prisma.hrmsAppRole.count({
        where: { orgId: orgId, appId: APP_ID, id: { in: roleIds } },
      });
      if (valid !== new Set(roleIds).size) return validationError("Invalid role(s) selected");
    }

    const created = [];
    // Employees whose leave balances need (re)allocating once the assignment
    // rows exist — a direct Employee assignment covers just that employee; a
    // Role assignment covers every active employee holding that role, EXCEPT
    // those with their OWN direct assignment to a different group (a direct
    // assignment always wins over a role one — see resolveEmployeeLeaveGroup).
    // Computed even when the assignment row ALREADY existed (duplicate insert
    // below), so re-submitting an existing assignment self-heals an employee
    // who was assigned before this backfill existed — no separate "recalculate"
    // action needed.
    const employeesToAllocate = new Map<string, { dateOfJoining: Date }>();
    for (const a of assignments) {
      try {
        const row = await prisma.leaveGroupAssignment.create({
          data: {
            orgId,
            leaveGroupId: params.id,
            assigneeType: a.assigneeType,
            employeeId: a.employeeId ?? null,
            roleId: a.roleId ?? null,
            createdBy: userId,
          },
        });
        created.push(row);
      } catch {
        // Duplicate (unique constraint) — assignment already exists; still
        // fall through to backfill below.
      }

      if (a.assigneeType === "Employee" && a.employeeId) {
        const emp = await prisma.employee.findFirst({
          where: { id: a.employeeId, orgId, deletedAt: null },
          select: { dateOfJoining: true },
        });
        if (emp?.dateOfJoining) employeesToAllocate.set(a.employeeId, { dateOfJoining: emp.dateOfJoining });
      } else if (a.assigneeType === "Role" && a.roleId) {
        const holders = await prisma.employee.findMany({
          where: { orgId, deletedAt: null, status: "Active", appRoles: { some: { roleId: a.roleId } } },
          select: { id: true, dateOfJoining: true },
        });
        // Skip employees already directly assigned elsewhere — their direct
        // assignment wins, so this role grant never governs them.
        const directlyAssigned = await prisma.leaveGroupAssignment.findMany({
          where: {
            orgId, assigneeType: "Employee",
            employeeId: { in: holders.map((h) => h.id) },
            leaveGroup: { deletedAt: null, isActive: true },
          },
          select: { employeeId: true },
        });
        const excluded = new Set(directlyAssigned.map((d) => d.employeeId));
        for (const h of holders) {
          if (h.dateOfJoining && !excluded.has(h.id)) employeesToAllocate.set(h.id, { dateOfJoining: h.dateOfJoining });
        }
      }
    }

    // Backfill LeaveBalance rows for the group's leave types so the
    // employee(s) actually see their leave count — assigning to a group used
    // to leave this to chance (only join-time/onboarding allocation touched
    // LeaveBalance, and it never looked at group rules).
    for (const [employeeId, { dateOfJoining }] of employeesToAllocate) {
      try {
        await allocateGroupLeaveBalances({ orgId, employeeId, leaveGroupId: params.id, dateOfJoining, userId });
      } catch (e) {
        console.error(`[groups.assignments] leave balance allocation failed for ${employeeId}:`, e);
      }
    }

    await createAuditLog({
      orgId, userId, action: "Create", entityType: "LeaveGroupAssignment", entityId: params.id,
      changes: { added: created.length, groupName: group.name },
    });

    return successResponse({ added: created.length, assignments: created }, undefined, 201);
  } catch (error) {
    console.error("POST /leaves/groups/[id]/assignments error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.leave.manage"] });

export const DELETE = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const group = await prisma.leaveGroup.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!group) return notFound("Leave group not found");

    const { searchParams } = new URL(req.url);
    const assignmentId = searchParams.get("assignmentId");
    if (!assignmentId) return validationError("assignmentId required");

    const assignment = await prisma.leaveGroupAssignment.findFirst({
      where: { id: assignmentId, orgId, leaveGroupId: params.id },
    });
    if (!assignment) return notFound("Assignment not found");

    await prisma.leaveGroupAssignment.delete({ where: { id: assignmentId } });

    await createAuditLog({
      orgId, userId, action: "Delete", entityType: "LeaveGroupAssignment", entityId: assignmentId,
      changes: { groupName: group.name, assigneeType: assignment.assigneeType },
    });

    return successResponse({ removed: true });
  } catch (error) {
    console.error("DELETE /leaves/groups/[id]/assignments error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.leave.manage"] });
