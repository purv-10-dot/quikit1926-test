import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, conflict, internalError } from "@/lib/api-response";
import { createLeaveGroupSchema } from "@/lib/validations/leave";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") ?? "").trim();

    const groups = await prisma.leaveGroup.findMany({
      where: {
        orgId,
        deletedAt: null,
        ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
      },
      include: {
        items: {
          include: { leaveType: { select: { id: true, name: true, code: true, color: true } } },
        },
        assignments: true,
        _count: { select: { assignments: true, items: true } },
      },
      orderBy: { name: "asc" },
    });

    return successResponse(groups);
  } catch (error) {
    console.error("GET /leaves/groups error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createLeaveGroupSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;

    const existing = await prisma.leaveGroup.findFirst({
      where: { orgId, name: data.name, deletedAt: null },
    });
    if (existing) return conflict("Leave group with this name already exists");

    const typeIds = data.items.map((i) => i.leaveTypeId);
    const validTypes = await prisma.leaveType.count({
      where: { orgId, deletedAt: null, id: { in: typeIds } },
    });
    if (validTypes !== typeIds.length) return validationError("Invalid leave type(s) selected");

    const group = await prisma.leaveGroup.create({
      data: {
        orgId,
        name: data.name,
        description: data.description ?? null,
        isActive: data.isActive,
        createdBy: userId,
        updatedBy: userId,
        items: {
          create: data.items.map((i) => ({
            orgId,
            leaveTypeId: i.leaveTypeId,
            overrideQuota: i.overrideQuota ?? null,
          })),
        },
      },
      include: { items: true },
    });

    await createAuditLog({
      orgId, userId, action: "Create", entityType: "LeaveGroup", entityId: group.id,
      changes: { name: group.name, items: data.items.length },
    });

    return successResponse(group, undefined, 201);
  } catch (error) {
    console.error("POST /leaves/groups error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.leave.manage"] });
