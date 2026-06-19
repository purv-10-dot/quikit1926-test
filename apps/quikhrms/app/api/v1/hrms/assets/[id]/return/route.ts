import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { returnAssetSchema } from "@/lib/validations/assets";
import { createAuditLog } from "@/lib/utils/audit";
import { fireWorkflow } from "@/lib/workflows/executor";
import { publishAssetUpdate } from "@/lib/services/realtime";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const { id } = params;
    const body = await req.json();
    const parsed = returnAssetSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const asset = await prisma.asset.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!asset) return notFound("Asset not found");

    const assignment = await prisma.assetAssignment.findFirst({
      where: { orgId, assetId: id, status: "AssignmentActive", deletedAt: null },
    });
    if (!assignment) return notFound("No active assignment to return");

    const assignmentStatus = parsed.data.markLost ? "AssignmentLost" : "AssignmentReturned";

    // Count remaining active assignments after this return
    const remainingActive = await prisma.assetAssignment.count({
      where: { orgId, assetId: id, status: "AssignmentActive", deletedAt: null, id: { not: assignment.id } },
    });
    const totalQty = asset.quantity ?? 1;

    let assetStatus: string;
    if (parsed.data.markLost) {
      // Decrement quantity for lost unit
      assetStatus = remainingActive > 0 ? "Assigned" : (totalQty - 1 > 0 ? "Available" : "AssetLost");
    } else {
      assetStatus = remainingActive > 0 ? (remainingActive >= totalQty ? "Assigned" : "Available") : "Available";
      if (parsed.data.returnCondition === "Poor") assetStatus = "InRepair";
    }

    const [updatedAssignment] = await prisma.$transaction([
      prisma.assetAssignment.update({
        where: { id: assignment.id },
        data: {
          status: assignmentStatus,
          returnedAt: new Date(),
          returnedTo: userId,
          returnCondition: parsed.data.returnCondition,
          notes: parsed.data.notes,
          updatedBy: userId,
        },
      }),
      prisma.asset.update({
        where: { id },
        data: {
          status: assetStatus as "Available" | "Assigned" | "InRepair" | "Retired" | "AssetLost",
          condition: parsed.data.returnCondition,
          ...(parsed.data.markLost && totalQty > 1 ? { quantity: { decrement: 1 } } : {}),
          updatedBy: userId,
        },
      }),
    ]);

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "AssetAssignment", entityId: assignment.id,
      metadata: { returned: true, lost: parsed.data.markLost, condition: parsed.data.returnCondition },
    });

    const action = parsed.data.markLost ? "marked as lost" : "returned";
    await prisma.hrmsNotification.create({
      data: {
        orgId,
        employeeId: assignment.employeeId,
        type: parsed.data.markLost ? "Warning" : "Success",
        channel: "InApp",
        title: `Asset ${action}`,
        message: `${asset.name} (${asset.assetCode}) has been ${action}. Condition: ${parsed.data.returnCondition}.`,
        link: `/assets/${id}`,
        entityType: "AssetAssignment",
        entityId: assignment.id,
      },
    });

    void fireWorkflow({
      orgId,
      event: "asset.returned",
      payload: {
        employeeId: assignment.employeeId,
        assetId: id,
        assignmentId: assignment.id,
        condition: parsed.data.returnCondition,
        lost: parsed.data.markLost ?? false,
      },
    });

    void publishAssetUpdate(orgId, { assetId: id, action: "returned", employeeId: assignment.employeeId });

    return successResponse(updatedAssignment);
  } catch (error) {
    console.error("POST /assets/[id]/return error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.asset.write"] });
