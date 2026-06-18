export interface ResignationNoticeData {
  recipientName: string;
  recipientRole: "direct_manager" | "skip_level";
  employeeName: string;
  employeeCode: string;
  jobTitle?: string | null;
  department?: string | null;
  resignationDate: string;
  lastWorkingDate: string;
  noticePeriodDays: number;
  reason?: string | null;
  notes?: string | null;
  companyName: string;
  portalUrl?: string | null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildResignationNoticeEmail(data: ResignationNoticeData): { subject: string; html: string } {
  const isDirect = data.recipientRole === "direct_manager";
  const heading = isDirect
    ? `${data.employeeName} has submitted resignation`
    : `Resignation in your reporting tree — ${data.employeeName}`;

  const row = (k: string, v: string) => `
    <tr>
      <td style="padding:6px 12px 6px 0;font-size:13px;color:#6b7280;width:170px;vertical-align:top;">${k}</td>
      <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">${v}</td>
    </tr>`;

  const rows: Array<[string, string] | null> = [
    ["Employee", `${escapeHtml(data.employeeName)} (${escapeHtml(data.employeeCode)})`],
    data.jobTitle ? ["Designation", escapeHtml(data.jobTitle)] : null,
    data.department ? ["Department", escapeHtml(data.department)] : null,
    ["Resignation Date", escapeHtml(data.resignationDate)],
    ["Last Working Date", escapeHtml(data.lastWorkingDate)],
    ["Notice Period", `${data.noticePeriodDays} days`],
    data.reason ? ["Reason", escapeHtml(data.reason)] : null,
    data.notes ? ["Notes", escapeHtml(data.notes)] : null,
  ];
  const filtered = rows.filter((r): r is [string, string] => r !== null);

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#fef2f2;color:#1f2937;">
  <div style="max-width:680px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

      <div style="background:linear-gradient(135deg,#b91c1c 0%,#dc2626 60%,#ef4444 100%);padding:28px 36px;color:#ffffff;">
        <p style="margin:0;font-size:11px;letter-spacing:3px;font-weight:700;text-transform:uppercase;opacity:0.9;">Resignation Submitted</p>
        <h1 style="margin:6px 0 0;font-size:22px;font-weight:800;letter-spacing:-0.3px;">${escapeHtml(heading)}</h1>
      </div>

      <div style="padding:26px 36px 4px;">
        <p style="margin:0;font-size:14px;color:#111827;">Hi <strong>${escapeHtml(data.recipientName)}</strong>,</p>

        <p style="margin:14px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">
          ${isDirect
            ? `<strong>${escapeHtml(data.employeeName)}</strong>, who reports directly to you, has submitted their resignation through the HRMS self-service portal.`
            : `This is to inform you that <strong>${escapeHtml(data.employeeName)}</strong>, an employee in your reporting tree, has submitted their resignation.`}
        </p>

        <div style="margin:18px 0 0;padding:14px 18px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#991b1b;letter-spacing:0.5px;text-transform:uppercase;">Resignation Details</p>
          <table style="border-collapse:collapse;width:100%;">${filtered.map(([k, v]) => row(k, v)).join("")}</table>
        </div>

        <p style="margin:22px 0 0;font-size:13px;font-weight:700;color:#111827;letter-spacing:0.5px;text-transform:uppercase;">Next steps</p>
        <ul style="margin:8px 0 0;padding-left:20px;font-size:13px;line-height:1.7;color:#1f2937;">
          ${isDirect ? `
            <li style="margin:3px 0;">Acknowledge the resignation with the employee.</li>
            <li style="margin:3px 0;">Plan knowledge transfer and handover before <strong>${escapeHtml(data.lastWorkingDate)}</strong>.</li>
            <li style="margin:3px 0;">Coordinate with HR for clearance, exit interview and final settlement.</li>
            <li style="margin:3px 0;">Initiate backfill request if the role needs replacement.</li>
          ` : `
            <li style="margin:3px 0;">No direct action required — sharing for visibility.</li>
            <li style="margin:3px 0;">Direct manager is leading the offboarding process.</li>
            <li style="margin:3px 0;">Reach out to HR or the manager if you have specific concerns.</li>
          `}
        </ul>

        ${data.portalUrl ? `
          <div style="text-align:center;margin:24px 0 0;">
            <a href="${escapeHtml(data.portalUrl)}" style="display:inline-block;background:#dc2626;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">View in HRMS</a>
          </div>` : ""}

        <p style="margin:24px 0 0;font-size:14px;color:#111827;">Regards,</p>
        <p style="margin:4px 0 28px;font-size:13px;color:#4b5563;">${escapeHtml(data.companyName)} · People Operations</p>
      </div>

      <div style="background:#f9fafb;padding:14px 36px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #f3f4f6;">
        Automated notification from ${escapeHtml(data.companyName)} HRMS.
      </div>
    </div>
  </div>
</body>
</html>`;

  return {
    subject: isDirect
      ? `Resignation submitted: ${data.employeeName} (LWD ${data.lastWorkingDate})`
      : `[FYI] Resignation in reporting tree: ${data.employeeName}`,
    html,
  };
}
