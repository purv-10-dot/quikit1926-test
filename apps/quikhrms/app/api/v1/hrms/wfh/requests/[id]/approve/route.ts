import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, conflict, validationError, internalError, forbidden } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { decideWfhSchema } from "@/lib/validations/wfh";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildWfhNoticeEmail } from "@/lib/email-templates/wfh-notice";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return notFound("Employee record not found");

    const body = await req.json().catch(() => ({}));
    const parsed = decideWfhSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const wfh = await prisma.wfhRequest.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        approvals: { orderBy: { level: "asc" } },
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, jobTitle: true, workEmail: true, department: { select: { name: true } } } },
      },
    });
    if (!wfh) return notFound("WFH request not found");
    if (wfh.status !== "Pending") return conflict(`Already ${wfh.status}`);
    // Segregation of duties — you can never approve your own request.
    if (wfh.employeeId === employeeId) return forbidden("You can't approve your own WFH request.");

    // Find next pending approval that belongs to this user
    const nextPending = wfh.approvals.find((a) => a.status === "Pending");
    if (!nextPending) return conflict("No pending approval level");
    if (nextPending.approverId !== employeeId) return forbidden("Not your approval level yet");

    await prisma.wfhApproval.update({
      where: { id: nextPending.id },
      data: { status: "Approved", comment: parsed.data.comment ?? null, decidedAt: new Date() },
    });

    const remaining = wfh.approvals.filter((a) => a.id !== nextPending.id && a.status === "Pending");
    const allDone = remaining.length === 0;

    if (allDone) {
      await prisma.wfhRequest.update({
        where: { id: wfh.id },
        data: { status: "Approved", updatedBy: userId },
      });
    } else {
      await prisma.wfhRequest.update({
        where: { id: wfh.id },
        data: { updatedBy: userId },
      });
    }

    // Mail
    void (async () => {
      try {
        const company = await prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } });
        const companyName = company?.companyName ?? "Our Company";
        const startStr = wfh.startDate.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
        const endStr = wfh.endDate.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
        const empName = `${wfh.employee.firstName} ${wfh.employee.lastName}`.trim();
        const baseTpl = {
          employeeName: empName,
          employeeCode: wfh.employee.employeeCode,
          jobTitle: wfh.employee.jobTitle,
          department: wfh.employee.department?.name ?? null,
          startDate: startStr,
          endDate: endStr,
          days: String(wfh.days),
          isHalfDay: wfh.isHalfDay,
          session: wfh.session,
          reason: wfh.reason,
          companyName,
        };

        if (allDone && wfh.employee.workEmail) {
          const wfhData = {
            ...baseTpl,
            variant: "decision_to_employee" as const,
            recipientName: empName,
            status: "Approved" as const,
            comment: parsed.data.comment ?? null,
          };
          await resolveAndSend(orgId, {
            key: "wfh.approved",
            to: wfh.employee.workEmail,
            vars: { ...wfhData },
            fallback: () => buildWfhNoticeEmail(wfhData),
          });
        } else {
          const next = remaining[0];
          const nextApprover = await prisma.employee.findUnique({
            where: { id: next.approverId },
            select: { firstName: true, lastName: true, workEmail: true },
          });
          if (nextApprover?.workEmail) {
            const wfhData = {
              ...baseTpl,
              variant: "approved_to_hr" as const,
              recipientName: `${nextApprover.firstName} ${nextApprover.lastName}`.trim(),
              comment: parsed.data.comment ?? null,
            };
            await resolveAndSend(orgId, {
              key: "wfh.next-approver",
              to: nextApprover.workEmail,
              vars: { ...wfhData },
              fallback: () => buildWfhNoticeEmail(wfhData),
            });
          }
        }
      } catch (e) { console.error("wfh approve mail failed", e); }
    })();

    return successResponse({ approved: true, allDone, level: nextPending.level });
  } catch (e) {
    console.error("POST /wfh/requests/[id]/approve", e);
    return internalError();
  }
});
