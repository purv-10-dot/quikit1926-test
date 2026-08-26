import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { assignPosition } from "@/lib/services/requisition-positions";

const schema = z.object({ recruiterId: z.string().min(1) });

/**
 * POST — assign (or reassign) ONE SPECIFIC seat to a recruiter, picked
 * directly from the position row (vs. the bulk "allocate N oldest" flow).
 */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const requisition = await prisma.jobRequisition.findFirst({ where: { id: params.id, orgId, deletedAt: null }, select: { id: true } });
    if (!requisition) return notFound("Requisition not found");

    const recruiter = await prisma.employee.findFirst({ where: { id: parsed.data.recruiterId, orgId, deletedAt: null }, select: { id: true } });
    if (!recruiter) return notFound("Selected recruiter not found");

    const ok = await assignPosition(orgId, params.id, params.positionId, parsed.data.recruiterId, userId);
    if (!ok) return validationError("This position is no longer open, or doesn't exist.");

    return successResponse({ assigned: true });
  } catch (error) {
    console.error("POST /requisitions/:id/positions/:positionId/assign error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.write"] });
