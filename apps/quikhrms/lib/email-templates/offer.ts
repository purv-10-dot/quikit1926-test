export interface OfferEmailData {
  candidateName: string;
  jobTitle: string;
  designation?: string | null;
  offeredCTC: number;
  joiningDate: string;
  joiningBonus?: number | null;
  expiresAt?: string | null;
  companyName: string;
  acceptUrl?: string | null;
  companyAddress?: string | null;
  googleMapsUrl?: string | null;
  hrContactName?: string | null;
  hrContactPhone?: string | null;
  hrContactEmail?: string | null;
  managerName?: string | null;
  managerTitle?: string | null;
  reportingTime?: string | null;
  senderName?: string | null;
  senderPosition?: string | null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inr(n: number): string {
  return `&#8377; ${Number(n).toLocaleString("en-IN")}`;
}

const DOCUMENT_CHECKLIST = [
  "Scanned copies of all mark sheets (10th, 12th, graduation / post-graduation)",
  "Scanned copies of PAN Card &amp; Aadhaar Card",
  "Two scanned passport-size photographs (and two physical copies)",
  "Scanned copy of bank passbook or cancelled cheque",
  "Experience letter (if any)",
  "Relieving letter (if any)",
  "Signed copy of each page of the Offer Letter / Contract Agreement, NDA, NSA and NCA",
  "Driving Licence or any other government-issued photo ID",
];

export function buildOfferEmail(data: OfferEmailData): { subject: string; html: string } {
  const senderName = data.senderName ?? "HR Department";
  const senderPosition = data.senderPosition ?? "Human Resources";
  const reportingTime = data.reportingTime ?? "10:00 AM";
  const designation = data.designation ?? data.jobTitle;

  const summaryRow = (k: string, v: string) => `
    <tr>
      <td style="padding:6px 12px 6px 0;font-size:13px;color:#6b7280;width:160px;vertical-align:top;">${k}</td>
      <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">${v}</td>
    </tr>`;

  const summary = [
    ["Designation", escapeHtml(designation)],
    ["Annual CTC", inr(Number(data.offeredCTC))],
    ["Joining Date", escapeHtml(data.joiningDate)],
    data.joiningBonus ? ["Joining Bonus", inr(Number(data.joiningBonus))] : null,
    data.expiresAt ? ["Offer Valid Until", escapeHtml(data.expiresAt)] : null,
  ].filter((r): r is [string, string] => r !== null);

  const locationLine = data.companyAddress
    ? data.googleMapsUrl
      ? `${escapeHtml(data.companyAddress)} &nbsp;·&nbsp; <a href="${data.googleMapsUrl}" style="color:#2563eb;text-decoration:underline;">View on Google Maps</a>`
      : escapeHtml(data.companyAddress)
    : "Address will be shared separately.";

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f0f9ff;color:#1f2937;">
  <div style="max-width:720px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

      <div style="background:linear-gradient(135deg,#6d28d9 0%,#2563eb 60%,#10b981 100%);padding:32px 36px;color:#ffffff;">
        <p style="margin:0;font-size:11px;letter-spacing:3px;font-weight:700;text-transform:uppercase;opacity:0.9;">Offer of Employment</p>
        <h1 style="margin:6px 0 0;font-size:24px;font-weight:800;letter-spacing:-0.3px;">Welcome to ${escapeHtml(data.companyName)}</h1>
      </div>

      <div style="padding:28px 36px 4px;">
        <p style="margin:0;font-size:14px;color:#111827;">Dear <strong>${escapeHtml(data.candidateName)}</strong>,</p>

        <p style="margin:14px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">
          We are all very excited to formally offer you the position of <strong>${escapeHtml(designation)}</strong> at <strong>${escapeHtml(data.companyName)}</strong>. Your background and experience impressed us, and we look forward to having you on the team.
        </p>

        <p style="margin:12px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">
          Your expected starting date is <strong>${escapeHtml(data.joiningDate)}</strong>. At the beginning of your employment you will be asked to sign a contract along with confidentiality, non-disclosure and non-compete agreements.
        </p>

        ${data.expiresAt ? `<p style="margin:12px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">We would appreciate your response by <strong>${escapeHtml(data.expiresAt)}</strong>. The offer will be revoked if joining formalities are not completed by this date.</p>` : ""}

        <div style="margin:18px 0 0;padding:14px 18px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#1e40af;letter-spacing:0.5px;text-transform:uppercase;">Offer Summary</p>
          <table style="border-collapse:collapse;width:100%;">${summary.map(([k, v]) => summaryRow(k, v)).join("")}</table>
        </div>

        <p style="margin:22px 0 0;font-size:13px;font-weight:700;color:#111827;letter-spacing:0.5px;text-transform:uppercase;">Documents to submit on acceptance</p>
        <ol style="margin:8px 0 0;padding-left:20px;font-size:13px;line-height:1.7;color:#1f2937;">
          ${DOCUMENT_CHECKLIST.map((d) => `<li style="margin:3px 0;">${d}</li>`).join("")}
        </ol>

        <div style="margin:22px 0 0;padding:14px 18px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#111827;letter-spacing:0.5px;text-transform:uppercase;">Reporting &amp; Joining Details</p>
          <table style="border-collapse:collapse;width:100%;">
            ${summaryRow("Reporting Time", `${escapeHtml(reportingTime)} on your first day`)}
            ${summaryRow("Location", locationLine)}
          </table>
        </div>

        <p style="margin:22px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">
          ${data.hrContactName ? `<strong>${escapeHtml(data.hrContactName)}</strong>` : "<strong>Our HR team</strong>"} will be your immediate contact person for any queries related to joining, the offer letter and HR policies${data.hrContactPhone ? ` — reach out at <strong>${escapeHtml(data.hrContactPhone)}</strong>` : ""}${data.hrContactEmail ? ` or <a href="mailto:${data.hrContactEmail}" style="color:#2563eb;text-decoration:underline;">${escapeHtml(data.hrContactEmail)}</a>` : ""}.
        </p>

        ${data.managerName ? `<p style="margin:12px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">
          <strong>${escapeHtml(data.managerName)}</strong>${data.managerTitle ? ` (${escapeHtml(data.managerTitle)})` : ""} will be your immediate contact person for project and technology-related discussions and team meetings. Contact details will be shared closer to your joining date.
        </p>` : ""}

        ${data.acceptUrl ? `
          <div style="text-align:center;margin:24px 0 0;">
            <a href="${data.acceptUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700;">Review &amp; Accept Offer</a>
          </div>` : ""}

        <p style="margin:22px 0 0;font-size:13px;color:#6b7280;line-height:1.7;">
          Please find the formal offer letter, along with the NDA, NSA and NCA, attached with this email.
        </p>

        <p style="margin:22px 0 0;font-size:14px;color:#111827;">Best regards,</p>
        <p style="margin:20px 0 0;font-size:14px;font-weight:700;color:#111827;">${escapeHtml(senderName)}</p>
        <p style="margin:2px 0 0;font-size:13px;color:#4b5563;">${escapeHtml(senderPosition)}</p>
        <p style="margin:2px 0 28px;font-size:13px;color:#4b5563;">${escapeHtml(data.companyName)}</p>
      </div>

      <div style="background:#f9fafb;padding:14px 36px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #f3f4f6;">
        ${data.companyAddress ? `${escapeHtml(data.companyAddress)} · ` : ""}Automated message from ${escapeHtml(data.companyName)} HRMS.
      </div>
    </div>
  </div>
</body>
</html>`;

  return {
    subject: `Offer of Employment from ${data.companyName} — ${designation}`,
    html,
  };
}
