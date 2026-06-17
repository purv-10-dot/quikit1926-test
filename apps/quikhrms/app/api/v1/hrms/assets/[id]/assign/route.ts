import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, conflict, internalError } from "@/lib/api-response";
import { assignAssetSchema } from "@/lib/validations/assets";
import { createAuditLog } from "@/lib/utils/audit";
import { fireWorkflow } from "@/lib/workflows/executor";
import { publishAssetUpdate } from "@/lib/services/realtime";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const { id } = params;
    const body = await req.json();
    const parsed = assignAssetSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const asset = await prisma.asset.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!asset) return notFound("Asset not found");

    if (asset.status === "Retired" || asset.status === "AssetLost") {
      return conflict(`Asset is ${asset.status}, cannot assign`);
    }

    // Count active assignments — cannot exceed quantity
    const activeCount = await prisma.assetAssignment.count({
      where: { orgId, assetId: id, status: "AssignmentActive", deletedAt: null },
    });
    const totalQty = asset.quantity ?? 1;
    if (activeCount >= totalQty) {
      return conflict(`All ${totalQty} units are assigned (${activeCount} active)`);
    }

    // Duplicate-assignment guard: same employee already holds active assignment of this asset
    if (!parsed.data.force) {
      const existing = await prisma.assetAssignment.findFirst({
        where: {
          orgId,
          assetId: id,
          employeeId: parsed.data.employeeId,
          status: "AssignmentActive",
          deletedAt: null,
        },
      });
      if (existing) {
        return conflict("DUPLICATE_ASSIGNMENT: Employee already has an active assignment of this asset");
      }
    }

    const newActiveCount = activeCount + 1;
    const newStatus = newActiveCount >= totalQty ? "Assigned" : "Available";

    const [assignment] = await prisma.$transaction([
      prisma.assetAssignment.create({
        data: {
          orgId,
          assetId: id,
          employeeId: parsed.data.employeeId,
          assignedBy: userId,
          assignedAt: new Date(),
          expectedReturnDate: parsed.data.expectedReturnDate ? new Date(parsed.data.expectedReturnDate) : null,
          status: "AssignmentActive",
          notes: parsed.data.notes,
          createdBy: userId,
          updatedBy: userId,
        },
      }),
      prisma.asset.update({
        where: { id },
        data: { status: newStatus, updatedBy: userId },
      }),
    ]);

    await createAuditLog({
      orgId, userId, action: "Create", entityType: "AssetAssignment", entityId: assignment.id,
      metadata: { assetId: id, employeeId: parsed.data.employeeId },
    });

    void fireWorkflow({
      orgId,
      event: "asset.assigned",
      payload: {
        employeeId: parsed.data.employeeId,
        assetId: id,
        assignmentId: assignment.id,
      },
    });

    void publishAssetUpdate(orgId, { assetId: id, action: "assigned", employeeId: parsed.data.employeeId });

    return successResponse(assignment, undefined, 201);
  } catch (error) {
    console.error("POST /assets/[id]/assign error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.asset.write"] });
