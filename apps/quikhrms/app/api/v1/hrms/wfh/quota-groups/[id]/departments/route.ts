import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError, forbidden, conflict } from "@/lib/api-response";
import { z } from "zod";

const addSchema = z.object({
  departmentIds: z.array(z.string().min(1)).min(1),
});

function canManage(roleCode: string | null, permissions: string[]): boolean {
  return permissions.includes("*") || roleCode === "admin";
}

export const POST = withAuth(async (req: NextRequest, { orgId, roleCode, permissions }, params) => {
  try {
    if (!canManage(roleCode, permissions)) return forbidden("Only Super Admin or HR Admin can assign departments");

    const group = await prisma.wfhQuotaGroup.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!group) return notFound("Group not found");
    if (group.mode !== "Department") {
      return validationError(`Group "${group.name}" is in Employee mode. Switch mode or add employees instead.`);
    }

    const body = await req.json().catch(() => ({}));
    const parsed = addSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    // Reject if any dept is already mapped to another group (one dept ↔ one group).
    const otherGroups = await prisma.wfhQuotaGroup.findMany({
      where: { orgId, deletedAt: null, id: { not: params.id }, departmentIds: { hasSome: parsed.data.departmentIds } },
      select: { name: true, departmentIds: true },
    });
    if (otherGroups.length > 0) {
      const taken = new Map<string, string>(); // deptId → groupName
      for (const g of otherGroups) {
        for (const d of g.departmentIds) {
          if (parsed.data.departmentIds.includes(d)) taken.set(d, g.name);
        }
      }
      const deptNames = await prisma.department.findMany({
        where: { orgId, id: { in: [...taken.keys()] } },
        select: { id: true, name: true },
      });
      const names = deptNames.map((d) => `${d.name} → ${taken.get(d.id)}`).join(", ");
      return conflict(`Some departments are already mapped: ${names}`);
    }

    const merged = Array.from(new Set([...group.departmentIds, ...parsed.data.departmentIds]));
    await prisma.wfhQuotaGroup.update({
      where: { id: params.id },
      data: { departmentIds: { set: merged } },
    });
    return successResponse({ assigned: merged.length - group.departmentIds.length });
  } catch (e) {
    console.error("POST /wfh/quota-groups/:id/departments", e);
    return internalError();
  }
});

export const DELETE = withAuth(async (req: NextRequest, { orgId, roleCode, permissions }, params) => {
  try {
    if (!canManage(roleCode, permissions)) return forbidden("Only Super Admin or HR Admin can remove departments");
    const { searchParams } = new URL(req.url);
    const departmentId = searchParams.get("departmentId");
    if (!departmentId) return validationError("departmentId is required");

    const g = await prisma.wfhQuotaGroup.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { departmentIds: true },
    });
    if (!g) return notFound("Group not found");
    await prisma.wfhQuotaGroup.update({
      where: { id: params.id },
      data: { departmentIds: { set: g.departmentIds.filter((d) => d !== departmentId) } },
    });
    return successResponse({ removed: true });
  } catch (e) {
    console.error("DELETE /wfh/quota-groups/:id/departments", e);
    return internalError();
  }
});
