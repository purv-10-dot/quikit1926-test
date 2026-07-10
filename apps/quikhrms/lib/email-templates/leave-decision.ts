import { emailShell, hero, detailBlock, alert, para, esc } from "./_base";

export interface LeaveDecisionData {
  employeeName: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  duration: number;
  approverName: string;
  comment?: string | null;
  decision: "Approved" | "Rejected";
  companyName: string;
}

export function buildLeaveDecisionEmail(data: LeaveDecisionData): { subject: string; html: string } {
  const approved = data.decision === "Approved";
  const accent = approved ? "green" : "red";

  const details = detailBlock(
    [
      ["Leave Type", esc(data.leaveTypeName)],
      ["From Date", esc(data.startDate)],
      ["To Date", esc(data.endDate)],
      ["Total Days", esc(String(data.duration))],
      ["Approver", esc(data.approverName)],
    ],
    { heading: "Leave Details", accent },
  );

  const body = approved
    ? `${hero({
        title: "Leave Approved",
        subtitle: "Your leave has been approved.",
        accent,
        emoji: "✅",
      })}${details}${alert(
        "success",
        "Thank you for planning ahead. We wish you a pleasant time off!",
      )}${data.comment ? para(`Note from ${esc(data.approverName)}: ${esc(data.comment)}`) : ""}`
    : `${hero({
        title: "Leave Request Declined",
        subtitle: "Your leave request was not approved.",
        accent,
      })}${details}${alert(
        "warning",
        data.comment ? esc(data.comment) : "Please reach out to your manager for details.",
        "Reason",
      )}`;

  const html = emailShell({
    accent,
    companyName: data.companyName,
    preheader: approved ? "Your leave has been approved." : "Your leave request was not approved.",
    body,
  });

  return {
    subject: `Leave ${data.decision.toLowerCase()} — ${data.startDate} to ${data.endDate}`,
    html,
  };
}
