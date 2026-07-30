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
            select: { id: true, firstName: true, lastName: true, employeeCode: true, jobTitle: true, profilePhoto: true, department: { select: { name: true } } },
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
        const uniqueItems = Array.from(new Map(data.items.map((i) => [i.leaveTypeId, i])).values());
        // Keep only items whose leave type still exists (active). A leave type
        // deleted after being added to the group leaves a dangling item; drop it
        // (self-heal) instead of hard-blocking every future edit of this group.
        const validRows = await tx.leaveType.findMany({
          where: { orgId, deletedAt: null, id: { in: uniqueItems.map((i) => i.leaveTypeId) } },
          select: { id: true },
        });
        const validSet = new Set(validRows.map((r) => r.id));
        const keptItems = uniqueItems.filter((i) => validSet.has(i.leaveTypeId));
        if (keptItems.length === 0) throw new Error("INVALID_TYPES");

        await tx.leaveGroupItem.deleteMany({ where: { leaveGroupId: params.id } });
        await tx.leaveGroupItem.createMany({
          data: keptItems.map((i) => ({
            orgId,
            leaveGroupId: params.id,
            leaveTypeId: i.leaveTypeId,
            overrideQuota: i.overrideQuota ?? null,
            rules: i.rules ? JSON.parse(JSON.stringify(i.rules)) : undefined,
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

export const DELETE = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.leaveGroup.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Leave group not found");

    const moveToGroupId = new URL(req.url).searchParams.get("moveToGroupId");
    const assigned = await prisma.leaveGroupAssignment.count({ where: { orgId, leaveGroupId: params.id } });

    // A group with assignees can't be deleted outright — move them to another
    // group first (or the caller passes the target explicitly).
    if (assigned > 0) {
      if (!moveToGroupId) {
        return conflict(`Cannot delete — ${assigned} assignee${assigned === 1 ? "" : "s"} still linked. Move them to another group first.`);
      }
      if (moveToGroupId === params.id) return validationError("Choose a different group to move assignees to");
      const target = await prisma.leaveGroup.findFirst({ where: { id: moveToGroupId, orgId, deletedAt: null } });
      if (!target) return notFound("Target leave group not found");

      await prisma.$transaction(async (tx) => {
        const rows = await tx.leaveGroupAssignment.findMany({ where: { orgId, leaveGroupId: params.id } });
        const targetRows = await tx.leaveGroupAssignment.findMany({
          where: { orgId, leaveGroupId: moveToGroupId },
          select: { assigneeType: true, employeeId: true, roleId: true },
        });
        const key = (a: { assigneeType: string; employeeId: string | null; roleId: string | null }) => `${a.assigneeType}:${a.employeeId ?? ""}:${a.roleId ?? ""}`;
        const seen = new Set(targetRows.map(key));
        for (const r of rows) {
          if (seen.has(key(r))) {
            // Target already has this assignee — drop the duplicate source row.
            await tx.leaveGroupAssignment.delete({ where: { id: r.id } });
          } else {
            await tx.leaveGroupAssignment.update({ where: { id: r.id }, data: { leaveGroupId: moveToGroupId } });
            seen.add(key(r));
          }
        }
        await tx.leaveGroup.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
      });

      await createAuditLog({
        orgId, userId, action: "Delete", entityType: "LeaveGroup", entityId: params.id,
        changes: { name: existing.name, movedTo: moveToGroupId, moved: assigned },
      });
      return successResponse({ deleted: true, moved: assigned });
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
