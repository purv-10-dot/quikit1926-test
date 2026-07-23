import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, forbidden, notFound, conflict, internalError } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { createAuditLog } from "@/lib/utils/audit";

/**
 * POST /api/v1/hrms/offboarding/resignations/:id/decision
 * Body: { action: "approve" | "reject", reason?: string }
 *
 * Approve → resignation confirmed; employee stays OnNotice; HR proceeds with
 *           offboarding tasks.
 * Reject  → employee reverts to Active, last working date cleared; the instance
 *           is marked Rejected so the employee can submit a fresh resignation.
 *
 * Authorized for the assigned approver (the employee's reporting manager) OR
 * HR/admin (permissions "*" or hrms.offboarding.write) — approval is by
 * assignment, not a blanket permission (managers hold the plain employee role).
 */
export const POST = withAuth(async (req: NextRequest, ctx, params) => {
  try {
    const { orgId, userId, permissions } = ctx;
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    if (action !== "approve" && action !== "reject") {
      return validationError('action must be "approve" or "reject"');
    }
    const reason = body?.reason ? String(body.reason).trim() : null;
    if (action === "reject" && !reason) {
      return validationError("A rejection reason is required.");
    }

    const instance = await prisma.offboardingInstance.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!instance) return notFound("Resignation not found");

    if (instance.resignationApprovalStatus !== "Pending") {
      return conflict(`This resignation is not pending approval (status: ${instance.resignationApprovalStatus ?? "n/a"}).`);
    }

    const isHr = permissions.includes("*") || permissions.includes("hrms.offboarding.write") || permissions.includes("hrms.offboarding.approve");
    const callerEmployeeId = await resolveEmployeeId(orgId, userId);
    const isApprover = !!callerEmployeeId && callerEmployeeId === instance.resignationApproverId;
    if (!isHr && !isApprover) {
      return forbidden("You are not the approver for this resignation.");
    }

    const now = new Date();

    if (action === "approve") {
      // The approver may set/adjust the notice period at approval time; if so,
      // recompute the last working date and sync it to the employee record.
      let newLwd: Date | null = null;
      const noticePeriodId = body?.noticePeriodId ? String(body.noticePeriodId) : null;
      if (noticePeriodId) {
        const np = await prisma.noticePeriod.findFirst({
          where: { id: noticePeriodId, orgId, deletedAt: null },
          select: { id: true, duration: true, unit: true },
        });
        if (!np) return validationError("Invalid notice period");
        const days = periodToDays(np);
        newLwd = new Date(instance.resignationDate);
        newLwd.setDate(newLwd.getDate() + days);
        await prisma.employee.update({
          where: { id: instance.employeeId },
          data: { noticePeriodId: np.id, noticePeriodDays: days, lastWorkingDate: newLwd, updatedBy: userId },
        }).catch(() => null);
      }
      const updated = await prisma.offboardingInstance.update({
        where: { id: instance.id },
        data: {
          resignationApprovalStatus: "Approved",
          resignationDecisionById: callerEmployeeId ?? userId,
          resignationDecisionAt: now,
          resignationRejectionReason: null,
          ...(newLwd ? { lastWorkingDate: newLwd } : {}),
          updatedBy: userId,
        },
      });
      await notifyEmployee(orgId, instance.employeeId,
        "Resignation approved",
        "Your resignation has been approved. HR will proceed with your offboarding.",
        "Success", instance.id);
      await createAuditLog({
        orgId, userId, action: "Approve", entityType: "OffboardingInstance", entityId: instance.id,
        changes: { action: "ResignationApproved" }, request: req, actor: ctx,
      });
      return successResponse(updated);
    }

    // reject → revert the employee, reopen for re-submission
    const updated = await prisma.offboardingInstance.update({
      where: { id: instance.id },
      data: {
        resignationApprovalStatus: "Rejected",
        resignationDecisionById: callerEmployeeId ?? userId,
        resignationDecisionAt: now,
        resignationRejectionReason: reason,
        updatedBy: userId,
      },
    });
    await prisma.employee.update({
      where: { id: instance.employeeId },
      data: { status: "Active", lastWorkingDate: null, updatedBy: userId },
    }).catch(() => null);
    await notifyEmployee(orgId, instance.employeeId,
      "Resignation rejected",
      `Your resignation was not approved. Reason: ${reason}. Your status is back to Active — you may submit a new resignation if needed.`,
      "Warning", instance.id);
    await createAuditLog({
      orgId, userId, action: "Reject", entityType: "OffboardingInstance", entityId: instance.id,
      changes: { action: "ResignationRejected", reason }, request: req, actor: ctx,
    });
    return successResponse(updated);
  } catch (error) {
    console.error("POST /offboarding/resignations/:id/decision error:", error);
    return internalError();
  }
});

/** Convert a linked notice period to whole days (same math as the forms). */
function periodToDays(p: { duration: number; unit: string }): number {
  return p.unit === "Months" ? p.duration * 30 : p.unit === "Weeks" ? p.duration * 7 : p.duration;
}

async function notifyEmployee(
  orgId: string, employeeId: string, title: string, message: string,
  type: "Success" | "Warning", instanceId: string,
) {
  try {
    await prisma.hrmsNotification.create({
      data: {
        orgId, employeeId, type, channel: "InApp",
        title, message, link: "/resign",
        entityType: "OffboardingInstance", entityId: instanceId,
      },
    });
  } catch (e) {
    console.error("resignation decision notification failed:", e);
  }
}
