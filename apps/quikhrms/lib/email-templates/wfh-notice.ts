import { emailShell, hero, detailBlock, alert, btnPrimary, para, esc, type Accent } from "./_base";

type Variant = "submitted_to_manager" | "approved_to_hr" | "decision_to_employee";

export interface WfhNoticeData {
  variant: Variant;
  recipientName: string;
  employeeName: string;
  employeeCode: string;
  jobTitle?: string | null;
  department?: string | null;
  startDate: string;
  endDate: string;
  days: string;
  isHalfDay: boolean;
  session: string;
  reason: string;
  status?: "Approved" | "Rejected";
  comment?: string | null;
  companyName: string;
  portalUrl?: string | null;
}

export function buildWfhNoticeEmail(data: WfhNoticeData): { subject: string; html: string } {
  const isDecision = data.variant === "decision_to_employee";
  const isApproved = isDecision && data.status === "Approved";
  const isRejected = isDecision && data.status === "Rejected";
  const isApprover = data.variant === "submitted_to_manager" || data.variant === "approved_to_hr";

  const accent: Accent = isRejected ? "red" : isApproved ? "green" : "blue";

  const title = isRejected
    ? "WFH Request Declined"
    : isApproved
      ? "WFH Request Approved"
      : "Work From Home Notice";

  const subtitle =
    data.variant === "submitted_to_manager"
      ? `${esc(data.recipientName)}, a work-from-home request needs your review.`
      : data.variant === "approved_to_hr"
        ? `${esc(data.recipientName)}, a work-from-home request is awaiting HR confirmation.`
        : isApproved
          ? `${esc(data.recipientName)}, your work-from-home request has been approved.`
          : `${esc(data.recipientName)}, your work-from-home request was not approved.`;

  // Subject-only label — preserve exact legacy subject output.
  const dateLabel = data.startDate === data.endDate
    ? `${esc(data.startDate)}${data.isHalfDay ? ` (${data.session})` : ""}`
    : `${esc(data.startDate)} → ${esc(data.endDate)}`;

  const datesValue = `${esc(data.startDate)} – ${esc(data.endDate)}${
    data.isHalfDay ? ` (${esc(data.session)} half-day)` : ""
  }`;

  const detailRows: Array<[string, string]> = [];
  if (data.employeeName) {
    detailRows.push([
      "Employee",
      `${esc(data.employeeName)}${data.employeeCode ? ` (${esc(data.employeeCode)})` : ""}`,
    ]);
  }
  if (data.startDate || data.endDate) detailRows.push(["Dates", datesValue]);
  if (data.days) detailRows.push(["Days", esc(data.days)]);
  detailRows.push(["Work Mode", "Work From Home"]);
  if (data.reason) detailRows.push(["Reason", esc(data.reason)]);

  const btnLabel = isApprover ? "Review Request" : "Acknowledge";

  const body =
    hero({ title, subtitle, accent }) +
    detailBlock(detailRows, { heading: "WFH Details", accent }) +
    alert("info", "Please stay reachable on call and Teams during working hours.", "Important") +
    (data.comment ? para(`Note: ${esc(data.comment)}`) : "") +
    (data.portalUrl ? btnPrimary(btnLabel, data.portalUrl, accent) : "");

  const html = emailShell({
    accent,
    companyName: data.companyName,
    preheader: subtitle,
    body,
  });

  const subject =
    data.variant === "submitted_to_manager" ? `WFH request — ${data.employeeName} (${dateLabel.replace(/<[^>]+>/g, "")})` :
    data.variant === "approved_to_hr"      ? `[HR action] WFH for ${data.employeeName}` :
    isApproved                              ? `WFH approved — ${dateLabel.replace(/<[^>]+>/g, "")}` :
                                              `WFH rejected — ${dateLabel.replace(/<[^>]+>/g, "")}`;
  return { subject, html };
}
