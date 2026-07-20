import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, conflict, validationError, forbidden, internalError } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { mailRequisitionDecision } from "@/lib/services/requisition-approval-service";
import { getActiveChainLevels, getCallerRoleIds, getDelegatedApprovers, resolveLevelActor } from "@/lib/services/approval-chain";
import { notifyRequisitionRejected } from "@/lib/services/requisition-notifications";
import { createAuditLog } from "@/lib/utils/audit";

const schema = z.object({
  comment: z.string().max(2000).optional(),
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return notFound("Employee record not found");

    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed");

    const requisition = await prisma.jobRequisition.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        approvals: { orderBy: { level: "asc" } },
        raiser: { select: { firstName: true, lastName: true, workEmail: true } },
      },
    });
    if (!requisition) return notFound("Requisition not found");
    if (requisition.status !== "PendingApproval") return conflict(`Already ${requisition.status}`);

    const nextPending = requisition.approvals.find((a) => a.status === "Pending");
    if (!nextPending) return conflict("No pending approval level");

    const chainLevels = await getActiveChainLevels(orgId, "Requisition");
    const levelCfg = chainLevels?.find((l) => l.level === nextPending.level);
    const roleIds = await getCallerRoleIds(orgId, employeeId);
    const delegated = await getDelegatedApprovers(orgId, employeeId, "hrms.recruit.write");
    const actor = resolveLevelActor(levelCfg, { employeeId, roleIds }, delegated, nextPending.approverId);
    if (!actor.canAction) {
      return forbidden("Not your approval level");
    }

    await prisma.requisitionApproval.update({
      where: { id: nextPending.id },
      data: { status: "Rejected", comment: parsed.data.comment ?? null, decidedAt: new Date() },
    });

    void createAuditLog({
      orgId, userId: employeeId, action: "Reject",
      entityType: "Requisition", entityId: requisition.id, request: req,
      metadata: { level: nextPending.level, title: requisition.title },
      actor: actor.onBehalfOf ? { delegatedFrom: [{ delegatorId: actor.onBehalfOf, permissions: ["hrms.recruit.write"] }] } : undefined,
    });
    await prisma.requisitionApproval.updateMany({
      where: { requisitionId: requisition.id, status: "Pending" },
      data: { status: "Skipped", decidedAt: new Date() },
    });
    await prisma.jobRequisition.update({
      where: { id: requisition.id },
      data: { status: "ReqCancelled", closureReason: parsed.data.comment ?? "Rejected by approver", updatedBy: userId },
    });

    void mailRequisitionDecision({
      orgId, requisitionId: requisition.id,
      raiserName: requisition.raiser ? `${requisition.raiser.firstName} ${requisition.raiser.lastName}`.trim() : "Raiser",
      raiserEmail: requisition.raiser?.workEmail ?? null,
      status: "Rejected",
      comment: parsed.data.comment ?? null,
    }).catch((e) => console.error("[req] raiser mail failed:", e));
    void notifyRequisitionRejected(orgId, { requisitionId: requisition.id, title: requisition.title, raiserId: requisition.raisedById, comment: parsed.data.comment ?? null });

    return successResponse({ rejected: true, level: nextPending.level });
  } catch (e) {
    console.error("POST requisitions/[id]/reject", e);
    return internalError();
  }
});
