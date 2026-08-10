import { prisma } from "@/lib/prisma";
import { resolveAndSend } from "@/lib/email/resolve";
import {
  buildAttendanceRegularizationRequestEmail,
  buildAttendanceRegularizationDecisionEmail,
} from "@/lib/email-templates/attendance-regularization";
import { findEmployeesWithPermission } from "@/lib/rbac/permission-holders";
import { appBaseUrl } from "@/lib/utils/app-url";

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

/**
 * Notify whoever can approve this employee's regularization: their reporting
 * manager if one is on file, else every holder of the attendance-approve
 * permission (mirrors the single-level "manager OR HR" gate in the decision
 * route — records/[id]/route.ts PATCH). Fire-and-forget; never throws.
 */
export async function notifyRegularizationApprovers(
  orgId: string,
  employeeId: string,
  recordId: string,
  date: Date,
  reason: string,
): Promise<void> {
  try {
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, orgId },
      select: { firstName: true, lastName: true, employeeCode: true, reportingManagerId: true },
    });
    if (!employee) return;

    const approverIds = employee.reportingManagerId
      ? [employee.reportingManagerId]
      : (await findEmployeesWithPermission(orgId, "hrms.attendance.approve")).filter((id) => id !== employeeId);
    if (approverIds.length === 0) return;

    const employeeName = `${employee.firstName} ${employee.lastName}`.trim();
    const dateStr = fmtDate(date);
    const reviewUrl = appBaseUrl() ? `${appBaseUrl()}/attendance/regularizations` : null;

    await prisma.hrmsNotification.createMany({
      data: approverIds.map((id) => ({
        orgId,
        employeeId: id,
        type: "Info" as const,
        channel: "InApp" as const,
        title: "Attendance regularization pending",
        message: `${employeeName} (${employee.employeeCode}) requested a correction for ${dateStr}.`,
        link: "/attendance/regularizations",
        entityType: "AttendanceRecord",
        entityId: recordId,
      })),
    });

    const approvers = await prisma.employee.findMany({
      where: { id: { in: approverIds }, orgId, deletedAt: null },
      select: { firstName: true, lastName: true, workEmail: true },
    });
    const company = await prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } });
    const companyName = company?.companyName ?? "QuikIT HRMS";

    await Promise.all(
      approvers
        .filter((a) => a.workEmail)
        .map((a) =>
          resolveAndSend(orgId, {
            key: "attendance.regularization-request",
            to: a.workEmail!,
            vars: {
              recipientName: `${a.firstName} ${a.lastName}`.trim(),
              employeeName,
              employeeCode: employee.employeeCode,
              date: dateStr,
              reason,
              reviewUrl: reviewUrl ?? "",
              companyName,
            },
            fallback: () =>
              buildAttendanceRegularizationRequestEmail({
                recipientName: `${a.firstName} ${a.lastName}`.trim(),
                employeeName,
                employeeCode: employee.employeeCode,
                date: dateStr,
                reason,
                reviewUrl,
                companyName,
              }),
          }).catch((err) => console.error("[notify] regularization request email failed:", err)),
        ),
    );
  } catch (err) {
    console.error("[notify] regularization approver notify failed:", err);
  }
}

/**
 * Notify the employee once their regularization has been approved/rejected —
 * in-app + email. Fire-and-forget; never throws.
 */
export async function notifyRegularizationDecision(
  orgId: string,
  employeeId: string,
  recordId: string,
  date: Date,
  decision: "Approved" | "Rejected",
  approverId: string,
  comment?: string | null,
): Promise<void> {
  try {
    const [employee, approver, company] = await Promise.all([
      prisma.employee.findFirst({ where: { id: employeeId, orgId }, select: { firstName: true, lastName: true, workEmail: true } }),
      prisma.employee.findFirst({ where: { id: approverId, orgId }, select: { firstName: true, lastName: true } }),
      prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } }),
    ]);
    const dateStr = fmtDate(date);
    const decisionLc = decision.toLowerCase();

    await prisma.hrmsNotification.create({
      data: {
        orgId,
        employeeId,
        type: decision === "Approved" ? "Success" : "Error",
        channel: "InApp",
        title: `Attendance regularization ${decisionLc}`,
        message: `Your attendance correction for ${dateStr} has been ${decisionLc}.`,
        link: "/attendance",
        entityType: "AttendanceRecord",
        entityId: recordId,
      },
    });

    if (!employee?.workEmail) return;
    const employeeName = `${employee.firstName} ${employee.lastName}`.trim();
    const approverName = approver ? `${approver.firstName} ${approver.lastName}`.trim() : "HR";
    const companyName = company?.companyName ?? "QuikIT HRMS";
    await resolveAndSend(orgId, {
      key: "attendance.regularization-decision",
      to: employee.workEmail,
      vars: {
        employeeName,
        date: dateStr,
        approverName,
        comment: comment ?? "",
        decision,
        companyName,
      },
      fallback: () =>
        buildAttendanceRegularizationDecisionEmail({
          employeeName,
          date: dateStr,
          approverName,
          comment,
          decision,
          companyName,
        }),
    });
  } catch (err) {
    console.error("[notify] regularization decision notify failed:", err);
  }
}
