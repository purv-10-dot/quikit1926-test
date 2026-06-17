export interface OfferDefaultData {
  candidateName: string;
  jobTitle: string;
  designation?: string | null;
  offeredCTC: number;
  joiningDate: string;
  joiningBonus?: number | null;
  expiresAt?: string | null;
  department?: string | null;
  reportingTo?: string | null;
  companyName: string;
  companyAddress?: string | null;
  signatoryName?: string | null;
  signatoryDesignation?: string | null;
  letterDate?: string | null;
  workLocation?: string | null;
}

function inr(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

export function buildOfferDefaultEmail(data: OfferDefaultData): { subject: string; html: string } {
  const dateStr = data.letterDate ?? new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const signName = data.signatoryName ?? "Hiring Manager";
  const signTitle = data.signatoryDesignation ?? "Human Resources";
  const designation = data.designation ?? data.jobTitle;

  const bullets: string[] = [
    `<li style="margin:4px 0;"><strong>Position:</strong> ${designation}</li>`,
    `<li style="margin:4px 0;"><strong>Start Date:</strong> ${data.joiningDate}</li>`,
    `<li style="margin:4px 0;"><strong>Work Location:</strong> ${data.workLocation ?? "On-site"}</li>`,
    `<li style="margin:4px 0;"><strong>Compensation:</strong> ${inr(data.offeredCTC)} per annum</li>`,
  ];
  if (data.department) bullets.push(`<li style="margin:4px 0;"><strong>Department:</strong> ${data.department}</li>`);
  if (data.reportingTo) bullets.push(`<li style="margin:4px 0;"><strong>Reporting To:</strong> ${data.reportingTo}</li>`);
  if (data.joiningBonus) bullets.push(`<li style="margin:4px 0;"><strong>Joining Bonus:</strong> ${inr(data.joiningBonus)}</li>`);

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;color:#1f2937;">
  <div style="max-width:720px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;position:relative;overflow:hidden;border-radius:4px;box-shadow:0 2px 6px rgba(0,0,0,0.06);">

      <div style="height:14px;background:linear-gradient(90deg,#f59e0b 0%,#f59e0b 55%,#111827 55%,#111827 100%);"></div>

      <div style="padding:28px 40px 16px;border-bottom:1px solid #f3f4f6;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td style="vertical-align:top;">
              <p style="margin:0;font-size:20px;font-weight:800;color:#111827;letter-spacing:-0.3px;">${data.companyName}</p>
              ${data.companyAddress ? `<p style="margin:2px 0 0;font-size:12px;color:#6b7280;">${data.companyAddress}</p>` : ""}
            </td>
            <td style="text-align:right;vertical-align:top;">
              <p style="margin:0;font-size:12px;color:#6b7280;">${dateStr}</p>
            </td>
          </tr>
        </table>
      </div>

      <div style="padding:28px 40px 8px;">
        <h1 style="margin:0;font-size:28px;font-weight:800;color:#111827;letter-spacing:1px;text-align:center;">JOB OFFER LETTER</h1>
      </div>

      <div style="padding:18px 40px 8px;">
        <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#111827;">To:</p>
        <p style="margin:0;font-size:14px;color:#111827;">${data.candidateName}</p>
      </div>

      <div style="padding:18px 40px 8px;">
        <p style="margin:0 0 14px;font-size:14px;color:#111827;"><strong>Dear ${data.candidateName},</strong></p>

        <p style="margin:0 0 12px;font-size:14px;line-height:1.75;color:#1f2937;text-align:justify;">
          We are pleased to extend this offer of employment for the position of <strong>${designation}</strong> at <strong>${data.companyName}</strong>.
        </p>

        <p style="margin:0 0 12px;font-size:14px;line-height:1.75;color:#1f2937;text-align:justify;">
          In this role, you will contribute to our team's ongoing work and collaborate with colleagues across functions. Your skills and dedication are expected to contribute positively to our operations.
        </p>

        <p style="margin:14px 0 6px;font-size:14px;font-weight:700;color:#111827;">Employment Details:</p>
        <ul style="margin:0 0 14px 20px;padding:0;font-size:14px;line-height:1.6;color:#1f2937;">
          ${bullets.join("")}
        </ul>

        <p style="margin:12px 0;font-size:14px;line-height:1.75;color:#1f2937;text-align:justify;">
          Please confirm your acceptance of this offer by responding to this letter${data.expiresAt ? ` no later than <strong>${data.expiresAt}</strong>` : ""}.
        </p>

        <p style="margin:12px 0 0;font-size:14px;line-height:1.75;color:#1f2937;">
          We look forward to welcoming you to our organization.
        </p>

        <div style="margin:36px 0 0;text-align:right;">
          <p style="margin:0;font-size:14px;color:#111827;">Sincerely,</p>
          <p style="margin:28px 0 0;font-size:18px;font-weight:700;color:#111827;font-family:Georgia,'Times New Roman',serif;font-style:italic;">${signName}</p>
          <p style="margin:2px 0 0;font-size:13px;color:#4b5563;">${signTitle}</p>
          <p style="margin:2px 0 36px;font-size:13px;color:#4b5563;">${data.companyName}</p>
        </div>
      </div>

      <div style="height:14px;background:linear-gradient(90deg,#111827 0%,#111827 45%,#f59e0b 45%,#f59e0b 100%);"></div>
    </div>
  </div>
</body>
</html>`;

  const subject = `Job Offer — ${designation} at ${data.companyName}`;
  return { subject, html };
}
