import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError, forbidden, conflict } from "@/lib/api-response";

function canManage(roleCode: string | null, permissions: string[]): boolean {
  return permissions.includes("*") || roleCode === "admin";
}
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).optional().nullable(),
  yearlyQuota: z.number().int().min(0).max(366).optional(),
  mode: z.enum(["Department", "Employee"]).optional(),
  isActive: z.boolean().optional(),
  // WFH rules
  maxPerWeek: z.number().int().min(0).max(7).nullable().optional(),
  maxPerMonth: z.number().int().min(0).max(31).nullable().optional(),
  maxConsecutiveDays: z.number().int().min(0).max(366).nullable().optional(),
  advanceNoticeDays: z.number().int().min(0).max(60).nullable().optional(),
  applicableAfterDays: z.number().int().min(0).max(365).nullable().optional(),
  requiresApproval: z.boolean().optional(),
  blockedDuringNotice: z.boolean().optional(),
}).superRefine((d, ctx) => {
  if (d.maxPerMonth != null) {
    if (d.maxPerMonth > 31) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["maxPerMonth"], message: "A month has at most 31 days" });
    if (d.yearlyQuota != null && d.maxPerMonth > d.yearlyQuota) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["maxPerMonth"], message: `Can't exceed the yearly quota (${d.yearlyQuota})` });
  }
  if (d.maxConsecutiveDays != null) {
    const cap = d.maxPerMonth ?? (d.yearlyQuota != null ? Math.min(31, d.yearlyQuota) : 31);
    if (d.maxConsecutiveDays > cap) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["maxConsecutiveDays"], message: `Can't exceed ${cap}` });
  }
});

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const group = await prisma.wfhQuotaGroup.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        members: {
          where: { deletedAt: null },
          select: { id: true, firstName: true, lastName: true, employeeCode: true, jobTitle: true, department: { select: { name: true } } },
          orderBy: { firstName: "asc" },
        },
      },
    });
    if (!group) return notFound("Group not found");
    // departments are stored as an id array; hydrate to the same shape the UI
    // expects ({ department: {...} }) so nothing downstream changes.
    const deptRows = group.departmentIds.length
      ? await prisma.department.findMany({
          where: { orgId, id: { in: group.departmentIds } },
          select: { id: true, name: true, code: true, _count: { select: { employees: { where: { deletedAt: null } } } } },
        })
      : [];
    return successResponse({ ...group, departments: deptRows.map((department) => ({ department })) });
  } catch (e) {
    console.error("GET /wfh/quota-groups/:id", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.employee.read"], anyPermission: true });

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId, roleCode, permissions }, params) => {
  try {
    if (!canManage(roleCode, permissions)) return forbidden("Only Super Admin or HR Admin can edit quota groups");
    const existing = await prisma.wfhQuotaGroup.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Group not found");

    const body = await req.json().catch(() => ({}));
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const group = await prisma.wfhQuotaGroup.update({
      where: { id: params.id },
      data: { ...parsed.data, updatedBy: userId },
    });
    return successResponse(group);
  } catch (e) {
    console.error("PATCH /wfh/quota-groups/:id", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.employee.write"] });

export const DELETE = withAuth(async (req: NextRequest, { orgId, userId, roleCode, permissions }, params) => {
  try {
    if (!canManage(roleCode, permissions)) return forbidden("Only Super Admin or HR Admin can delete quota groups");
    const existing = await prisma.wfhQuotaGroup.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Group not found");

    const memberCount = await prisma.employee.count({
      where: { orgId, wfhQuotaGroupId: params.id, deletedAt: null },
    });
    const moveToGroupId = new URL(req.url).searchParams.get("moveToGroupId");

    // A group with employees can't be deleted outright — the employees must be
    // moved to another group first (or the caller passes the target explicitly).
    if (memberCount > 0) {
      if (!moveToGroupId) {
        return conflict(`Cannot delete — ${memberCount} employee${memberCount === 1 ? "" : "s"} assigned. Move them to another group first.`);
      }
      if (moveToGroupId === params.id) return validationError("Choose a different group to move employees to");
      const target = await prisma.wfhQuotaGroup.findFirst({
        where: { id: moveToGroupId, orgId, deletedAt: null },
      });
      if (!target) return notFound("Target group not found");
      if (target.mode !== "Employee") return validationError("Employees can only be moved to an employee-wise group");

      await prisma.$transaction([
        prisma.employee.updateMany({
          where: { orgId, wfhQuotaGroupId: params.id },
          data: { wfhQuotaGroupId: moveToGroupId },
        }),
        prisma.wfhQuotaGroup.update({
          where: { id: params.id },
          data: { deletedAt: new Date(), updatedBy: userId },
        }),
      ]);
      return successResponse({ deleted: true, moved: memberCount });
    }

    await prisma.wfhQuotaGroup.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    return successResponse({ deleted: true });
  } catch (e) {
    console.error("DELETE /wfh/quota-groups/:id", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.employee.write"] });
