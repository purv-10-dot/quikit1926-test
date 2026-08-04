import { prisma } from "@/lib/prisma";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildExpenseApprovalRequestEmail, buildExpenseDecisionEmail } from "@/lib/email-templates/expense-notifications";
import { appBaseUrl } from "@/lib/utils/app-url";

interface ClaimBrief {
  id: string;
  employeeId: string;
  title: string;
  category: string;
  totalAmount: number;
  currency: string;
}

/**
 * Notify every resolved approver for a chain level (in-app + email) that a
 * claim is waiting on them — used both when a claim is first submitted (level
 * 1) and when it advances past an intermediate level.
 */
export async function notifyExpenseApprovers(
  orgId: string,
  claim: ClaimBrief,
  level: number,
  approverIds: string[],
): Promise<void> {
  if (approverIds.length === 0) return;
  try {
    const employee = await prisma.employee.findFirst({
      where: { id: claim.employeeId, orgId },
      select: { firstName: true, lastName: true, employeeCode: true },
    });
    if (!employee) return;
    const employeeName = `${employee.firstName} ${employee.lastName}`.trim();
    const reviewUrl = appBaseUrl() ? `${appBaseUrl()}/expenses/approvals` : null;

    await prisma.hrmsNotification.createMany({
      data: approverIds.map((id) => ({
        orgId,
        employeeId: id,
        type: "Info" as const,
        channel: "InApp" as const,
        title: "Expense claim awaiting your approval",
        message: `${employeeName} (${employee.employeeCode}) submitted "${claim.title}" — ${claim.currency} ${claim.totalAmount}.`,
        link: "/expenses/approvals",
        entityType: "ExpenseClaim",
        entityId: claim.id,
      })),
    });

    const [approvers, company] = await Promise.all([
      prisma.employee.findMany({
        where: { id: { in: approverIds }, orgId, deletedAt: null },
        select: { firstName: true, lastName: true, workEmail: true },
      }),
      prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } }),
    ]);
    const companyName = company?.companyName ?? "QuikIT HRMS";

    await Promise.all(
      approvers
        .filter((a) => a.workEmail)
        .map((a) =>
          resolveAndSend(orgId, {
            key: "expense.approval-request",
            to: a.workEmail!,
            vars: {
              recipientName: `${a.firstName} ${a.lastName}`.trim(),
              employeeName,
              employeeCode: employee.employeeCode,
              title: claim.title,
              category: claim.category,
              totalAmount: String(claim.totalAmount),
              currency: claim.currency,
              level: String(level),
              reviewUrl: reviewUrl ?? "",
              companyName,
            },
            fallback: () =>
              buildExpenseApprovalRequestEmail({
                recipientName: `${a.firstName} ${a.lastName}`.trim(),
                employeeName,
                employeeCode: employee.employeeCode,
                title: claim.title,
                category: claim.category,
                totalAmount: String(claim.totalAmount),
                currency: claim.currency,
                level,
                reviewUrl,
                companyName,
              }),
          }).catch((err) => console.error("[notify] expense approval-request email failed:", err)),
        ),
    );
  } catch (err) {
    console.error("[notify] expense approver notify failed:", err);
  }
}

/** Notify the employee once their claim is fully approved/rejected — in-app + email. */
export async function notifyExpenseDecision(
  orgId: string,
  claim: ClaimBrief,
  decision: "Approved" | "Rejected",
  approverId: string,
  comment?: string | null,
): Promise<void> {
  try {
    const [employee, approver, company] = await Promise.all([
      prisma.employee.findFirst({ where: { id: claim.employeeId, orgId }, select: { firstName: true, lastName: true, workEmail: true } }),
      prisma.employee.findFirst({ where: { id: approverId, orgId }, select: { firstName: true, lastName: true } }),
      prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } }),
    ]);
    const decisionLc = decision.toLowerCase();

    await prisma.hrmsNotification.create({
      data: {
        orgId,
        employeeId: claim.employeeId,
        type: decision === "Approved" ? "Success" : "Error",
        channel: "InApp",
        title: `Expense claim ${decisionLc}`,
        message: `Your claim "${claim.title}" (${claim.currency} ${claim.totalAmount}) has been ${decisionLc}.`,
        link: "/expenses",
        entityType: "ExpenseClaim",
        entityId: claim.id,
      },
    });

    if (!employee?.workEmail) return;
    const employeeName = `${employee.firstName} ${employee.lastName}`.trim();
    const approverName = approver ? `${approver.firstName} ${approver.lastName}`.trim() : "Finance";
    const companyName = company?.companyName ?? "QuikIT HRMS";
    await resolveAndSend(orgId, {
      key: "expense.decision",
      to: employee.workEmail,
      vars: {
        employeeName,
        title: claim.title,
        totalAmount: String(claim.totalAmount),
        currency: claim.currency,
        approverName,
        comment: comment ?? "",
        decision,
        companyName,
      },
      fallback: () =>
        buildExpenseDecisionEmail({
          employeeName,
          title: claim.title,
          totalAmount: String(claim.totalAmount),
          currency: claim.currency,
          approverName,
          comment,
          decision,
          companyName,
        }),
    });
  } catch (err) {
    console.error("[notify] expense decision notify failed:", err);
  }
}
