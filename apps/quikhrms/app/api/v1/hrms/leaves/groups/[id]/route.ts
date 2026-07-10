import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, conflict, internalError } from "@/lib/api-response";
import { updateLeaveGroupSchema } from "@/lib/validations/leave";
import { createAuditLog } from "@/lib/utils/audit";
import { APP_ID } from "@/lib/rbac/registry";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const group = await prisma.leaveGroup.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        items: {
          include: { leaveType: { select: { id: true, name: true, code: true, color: true } } },
        },
        assignments: true,
      },
    });
    if (!group) return notFound("Leave group not found");

    const empIds = group.assignments.filter((a) => a.employeeId).map((a) => a.employeeId!) as string[];
    const roleIds = group.assignments.filter((a) => a.roleId).map((a) => a.roleId!) as string[];

    const [employees, roles] = await Promise.all([
      empIds.length
        ? prisma.employee.findMany({
            where: { orgId, id: { in: empIds }, deletedAt: null },
            select: { id: true, firstName: true, lastName: true, employeeCode: true, jobTitle: true, profilePhoto: true },
          })
        : [],
      roleIds.length
        ? prisma.hrmsAppRole.findMany({
            where: { orgId: orgId, appId: APP_ID, id: { in: roleIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);

    const empMap = new Map(employees.map((e) => [e.id, e]));
    const roleMap = new Map(roles.map((r) => [r.id, r]));

    return successResponse({
      ...group,
      assignments: group.assignments.map((a) => ({
        ...a,
        employee: a.employeeId ? empMap.get(a.employeeId) ?? null : null,
        role: a.roleId ? roleMap.get(a.roleId) ?? null : null,
      })),
    });
  } catch (error) {
    console.error("GET /leaves/groups/[id] error:", error);
    return internalError();
  }
});

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.leaveGroup.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Leave group not found");

    const body = await req.json();
    const parsed = updateLeaveGroupSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const data = parsed.data;

    if (data.name && data.name !== existing.name) {
      const dup = await prisma.leaveGroup.findFirst({
        where: { orgId, name: data.name, deletedAt: null, NOT: { id: params.id } },
      });
      if (dup) return conflict("Another leave group with this name exists");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const g = await tx.leaveGroup.update({
        where: { id: params.id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          updatedBy: userId,
        },
      });

      if (data.items) {
        const typeIds = data.items.map((i) => i.leaveTypeId);
        const validTypes = await tx.leaveType.count({
          where: { orgId, deletedAt: null, id: { in: typeIds } },
        });
        if (validTypes !== typeIds.length) throw new Error("INVALID_TYPES");

        await tx.leaveGroupItem.deleteMany({ where: { leaveGroupId: params.id } });
        await tx.leaveGroupItem.createMany({
          data: data.items.map((i) => ({
            orgId,
            leaveGroupId: params.id,
            leaveTypeId: i.leaveTypeId,
            overrideQuota: i.overrideQuota ?? null,
          })),
        });
      }

      return g;
    });

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "LeaveGroup", entityId: params.id,
      changes: { fields: Object.keys(data) },
    });

    return successResponse(updated);
  } catch (error) {
    if ((error as Error).message === "INVALID_TYPES") return validationError("Invalid leave type(s) selected");
    console.error("PATCH /leaves/groups/[id] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.leave.manage"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.leaveGroup.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Leave group not found");

    const assigned = await prisma.leaveGroupAssignment.count({ where: { orgId, leaveGroupId: params.id } });
    if (assigned > 0) {
      return conflict(`Cannot delete — ${assigned} assignee${assigned === 1 ? "" : "s"} still linked. Remove assignments first.`);
    }

    await prisma.leaveGroup.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });

    await createAuditLog({
      orgId, userId, action: "Delete", entityType: "LeaveGroup", entityId: params.id,
      changes: { name: existing.name },
    });

    return successResponse({ deleted: true });
  } catch (error) {
    console.error("DELETE /leaves/groups/[id] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.leave.manage"] });
