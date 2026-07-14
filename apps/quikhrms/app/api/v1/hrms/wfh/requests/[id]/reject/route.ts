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

    const nextPending = wfh.approvals.find((a) => a.status === "Pending");
    if (!nextPending) return conflict("No pending approval level");
    if (nextPending.approverId !== employeeId) return forbidden("Not your approval level");

    await prisma.wfhApproval.update({
      where: { id: nextPending.id },
      data: { status: "Rejected", comment: parsed.data.comment ?? null, decidedAt: new Date() },
    });
    // Skip subsequent pending approvals
    await prisma.wfhApproval.updateMany({
      where: { wfhRequestId: wfh.id, status: "Pending" },
      data: { status: "Skipped", decidedAt: new Date() },
    });
    await prisma.wfhRequest.update({
      where: { id: wfh.id },
      data: { status: "Rejected", updatedBy: userId },
    });

    void (async () => {
      try {
        if (!wfh.employee.workEmail) return;
        const company = await prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } });
        const wfhData = {
          variant: "decision_to_employee" as const,
          recipientName: `${wfh.employee.firstName} ${wfh.employee.lastName}`.trim(),
          employeeName: `${wfh.employee.firstName} ${wfh.employee.lastName}`.trim(),
          employeeCode: wfh.employee.employeeCode,
          jobTitle: wfh.employee.jobTitle,
          department: wfh.employee.department?.name ?? null,
          startDate: wfh.startDate.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }),
          endDate: wfh.endDate.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }),
          days: String(wfh.days),
          isHalfDay: wfh.isHalfDay,
          session: wfh.session,
          reason: wfh.reason,
          status: "Rejected" as const,
          comment: parsed.data.comment ?? null,
          companyName: company?.companyName ?? "Our Company",
        };
        await resolveAndSend(orgId, {
          key: "wfh.rejected",
          to: wfh.employee.workEmail,
          vars: { ...wfhData },
          fallback: () => buildWfhNoticeEmail(wfhData),
        });
      } catch (e) { console.error("wfh reject mail failed", e); }
    })();

    return successResponse({ rejected: true, level: nextPending.level });
  } catch (e) {
    console.error("POST /wfh/requests/[id]/reject", e);
    return internalError();
  }
});
