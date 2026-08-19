import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { allocatePositions } from "@/lib/services/requisition-positions";

const schema = z.object({
  recruiterId: z.string().min(1),
  count: z.number().int().min(1).max(500),
});

/**
 * POST — allocate `count` still-open positions on this requisition to a
 * recruiter (capacity/quota, not a specific candidate). Recruiter & Position
 * Tracking (Phase 1).
 */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const requisition = await prisma.jobRequisition.findFirst({ where: { id: params.id, orgId, deletedAt: null }, select: { id: true } });
    if (!requisition) return notFound("Requisition not found");

    const recruiter = await prisma.employee.findFirst({ where: { id: parsed.data.recruiterId, orgId, deletedAt: null }, select: { id: true } });
    if (!recruiter) return notFound("Selected recruiter not found");

    const allocated = await allocatePositions(orgId, params.id, parsed.data.recruiterId, parsed.data.count, userId);
    if (allocated === 0) return validationError("No open positions left to allocate on this requisition");

    return successResponse({ allocated });
  } catch (error) {
    console.error("POST /requisitions/:id/positions/allocate error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.write"] });
