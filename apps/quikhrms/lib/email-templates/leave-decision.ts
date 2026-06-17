import { baseLayout, infoTable } from "./_base";

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
  const rows: Array<[string, string]> = [
    ["Leave Type", data.leaveTypeName],
    ["From", data.startDate],
    ["To", data.endDate],
    ["Duration", `${data.duration} day${data.duration === 1 ? "" : "s"}`],
    ["Decision", `<span style="color:${approved ? "#059669" : "#dc2626"};font-weight:700;">${data.decision}</span>`],
    ["Reviewer", data.approverName],
  ];
  if (data.comment) rows.push(["Comment", data.comment]);

  const html = baseLayout({
    title: approved ? "Leave approved" : "Leave not approved",
    subtitle: approved ? "Your request is confirmed" : "Please check with your manager",
    greeting: `Hi <strong>${data.employeeName}</strong>,`,
    body: `
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
        Your leave request has been <strong>${data.decision.toLowerCase()}</strong>. Details below.
      </p>
      ${infoTable(rows)}
      <p style="margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
        ${approved
          ? "Enjoy your time off. Make sure your handover is documented before you leave."
          : "If you have questions, please reach out to your reporting manager."}
      </p>
    `,
    companyName: data.companyName,
    accent: approved ? "#10b981" : "#ef4444",
  });

  return {
    subject: `Leave ${data.decision.toLowerCase()} — ${data.startDate} to ${data.endDate}`,
    html,
  };
}
