import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";
import { listPositions } from "@/lib/services/requisition-positions";

/** GET — the individual seats (RequisitionPosition rows) under one requisition. */
export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const req_ = await prisma.jobRequisition.findFirst({ where: { id: params.id, orgId, deletedAt: null }, select: { id: true } });
    if (!req_) return notFound("Requisition not found");

    const rows = await listPositions(orgId, params.id);
    const data = rows.map((r) => ({
      id: r.id,
      positionCode: r.positionCode,
      sequenceNo: r.sequenceNo,
      status: r.status,
      recruiterId: r.recruiterId,
      recruiterName: r.recruiterId ? `${r.recruiterFirstName ?? ""} ${r.recruiterLastName ?? ""}`.trim() : null,
      filledByApplicationId: r.filledByApplicationId,
      filledAt: r.filledAt,
    }));
    return successResponse(data);
  } catch (error) {
    console.error("GET /requisitions/:id/positions error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.read"] });
