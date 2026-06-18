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

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildWfhNoticeEmail(data: WfhNoticeData): { subject: string; html: string } {
  const isDecision = data.variant === "decision_to_employee";
  const isApproved = isDecision && data.status === "Approved";
  const accent = isDecision
    ? (isApproved ? "#059669" : "#dc2626")
    : "#2563eb";
  const accentSoft = isDecision ? (isApproved ? "#ecfdf5" : "#fef2f2") : "#eff6ff";
  const accentRing = isDecision ? (isApproved ? "#a7f3d0" : "#fecaca") : "#bfdbfe";
  const accentText = isDecision ? (isApproved ? "#065f46" : "#991b1b") : "#1d4ed8";

  const heading =
    data.variant === "submitted_to_manager" ? `WFH request from ${data.employeeName}` :
    data.variant === "approved_to_hr"      ? `WFH pending HR approval — ${data.employeeName}` :
    isApproved                              ? `WFH approved` : `WFH rejected`;

  const intro =
    data.variant === "submitted_to_manager" ? `<strong>${escape(data.employeeName)}</strong>, who reports to you, has submitted a Work-From-Home request that requires your approval.` :
    data.variant === "approved_to_hr"      ? `<strong>${escape(data.employeeName)}</strong>'s manager has approved their Work-From-Home request. HR confirmation is the final step.` :
    isApproved                              ? `Your Work-From-Home request has been <strong>approved</strong>. You're all set for the dates below.` :
                                              `Your Work-From-Home request has been <strong>rejected</strong>.${data.comment ? ` Reason: <em>${escape(data.comment)}</em>` : ""}`;

  const row = (k: string, v: string) => `
    <tr>
      <td style="padding:6px 12px 6px 0;font-size:13px;color:#6b7280;width:160px;vertical-align:top;">${k}</td>
      <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">${v}</td>
    </tr>`;

  const dateLabel = data.startDate === data.endDate
    ? `${escape(data.startDate)}${data.isHalfDay ? ` (${data.session})` : ""}`
    : `${escape(data.startDate)} → ${escape(data.endDate)}`;

  const rows: Array<[string, string] | null> = [
    ["Employee", `${escape(data.employeeName)} (${escape(data.employeeCode)})`],
    data.jobTitle ? ["Designation", escape(data.jobTitle)] : null,
    data.department ? ["Department", escape(data.department)] : null,
    ["Date(s)", dateLabel],
    ["Days", `${escape(data.days)}${data.isHalfDay ? " (half-day)" : ""}`],
    ["Reason", escape(data.reason)],
    data.comment && !isDecision ? ["Comment", escape(data.comment)] : null,
  ];
  const filtered = rows.filter((r): r is [string, string] => r !== null);

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:${accentSoft};color:#1f2937;">
  <div style="max-width:680px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      <div style="background:${accent};padding:28px 36px;color:#ffffff;">
        <p style="margin:0;font-size:11px;letter-spacing:3px;font-weight:700;text-transform:uppercase;opacity:0.9;">Work From Home</p>
        <h1 style="margin:6px 0 0;font-size:22px;font-weight:800;letter-spacing:-0.3px;">${escape(heading)}</h1>
      </div>
      <div style="padding:26px 36px 4px;">
        <p style="margin:0;font-size:14px;color:#111827;">Hi <strong>${escape(data.recipientName)}</strong>,</p>
        <p style="margin:14px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">${intro}</p>

        <div style="margin:18px 0 0;padding:14px 18px;background:${accentSoft};border:1px solid ${accentRing};border-radius:8px;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:${accentText};letter-spacing:0.5px;text-transform:uppercase;">WFH Details</p>
          <table style="border-collapse:collapse;width:100%;">${filtered.map(([k, v]) => row(k, v)).join("")}</table>
        </div>

        ${data.portalUrl ? `
          <div style="text-align:center;margin:24px 0 0;">
            <a href="${escape(data.portalUrl)}" style="display:inline-block;background:${accent};color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Open in HRMS</a>
          </div>` : ""}

        <p style="margin:24px 0 28px;font-size:13px;color:#4b5563;">Regards,<br/>${escape(data.companyName)} · People Operations</p>
      </div>
      <div style="background:#f9fafb;padding:14px 36px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #f3f4f6;">
        Automated notification from ${escape(data.companyName)} HRMS.
      </div>
    </div>
  </div>
</body>
</html>`;

  const subject =
    data.variant === "submitted_to_manager" ? `WFH request — ${data.employeeName} (${dateLabel.replace(/<[^>]+>/g, "")})` :
    data.variant === "approved_to_hr"      ? `[HR action] WFH for ${data.employeeName}` :
    isApproved                              ? `WFH approved — ${dateLabel.replace(/<[^>]+>/g, "")}` :
                                              `WFH rejected — ${dateLabel.replace(/<[^>]+>/g, "")}`;
  return { subject, html };
}
