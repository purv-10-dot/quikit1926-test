import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, conflict, validationError, forbidden, internalError } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { mailRequisitionApprovalRequest, mailRequisitionDecision } from "@/lib/services/requisition-approval-service";
import { notifyRequisitionApproved, notifyRequisitionNextApprover } from "@/lib/services/requisition-notifications";
import { getActiveChainLevels, getCallerRoleIds, getDelegatedApprovers, resolveLevelActor } from "@/lib/services/approval-chain";
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
        raiser: { select: { id: true, firstName: true, lastName: true, workEmail: true } },
      },
    });
    if (!requisition) return notFound("Requisition not found");
    if (requisition.status !== "PendingApproval") return conflict(`Already ${requisition.status}`);

    const nextPending = requisition.approvals.find((a) => a.status === "Pending");
    if (!nextPending) return conflict("No pending approval level");

    // Role-aware auth: the assigned approver, the specific level user, or any
    // holder of the level's role may action it (matches the Leave flow). A user
    // holding an active Recruitment delegation may also action it on the
    // delegator's behalf.
    const chainLevels = await getActiveChainLevels(orgId, "Requisition");
    const levelCfg = chainLevels?.find((l) => l.level === nextPending.level);
    const roleIds = await getCallerRoleIds(orgId, employeeId);
    const delegated = await getDelegatedApprovers(orgId, employeeId, "hrms.recruit.write");
    const actor = resolveLevelActor(levelCfg, { employeeId, roleIds }, delegated, nextPending.approverId);
    if (!actor.canAction) {
      return forbidden("Not your approval level");
    }

    // Guarded, atomic decision: flip the pending row → Approved and (only if it
    // was the last pending level) publish the requisition — both in one
    // transaction. The `status: "Pending"` guard makes a double-click or a
    // concurrent decide a no-op conflict instead of a duplicate write, and the
    // finalize check is recomputed inside the tx from freshly-committed state.
    const txResult = await prisma.$transaction(async (tx) => {
      const upd = await tx.requisitionApproval.updateMany({
        where: { id: nextPending.id, orgId, status: "Pending" },
        data: { status: "Approved", comment: parsed.data.comment ?? null, decidedAt: new Date() },
      });
      if (upd.count === 0) return { conflict: true as const, allDone: false };
      const remaining = await tx.requisitionApproval.count({
        where: { requisitionId: requisition.id, orgId, status: "Pending" },
      });
      const allDone = remaining === 0;
      if (allDone) {
        await tx.jobRequisition.update({
          where: { id: requisition.id },
          data: { status: "ReqOpen", updatedBy: userId },
        });
      }
      return { conflict: false as const, allDone };
    });

    if (txResult.conflict) return conflict("This approval level was already decided");
    const { allDone } = txResult;

    void createAuditLog({
      orgId, userId: employeeId, action: "Approve",
      entityType: "Requisition", entityId: requisition.id, request: req,
      metadata: { level: nextPending.level, title: requisition.title },
      // Attribute the action to the delegator when it was taken under a delegation.
      actor: actor.onBehalfOf ? { delegatedFrom: [{ delegatorId: actor.onBehalfOf, permissions: ["hrms.recruit.write"] }] } : undefined,
    });

    // Email + in-app notifications run OUTSIDE the transaction (best-effort, no DB writes).
    if (allDone) {
      // Final HR approval = published to job board
      void mailRequisitionDecision({
        orgId, requisitionId: requisition.id,
        raiserName: requisition.raiser ? `${requisition.raiser.firstName} ${requisition.raiser.lastName}`.trim() : "Raiser",
        raiserEmail: requisition.raiser?.workEmail ?? null,
        status: "Approved",
        comment: parsed.data.comment ?? null,
      }).catch((e) => console.error("[req] raiser mail failed:", e));
      void notifyRequisitionApproved(orgId, { requisitionId: requisition.id, title: requisition.title, raiserId: requisition.raisedById });
    } else {
      // Advance to next approver, notify them.
      const next = requisition.approvals.find((a) => a.id !== nextPending.id && a.status === "Pending");
      if (next) {
        const nextApprover = await prisma.employee.findUnique({
          where: { id: next.approverId },
          select: { firstName: true, lastName: true, workEmail: true },
        });
        if (nextApprover) {
          void mailRequisitionApprovalRequest({
            orgId, requisitionId: requisition.id,
            recipientName: `${nextApprover.firstName} ${nextApprover.lastName}`.trim(),
            recipientEmail: nextApprover.workEmail,
            approverRole: "HR", // variant selector only — picks the "advanced to next approver" email
            raiserName: requisition.raiser ? `${requisition.raiser.firstName} ${requisition.raiser.lastName}`.trim() : "Raiser",
            previousComment: parsed.data.comment ?? null,
          }).catch((e) => console.error("[req] next-approver mail failed:", e));
        }
        void notifyRequisitionNextApprover(orgId, { requisitionId: requisition.id, title: requisition.title, approverId: next.approverId });
      }
    }

    return successResponse({ approved: true, allDone, level: nextPending.level });
  } catch (e) {
    console.error("POST requisitions/[id]/approve", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.approve"] });
