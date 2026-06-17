import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, forbidden, internalError } from "@/lib/api-response";
import { leaveApprovalActionSchema } from "@/lib/validations/leave";
import { fireWorkflow } from "@/lib/workflows/executor";
import { queueEmail } from "@/lib/services/mailer";
import { buildLeaveDecisionEmail } from "@/lib/email-templates/leave-decision";
import { publishNotification } from "@/lib/services/realtime";

/** POST /api/v1/hrms/leaves/requests/:id/approve */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const request = await prisma.leaveRequest.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: { approvals: true },
    });
    if (!request) return notFound("Leave request not found");

    if (request.status !== "Pending") {
      return validationError("Leave request is not pending approval");
    }

    // Find pending approval for this approver
    const approval = request.approvals.find(
      (a) => a.approverId === userId && a.status === "Pending"
    );
    if (!approval) {
      return forbidden("You are not authorized to approve this request");
    }

    const body = await req.json();
    const parsed = leaveApprovalActionSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const { status, comment } = parsed.data;

    // All writes + final re-fetch in a single transaction — minimizes round-trips
    const pendingOthers = request.approvals.filter(
      (a) => a.id !== approval.id && a.status === "Pending",
    );
    const allApproved = status === "Approved" && pendingOthers.length === 0;
    const year = new Date(request.startDate).getFullYear();

    const updated = await prisma.$transaction(async (tx) => {
      await tx.leaveApproval.update({
        where: { id: approval.id },
        data: { status, comment, actionAt: new Date() },
      });

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
      // Real-time notification to employee
      const decision = updated.status === "Approved" ? "approved" : "rejected";
      publishNotification(orgId, [updated.employeeId], {
        title: `Leave ${decision}`,
        message: `Your ${updated.leaveType?.name ?? "leave"} request has been ${decision}.`,
        type: updated.status === "Approved" ? "Success" : "Error",
        link: `/leaves`,
      }).catch(() => {});

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
          const { subject, html } = buildLeaveDecisionEmail({
            employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
            leaveTypeName: updated.leaveType?.name ?? "Leave",
            startDate: fmtDate(updated.startDate),
            endDate: fmtDate(updated.endDate),
            duration: Number(updated.duration),
            approverName: approver ? `${approver.firstName} ${approver.lastName}`.trim() : "HR",
            comment: comment ?? null,
            decision: updated.status as "Approved" | "Rejected",
            companyName: company?.companyName ?? "QuikIT HRMS",
          });
          await queueEmail(orgId, { to: employee.workEmail, subject, html, kind: "leave.decision" });
        } catch (err) {
          console.error("[mail] leave decision email failed:", err);
        }
      })();
    }

    return successResponse(updated);
  } catch (error) {
    console.error("POST /leaves/requests/:id/approve error:", error);
    return internalError();
  }
});
