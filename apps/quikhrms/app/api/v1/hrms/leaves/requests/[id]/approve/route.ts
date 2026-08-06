import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, forbidden, conflict, internalError } from "@/lib/api-response";
import { leaveApprovalActionSchema } from "@/lib/validations/leave";
import { fireWorkflow } from "@/lib/workflows/executor";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildLeaveDecisionEmail } from "@/lib/email-templates/leave-decision";
import {
  getActiveChainLevels,
  getCallerRoleIds,
  callerCanActionLevel,
} from "@/lib/services/approval-chain";

/** POST /api/v1/hrms/leaves/requests/:id/approve */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const request = await prisma.leaveRequest.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: { approvals: true },
    });
    if (!request) return notFound("Leave request not found");

    // You can never approve/reject your own request, even if you happen to hold
    // the current level's role — the chain routes around the applicant on apply,
    // so this closes the gap where a role-holder actions their own leave.
    if (request.employeeId === userId) {
      return forbidden("You can't approve or reject your own leave request.");
    }

    if (request.status !== "Pending") {
      return validationError("Leave request is not pending approval");
    }

    // Approvals advance level-by-level (1 → 2 → … → Approved). The current
    // level is the lowest-numbered approval still Pending; only it is actionable.
    const pendingApprovals = request.approvals
      .filter((a) => a.status === "Pending")
      .sort((a, b) => a.level - b.level);
    const current = pendingApprovals[0];
    if (!current) {
      return validationError("Leave request has no pending approval level");
    }

    // Role-aware authorization: whoever holds the current level's role (or is
    // the specific assigned user) may action it — not just the one employee the
    // chain happened to route to at apply time. Keeps approvals chain-driven
    // while letting any holder of the level's role act.
    const chainLevels = await getActiveChainLevels(orgId, "Leave");
    const levelCfg = chainLevels?.find((l) => l.level === current.level);
    const roleIds = await getCallerRoleIds(orgId, userId);
    const authorized = callerCanActionLevel(
      levelCfg,
      { employeeId: userId, roleIds },
      current.approverId,
    );
    if (!authorized) {
      return forbidden("You are not authorized to approve this request");
    }

    const body = await req.json();
    const parsed = leaveApprovalActionSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const { status, comment } = parsed.data;

    // Approving the LAST pending level finalizes the request; higher levels
    // remaining means it stays Pending and moves to the next approver.
    const higherLevelsPending = pendingApprovals.filter((a) => a.id !== current.id);
    const allApproved = status === "Approved" && higherLevelsPending.length === 0;
    const year = new Date(request.startDate).getFullYear();

    const updated = await prisma.$transaction(async (tx) => {
      // Atomic level claim: only transition this level if it's STILL Pending.
      // Two parallel approves can't both win — the loser matches 0 rows and we
      // abort, so `taken` is incremented exactly once.
      const claimed = await tx.leaveApproval.updateMany({
        where: { id: current.id, status: "Pending" },
        data: { status, comment, actionAt: new Date(), approverId: userId },
      });
      if (claimed.count === 0) throw new Error("ALREADY_ACTIONED");

      if (allApproved) {
        await Promise.all([
          tx.leaveRequest.update({
            where: { id: params.id },
            data: { status: "Approved", updatedBy: userId },
          }),
          // Upsert balance in one query instead of find + update/create
          tx.leaveBalance.upsert({
            where: {
              orgId_employeeId_leaveTypeId_year: {
                orgId,
                employeeId: request.employeeId,
                leaveTypeId: request.leaveTypeId,
                year,
              },
            },
            update: { taken: { increment: request.duration } },
            create: {
              orgId,
              employeeId: request.employeeId,
              leaveTypeId: request.leaveTypeId,
              year,
              taken: request.duration,
              createdBy: userId,
              updatedBy: userId,
            },
          }),
        ]);
      } else if (status === "Rejected") {
        await tx.leaveRequest.update({
          where: { id: params.id },
          data: { status: "Rejected", updatedBy: userId },
        });
      }

      return tx.leaveRequest.findFirst({
        where: { id: params.id },
        include: {
          leaveType: { select: { id: true, name: true, code: true } },
          approvals: {
            include: { approver: { select: { id: true, firstName: true, lastName: true } } },
          },
        },
      });
    });

    if (updated && (updated.status === "Approved" || updated.status === "Rejected")) {
      // In-app notification to employee. `publishNotification` (lib/services/
      // realtime.ts) was a Pub/Sub no-op left behind after realtime removal —
      // this call looked wired but silently notified no one; write the row
      // directly like every other module (Requisition, Delegation, etc.) does.
      const decision = updated.status === "Approved" ? "approved" : "rejected";
      prisma.hrmsNotification.create({
        data: {
          orgId,
          employeeId: updated.employeeId,
          type: updated.status === "Approved" ? "Success" : "Error",
          channel: "InApp",
          title: `Leave ${decision}`,
          message: `Your ${updated.leaveType?.name ?? "leave"} request has been ${decision}.`,
          link: "/leaves",
          entityType: "LeaveRequest",
          entityId: updated.id,
        },
      }).catch((err) => console.error("[notify] leave decision in-app notify failed:", err));

      void fireWorkflow({
        orgId,
        event: updated.status === "Approved" ? "leave.approved" : "leave.rejected",
        payload: {
          employeeId: updated.employeeId,
          leaveRequestId: updated.id,
          leaveTypeId: updated.leaveTypeId,
          duration: updated.duration,
          startDate: updated.startDate,
          endDate: updated.endDate,
          comment,
        },
      });

      void (async () => {
        try {
          const [employee, approver, company] = await Promise.all([
            prisma.employee.findUnique({
              where: { id: updated.employeeId },
              select: { firstName: true, lastName: true, workEmail: true },
            }),
            prisma.employee.findUnique({
              where: { id: userId },
              select: { firstName: true, lastName: true },
            }),
            prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } }),
          ]);
          if (!employee?.workEmail) return;
          const fmtDate = (d: Date | string) =>
            new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
          const data = {
            employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
            leaveTypeName: updated.leaveType?.name ?? "Leave",
            startDate: fmtDate(updated.startDate),
            endDate: fmtDate(updated.endDate),
            duration: Number(updated.duration),
            approverName: approver ? `${approver.firstName} ${approver.lastName}`.trim() : "HR",
            comment: comment ?? null,
            decision: updated.status as "Approved" | "Rejected",
            companyName: company?.companyName ?? "QuikIT HRMS",
          };
          await resolveAndSend(orgId, {
            key: "leave.decision",
            to: employee.workEmail,
            vars: { ...data, comment: data.comment ?? "" },
            fallback: () => buildLeaveDecisionEmail(data),
          });
        } catch (err) {
          console.error("[mail] leave decision email failed:", err);
        }
      })();
    } else if (updated && updated.status === "Pending" && status === "Approved") {
      // Advanced to the next level — alert everyone who can action it so it
      // doesn't just sit silently in their inbox waiting to be noticed.
      const nextLevel = higherLevelsPending[0]?.level;
      const nextCfg = chainLevels?.find((l) => l.level === nextLevel);
      if (nextCfg) {
        void (async () => {
          try {
            let nextApproverIds: string[] = [];
            if (nextCfg.kind === "USER" && nextCfg.userId) {
              nextApproverIds = [nextCfg.userId];
            } else if (nextCfg.kind === "ROLE" && nextCfg.roleId) {
              const holders = await prisma.employee.findMany({
                where: {
                  orgId, deletedAt: null, status: "Active",
                  appRoles: { some: { roleId: nextCfg.roleId } },
                },
                select: { id: true },
              });
              nextApproverIds = holders.map((h) => h.id);
            }
            if (nextApproverIds.length > 0) {
              await prisma.hrmsNotification.createMany({
                data: nextApproverIds.map((id) => ({
                  orgId,
                  employeeId: id,
                  type: "Info" as const,
                  channel: "InApp" as const,
                  title: "Leave awaiting your approval",
                  message: `A ${updated.leaveType?.name ?? "leave"} request has advanced to your approval level.`,
                  link: "/leaves/team-leaves",
                  entityType: "LeaveRequest",
                  entityId: updated.id,
                })),
              });
            }
          } catch (err) {
            console.error("[notify] next-level leave approver notify failed:", err);
          }
        })();
      }
    }

    return successResponse(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "ALREADY_ACTIONED") {
      return conflict("This approval level was just actioned by someone else.");
    }
    console.error("POST /leaves/requests/:id/approve error:", error);
    return internalError();
  }
});
