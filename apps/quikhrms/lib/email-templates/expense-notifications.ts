import { emailShell, hero, detailBlock, alert, para, esc, btnPrimary } from "./_base";

export interface ExpenseApprovalRequestData {
  recipientName: string;
  employeeName: string;
  employeeCode: string;
  title: string;
  category: string;
  totalAmount: string;
  currency: string;
  level: number;
  reviewUrl?: string | null;
  companyName: string;
}

/** → the current level's approver, on submit or on advancing to the next level. */
export function buildExpenseApprovalRequestEmail(
  data: ExpenseApprovalRequestData,
): { subject: string; html: string } {
  const details = detailBlock(
    [
      ["Employee", esc(`${data.employeeName} (${data.employeeCode})`)],
      ["Claim", esc(data.title)],
      ["Category", esc(data.category)],
      ["Amount", esc(`${data.currency} ${data.totalAmount}`)],
      ["Approval Level", esc(String(data.level))],
    ],
    { heading: "Expense Claim Details", accent: "amber" },
  );

  const body = `${hero({
    title: "Expense Claim Awaiting Your Approval",
    subtitle: `${esc(data.employeeName)} submitted a claim that needs your review.`,
    accent: "amber",
    emoji: "🧾",
  })}${details}${data.reviewUrl ? btnPrimary("Review Claim", data.reviewUrl, "amber") : ""}`;

  const html = emailShell({
    accent: "amber",
    companyName: data.companyName,
    preheader: `${data.employeeName} submitted an expense claim of ${data.currency} ${data.totalAmount}.`,
    body,
  });

  return { subject: `Expense claim awaiting approval — ${data.employeeName} (${data.currency} ${data.totalAmount})`, html };
}

export interface ExpenseDecisionData {
  employeeName: string;
  title: string;
  totalAmount: string;
  currency: string;
  approverName: string;
  comment?: string | null;
  decision: "Approved" | "Rejected";
  companyName: string;
}

/** → the employee once their claim is fully approved or rejected. */
export function buildExpenseDecisionEmail(data: ExpenseDecisionData): { subject: string; html: string } {
  const approved = data.decision === "Approved";
  const accent = approved ? "green" : "red";

  const details = detailBlock(
    [
      ["Claim", esc(data.title)],
      ["Amount", esc(`${data.currency} ${data.totalAmount}`)],
      ["Approver", esc(data.approverName)],
    ],
    { heading: "Expense Claim Details", accent },
  );

  const body = approved
    ? `${hero({
        title: "Expense Claim Approved",
        subtitle: "Your expense claim has been approved.",
        accent,
        emoji: "✅",
      })}${details}${data.comment ? para(`Note from ${esc(data.approverName)}: ${esc(data.comment)}`) : ""}`
    : `${hero({
        title: "Expense Claim Rejected",
        subtitle: "Your expense claim was not approved.",
        accent,
      })}${details}${alert(
        "warning",
        data.comment ? esc(data.comment) : "Please reach out to your approver for details.",
        "Reason",
      )}`;

  const html = emailShell({
    accent,
    companyName: data.companyName,
    preheader: approved ? "Your expense claim has been approved." : "Your expense claim was not approved.",
    body,
  });

  return { subject: `Expense claim ${data.decision.toLowerCase()} — ${data.currency} ${data.totalAmount}`, html };
}
