import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, conflict, forbidden } from "@/lib/api-response";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional().nullable(),
  yearlyQuota: z.number().int().min(0).max(366),
  mode: z.enum(["Department", "Employee"]).default("Department"),
  isActive: z.boolean().optional(),
});

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const groups = await prisma.wfhQuotaGroup.findMany({
      where: { orgId, deletedAt: null },
      orderBy: { name: "asc" },
      include: { _count: { select: { members: { where: { deletedAt: null } } } } },
    });
    return successResponse(groups);
  } catch (e) {
    console.error("GET /wfh/quota-groups", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.employee.read"], anyPermission: true });

export const POST = withAuth(async (req: NextRequest, { orgId, userId, roleCode, permissions }) => {
  try {
    if (!permissions.includes("*") && roleCode !== "admin") {
      return forbidden("Only Super Admin or HR Admin can create quota groups");
    }
    const body = await req.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const dup = await prisma.wfhQuotaGroup.findFirst({
      where: { orgId, name: parsed.data.name, deletedAt: null },
    });
    if (dup) return conflict("Group with this name already exists");

    const group = await prisma.wfhQuotaGroup.create({
      data: {
        orgId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        yearlyQuota: parsed.data.yearlyQuota,
        mode: parsed.data.mode,
        isActive: parsed.data.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      },
    });
    return successResponse(group, undefined, 201);
  } catch (e) {
    console.error("POST /wfh/quota-groups", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.employee.write"] });
