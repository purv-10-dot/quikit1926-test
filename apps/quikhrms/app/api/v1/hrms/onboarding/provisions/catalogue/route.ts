import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, conflict, internalError } from "@/lib/api-response";
import { createProvisionItemSchema } from "@/lib/validations/provisions";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") ?? "").trim();
    const category = searchParams.get("category");

    const items = await prisma.provisionItem.findMany({
      where: {
        orgId,
        deletedAt: null,
        ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
        ...(category ? { category: category as "ITAccount" | "Hardware" | "Access" | "Compliance" | "Facility" | "ProvOther" } : {}),
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
    return successResponse(items);
  } catch (error) {
    console.error("GET /onboarding/provisions/catalogue error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createProvisionItemSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;
    const existing = await prisma.provisionItem.findFirst({
      where: { orgId, name: data.name, deletedAt: null },
    });
    if (existing) return conflict("Provision item with this name already exists");

    const item = await prisma.provisionItem.create({
      data: {
        orgId,
        name: data.name,
        category: data.category,
        description: data.description ?? null,
        isDefault: data.isDefault,
        isActive: data.isActive,
        departmentIds: data.departmentIds ? JSON.parse(JSON.stringify(data.departmentIds)) : undefined,
        roleIds: data.roleIds ? JSON.parse(JSON.stringify(data.roleIds)) : undefined,
        designationIds: data.designationIds ? JSON.parse(JSON.stringify(data.designationIds)) : undefined,
        ownerAssigneeRole: data.ownerAssigneeRole ?? null,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    await createAuditLog({
      orgId, userId, action: "Create", entityType: "ProvisionItem", entityId: item.id,
      changes: { name: item.name, category: item.category },
    });

    return successResponse(item, undefined, 201);
  } catch (error) {
    console.error("POST /onboarding/provisions/catalogue error:", error);
    return internalError();
  }
});
