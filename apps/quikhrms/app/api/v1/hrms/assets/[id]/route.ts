import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { updateAssetSchema } from "@/lib/validations/assets";
import { createAuditLog } from "@/lib/utils/audit";
import { publishAssetUpdate } from "@/lib/services/realtime";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const asset = await prisma.asset.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        assignments: {
          orderBy: { assignedAt: "desc" },
          take: 50,
        },
      },
    });
    if (!asset) return notFound("Asset not found");
    return successResponse(asset);
  } catch (error) {
    console.error("GET /assets/[id] error:", error);
    return internalError();
  }
});

export const PUT = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const { id } = params;
    const body = await req.json();
    const parsed = updateAssetSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const existing = await prisma.asset.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound("Asset not found");

    const { purchaseDate, warrantyExpiry, specs, ...rest } = parsed.data;

    const asset = await prisma.asset.update({
      where: { id },
      data: {
        ...rest,
        ...(purchaseDate !== undefined && { purchaseDate: purchaseDate ? new Date(purchaseDate) : null }),
        ...(warrantyExpiry !== undefined && { warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null }),
        ...(specs !== undefined && { specs: specs ? JSON.parse(JSON.stringify(specs)) : undefined }),
        updatedBy: userId,
      },
    });

    await createAuditLog({ orgId, userId, action: "Update", entityType: "Asset", entityId: id, changes: parsed.data });
    void publishAssetUpdate(orgId, { assetId: id, action: "updated" });
    return successResponse(asset);
  } catch (error) {
    console.error("PUT /assets/[id] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.asset.write"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const { id } = params;
    const existing = await prisma.asset.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound("Asset not found");

    await prisma.asset.update({
      where: { id },
      data: { deletedAt: new Date(), status: "Retired", updatedBy: userId },
    });

    await createAuditLog({ orgId, userId, action: "Delete", entityType: "Asset", entityId: id });
    void publishAssetUpdate(orgId, { assetId: id, action: "deleted" });
    return successResponse({ id, deleted: true });
  } catch (error) {
    console.error("DELETE /assets/[id] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.asset.write"] });
