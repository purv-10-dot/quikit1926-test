import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { assignLeaveGroupSchema } from "@/lib/validations/leave";
import { createAuditLog } from "@/lib/utils/audit";
import { APP_ID } from "@/lib/rbac/registry";

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
    }
    if (roleIds.length) {
      const valid = await prisma.hrmsAppRole.count({
        where: { orgId: orgId, appId: APP_ID, id: { in: roleIds } },
      });
      if (valid !== new Set(roleIds).size) return validationError("Invalid role(s) selected");
    }

    const created = [];
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
        // ignore duplicates (unique constraint)
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
});

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
});
