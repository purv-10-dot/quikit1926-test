import { emailShell, hero, detailBlock, alert, para, esc, btnPrimary } from "./_base";

export interface AttendanceRegularizationRequestData {
  recipientName: string;
  employeeName: string;
  employeeCode: string;
  date: string;
  reason: string;
  reviewUrl?: string | null;
  companyName: string;
}

/** → the approver (reporting manager / attendance-approve role holder). */
export function buildAttendanceRegularizationRequestEmail(
  data: AttendanceRegularizationRequestData,
): { subject: string; html: string } {
  const details = detailBlock(
    [
      ["Employee", esc(`${data.employeeName} (${data.employeeCode})`)],
      ["Date", esc(data.date)],
      ["Reason", esc(data.reason)],
    ],
    { heading: "Regularization Details", accent: "amber" },
  );

  const body = `${hero({
    title: "Attendance Regularization Pending",
    subtitle: `${esc(data.employeeName)} has requested a correction to their attendance.`,
    accent: "amber",
    emoji: "🕒",
  })}${details}${data.reviewUrl ? btnPrimary("Review Request", data.reviewUrl, "amber") : ""}`;

  const html = emailShell({
    accent: "amber",
    companyName: data.companyName,
    preheader: `${data.employeeName} requested an attendance correction for ${data.date}.`,
    body,
  });

  return { subject: `Attendance regularization pending — ${data.employeeName} (${data.date})`, html };
}

export interface AttendanceRegularizationDecisionData {
  employeeName: string;
  date: string;
  approverName: string;
  comment?: string | null;
  decision: "Approved" | "Rejected";
  companyName: string;
}

/** → the employee who requested the regularization. */
export function buildAttendanceRegularizationDecisionEmail(
  data: AttendanceRegularizationDecisionData,
): { subject: string; html: string } {
  const approved = data.decision === "Approved";
  const accent = approved ? "green" : "red";

  const details = detailBlock(
    [
      ["Date", esc(data.date)],
      ["Approver", esc(data.approverName)],
    ],
    { heading: "Regularization Details", accent },
  );

  const body = approved
    ? `${hero({
        title: "Regularization Approved",
        subtitle: "Your attendance correction has been approved.",
        accent,
        emoji: "✅",
      })}${details}${data.comment ? para(`Note from ${esc(data.approverName)}: ${esc(data.comment)}`) : ""}`
    : `${hero({
        title: "Regularization Declined",
        subtitle: "Your attendance correction request was not approved.",
        accent,
      })}${details}${alert(
        "warning",
        data.comment ? esc(data.comment) : "Please reach out to your manager for details.",
        "Reason",
      )}`;

  const html = emailShell({
    accent,
    companyName: data.companyName,
    preheader: approved ? "Your attendance regularization was approved." : "Your attendance regularization was declined.",
    body,
  });

  return { subject: `Attendance regularization ${data.decision.toLowerCase()} — ${data.date}`, html };
}
