import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, conflict, validationError, forbidden, internalError } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { mailRequisitionApprovalRequest, mailRequisitionDecision } from "@/lib/services/requisition-approval-service";
import { getActiveChainLevels, getCallerRoleIds, callerCanActionLevel } from "@/lib/services/approval-chain";

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
    // holder of the level's role may action it (matches the Leave flow).
    const chainLevels = await getActiveChainLevels(orgId, "Requisition");
    const levelCfg = chainLevels?.find((l) => l.level === nextPending.level);
    const roleIds = await getCallerRoleIds(orgId, employeeId);
    if (!callerCanActionLevel(levelCfg, { employeeId, roleIds }, nextPending.approverId)) {
      return forbidden("Not your approval level");
    }

    await prisma.requisitionApproval.update({
      where: { id: nextPending.id },
      data: { status: "Approved", comment: parsed.data.comment ?? null, decidedAt: new Date() },
    });

    const remainingPending = requisition.approvals.filter((a) => a.id !== nextPending.id && a.status === "Pending");
    const allDone = remainingPending.length === 0;

    if (allDone) {
      await prisma.jobRequisition.update({
        where: { id: requisition.id },
        data: { status: "ReqOpen", updatedBy: userId },
      });
      // Final HR approval = published to job board
      void mailRequisitionDecision({
        orgId, requisitionId: requisition.id,
        raiserName: requisition.raiser ? `${requisition.raiser.firstName} ${requisition.raiser.lastName}`.trim() : "Raiser",
        raiserEmail: requisition.raiser?.workEmail ?? null,
        status: "Approved",
        comment: parsed.data.comment ?? null,
      }).catch((e) => console.error("[req] raiser mail failed:", e));
    } else {
      // Advance to next approver, notify them
      const next = remainingPending[0];
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
    }

    return successResponse({ approved: true, allDone, level: nextPending.level });
  } catch (e) {
    console.error("POST requisitions/[id]/approve", e);
    return internalError();
  }
});
