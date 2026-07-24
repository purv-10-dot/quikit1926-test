import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError, forbidden } from "@/lib/api-response";
import { z } from "zod";

const addSchema = z.object({
  employeeIds: z.array(z.string().min(1)).min(1).max(500, "Too many employees in one request (max 500)"),
});

function canManage(roleCode: string | null, permissions: string[]): boolean {
  return permissions.includes("*") || roleCode === "admin";
}

export const POST = withAuth(async (req: NextRequest, { orgId, roleCode, permissions }, params) => {
  try {
    if (!canManage(roleCode, permissions)) return forbidden("Only Super Admin or HR Admin can assign members");
    const group = await prisma.wfhQuotaGroup.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!group) return notFound("Group not found");
    if (group.mode !== "Employee") {
      return validationError(`Group "${group.name}" is in Department mode. Switch mode or add departments instead.`);
    }

    const body = await req.json().catch(() => ({}));
    const parsed = addSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    // Move employees from any other explicit group → this group (enforces "one group per employee").
    const result = await prisma.employee.updateMany({
      where: { orgId, deletedAt: null, id: { in: parsed.data.employeeIds } },
      data: { wfhQuotaGroupId: params.id },
    });
    return successResponse({ assigned: result.count });
  } catch (e) {
    console.error("POST /wfh/quota-groups/:id/members", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.employee.write"] });

export const DELETE = withAuth(async (req: NextRequest, { orgId, roleCode, permissions }, params) => {
  try {
    if (!canManage(roleCode, permissions)) return forbidden("Only Super Admin or HR Admin can remove members");
    const { searchParams } = new URL(req.url);
    const empId = searchParams.get("employeeId");
    if (!empId) return validationError("employeeId is required");

    await prisma.employee.updateMany({
      where: { orgId, id: empId, wfhQuotaGroupId: params.id },
      data: { wfhQuotaGroupId: null },
    });
    return successResponse({ removed: true });
  } catch (e) {
    console.error("DELETE /wfh/quota-groups/:id/members", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.employee.write"] });
