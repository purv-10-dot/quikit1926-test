import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { revisePositionSla } from "@/lib/services/requisition-positions";

const schema = z.object({
  reason: z.string().max(500).nullish(),
  // Optional YYYY-MM-DD (from a plain <input type="date">). When omitted,
  // the deadline auto-extends by the level's standard SLA window as before.
  customDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});

/**
 * POST — HR explicitly revises a position's SLA once it's already MISSED.
 * By default pushes the deadline out by the level's base SLA days again;
 * HR can instead pass `customDeadline` to set an exact date (e.g. matching
 * a candidate's notice period or a manager's promised feedback date). The
 * revision count still increments either way, and the position is always
 * treated as non-compliant for scoring after this, even once it falls back
 * inside the new deadline (see revisePositionSla / recruiter-performance's
 * Process Compliance KPI).
 *
 * Gated to hrms.recruit.performance.read (the HR/Admin "see every
 * recruiter" scope), NOT hrms.recruit.write — a recruiter can usually
 * manage their own candidates/requisitions, but must never be able to
 * revise their own SLA breach. That decision has to sit with someone who
 * can see the whole team, or the whole point of tracking revisions against
 * the score is defeated.
 */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const requisition = await prisma.jobRequisition.findFirst({ where: { id: params.id, orgId, deletedAt: null }, select: { id: true } });
    if (!requisition) return notFound("Requisition not found");

    // End-of-day so the whole picked date counts as within the new deadline.
    const customDeadline = parsed.data.customDeadline ? new Date(`${parsed.data.customDeadline}T23:59:59.999Z`) : null;
    const result = await revisePositionSla(orgId, params.id, params.positionId, userId, parsed.data.reason, customDeadline);
    if (!result.ok) return validationError(result.reason);

    return successResponse(result);
  } catch (error) {
    console.error("POST /requisitions/:id/positions/:positionId/revise-sla error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.performance.read"] });
