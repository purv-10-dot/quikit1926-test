export interface JoiningLetterData {
  candidateName: string;
  jobTitle: string;
  designation?: string | null;
  offeredCTC?: number | null;
  joiningDate: string;
  department?: string | null;
  reportingTo?: string | null;
  workLocation?: string | null;
  companyName: string;
  companyAddress?: string | null;
  signatoryName?: string | null;
  signatoryDesignation?: string | null;
  letterDate?: string | null;
  employeeCode?: string | null;
}

function inr(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

export function buildJoiningLetterEmail(data: JoiningLetterData): { subject: string; html: string } {
  const dateStr = data.letterDate ?? new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const signName = data.signatoryName ?? "HR Department";
  const signTitle = data.signatoryDesignation ?? "Human Resources";
  const designation = data.designation ?? data.jobTitle;

  const rows: string[] = [
    `<tr><td style="padding:8px 0;font-size:13px;color:#6b7280;width:42%;">Designation</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#111827;">${designation}</td></tr>`,
    `<tr><td style="padding:8px 0;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6;">Date of Joining</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#111827;border-top:1px solid #f3f4f6;">${data.joiningDate}</td></tr>`,
  ];
  if (data.employeeCode) rows.push(`<tr><td style="padding:8px 0;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6;">Employee Code</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#111827;border-top:1px solid #f3f4f6;">${data.employeeCode}</td></tr>`);
  if (data.department) rows.push(`<tr><td style="padding:8px 0;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6;">Department</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#111827;border-top:1px solid #f3f4f6;">${data.department}</td></tr>`);
  if (data.reportingTo) rows.push(`<tr><td style="padding:8px 0;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6;">Reporting To</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#111827;border-top:1px solid #f3f4f6;">${data.reportingTo}</td></tr>`);
  if (data.workLocation) rows.push(`<tr><td style="padding:8px 0;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6;">Work Location</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#111827;border-top:1px solid #f3f4f6;">${data.workLocation}</td></tr>`);
  if (data.offeredCTC) rows.push(`<tr><td style="padding:8px 0;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6;">Annual CTC</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#111827;border-top:1px solid #f3f4f6;">${inr(Number(data.offeredCTC))}</td></tr>`);

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#eef2f7;color:#1f2937;">
  <div style="max-width:720px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:6px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.06);">

      <div style="background:linear-gradient(120deg,#047857 0%,#10b981 100%);padding:28px 40px;color:#ffffff;">
        <h1 style="margin:0;font-size:24px;font-weight:800;letter-spacing:-0.3px;">Welcome to ${data.companyName}</h1>
        <p style="margin:4px 0 0;font-size:13px;opacity:0.9;">Joining Letter &amp; Appointment Confirmation</p>
      </div>

      <div style="padding:28px 44px 6px;">
        <p style="margin:0;font-size:14px;font-weight:700;color:#111827;">${data.companyName}</p>
        ${data.companyAddress ? `<p style="margin:2px 0 0;font-size:12px;color:#6b7280;">${data.companyAddress}</p>` : ""}
        <p style="margin:14px 0 0;font-size:13px;color:#6b7280;">${dateStr}</p>
      </div>

      <div style="padding:16px 44px 6px;">
        <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#111827;">Dear ${data.candidateName},</p>
      </div>

      <div style="padding:8px 44px 8px;">
        <p style="margin:0 0 12px;font-size:14px;line-height:1.75;color:#1f2937;text-align:justify;">
          We are delighted to formally appoint you to the role of <strong>${designation}</strong> at <strong>${data.companyName}</strong>. This letter confirms the terms of your joining and your onboarding schedule.
        </p>

        <p style="margin:0 0 12px;font-size:14px;line-height:1.75;color:#1f2937;text-align:justify;">
          Please report to our office on <strong>${data.joiningDate}</strong>${data.workLocation ? ` at <strong>${data.workLocation}</strong>` : ""} for the joining formalities. Kindly carry the required identification documents, academic certificates, prior employment records and your recent photographs.
        </p>

        <table cellpadding="0" cellspacing="0" width="100%" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:2px 16px;margin:16px 0;border-collapse:collapse;">
          ${rows.join("")}
        </table>

        <p style="margin:12px 0;font-size:14px;line-height:1.75;color:#1f2937;text-align:justify;">
          Your appointment is subject to the terms and conditions outlined in your offer letter and the company's employment policies. We look forward to having you on board and are confident that your association with us will be mutually rewarding.
        </p>

        <p style="margin:12px 0;font-size:14px;line-height:1.75;color:#1f2937;">
          Please reply to this email to confirm your acceptance and joining.
        </p>

        <div style="margin:32px 0 0;">
          <p style="margin:0;font-size:14px;color:#111827;">Warm regards,</p>
          <p style="margin:24px 0 0;font-size:15px;font-weight:700;color:#111827;">${signName}</p>
          <p style="margin:2px 0 0;font-size:13px;color:#4b5563;">${signTitle}</p>
          <p style="margin:2px 0 28px;font-size:13px;color:#4b5563;">${data.companyName}</p>
        </div>
      </div>

      <div style="background:#f9fafb;padding:14px 44px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #f3f4f6;">
        Confidential — this joining letter is intended only for ${data.candidateName}.
      </div>
    </div>
  </div>
</body>
</html>`;

  const subject = `Joining Letter — ${designation} at ${data.companyName}`;
  return { subject, html };
}
