export interface CredentialSet {
  label: string;
  items: Array<{ key: string; value: string }>;
  loginUrl?: string | null;
}

export interface WelcomeEmailData {
  employeeName: string;
  employeeCode: string;
  jobTitle?: string | null;
  department?: string | null;
  dateOfJoining: string;
  managerName?: string | null;
  companyName: string;
  portalUrl?: string | null;
  senderName?: string | null;
  senderPosition?: string | null;
  credentials?: CredentialSet[] | null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function credentialBlock(c: CredentialSet): string {
  return `
    <div style="margin:14px 0 0;padding:14px 18px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#111827;letter-spacing:0.3px;">${escapeHtml(c.label)}</p>
      <table style="border-collapse:collapse;width:100%;">
        ${c.items.map((it) => `
          <tr>
            <td style="padding:4px 12px 4px 0;font-size:13px;color:#6b7280;width:140px;">${escapeHtml(it.key)}</td>
            <td style="padding:4px 0;font-size:13px;color:#111827;font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:600;">${escapeHtml(it.value)}</td>
          </tr>`).join("")}
        ${c.loginUrl ? `
          <tr>
            <td style="padding:4px 12px 4px 0;font-size:13px;color:#6b7280;width:140px;">Login URL</td>
            <td style="padding:4px 0;font-size:13px;"><a href="${c.loginUrl}" style="color:#2563eb;text-decoration:underline;word-break:break-all;">${c.loginUrl}</a></td>
          </tr>` : ""}
      </table>
    </div>`;
}

export function buildWelcomeEmail(data: WelcomeEmailData): { subject: string; html: string } {
  const senderName = data.senderName ?? "HR Department";
  const senderPosition = data.senderPosition ?? "Human Resources";

  const summaryRow = (k: string, v: string) => `
    <tr>
      <td style="padding:6px 12px 6px 0;font-size:13px;color:#6b7280;width:160px;vertical-align:top;">${k}</td>
      <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">${v}</td>
    </tr>`;

  const summary = [
    ["Employee Code", escapeHtml(data.employeeCode)],
    ["Date of Joining", escapeHtml(data.dateOfJoining)],
    data.jobTitle ? ["Role", escapeHtml(data.jobTitle)] : null,
    data.department ? ["Department", escapeHtml(data.department)] : null,
    data.managerName ? ["Reporting Manager", escapeHtml(data.managerName)] : null,
  ].filter((r): r is [string, string] => r !== null);

  const creds = data.credentials ?? [];

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f0fdf4;color:#1f2937;">
  <div style="max-width:680px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

      <div style="background:linear-gradient(135deg,#047857 0%,#10b981 60%,#34d399 100%);padding:32px 36px;color:#ffffff;">
        <p style="margin:0;font-size:11px;letter-spacing:3px;font-weight:700;text-transform:uppercase;opacity:0.9;">Welcome Aboard</p>
        <h1 style="margin:6px 0 0;font-size:24px;font-weight:800;letter-spacing:-0.3px;">Welcome to ${escapeHtml(data.companyName)}!</h1>
      </div>

      <div style="padding:28px 36px 4px;">
        <p style="margin:0;font-size:14px;color:#111827;">Dear <strong>${escapeHtml(data.employeeName)}</strong>,</p>

        <p style="margin:14px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">
          On behalf of the entire <strong>${escapeHtml(data.companyName)}</strong> team, we are delighted to extend a warm and heartfelt welcome to you. We are thrilled to have you join our family and embark on this incredible journey together.
        </p>

        <p style="margin:12px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">
          Your selection as a member of our team signifies the trust and confidence we have in your abilities, and we are confident that you will contribute significantly to our shared success. We believe that each employee brings a unique set of skills and experiences, and we are excited to see how your talents will enrich our organization.
        </p>

        <p style="margin:12px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">
          At ${escapeHtml(data.companyName)}, we are committed to fostering a culture of collaboration, innovation, and continuous growth. We encourage you to ask questions, share your ideas, and embrace new challenges. Our team is here to support you every step of the way as you settle into your role.
        </p>

        <div style="margin:18px 0 0;padding:14px 18px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#065f46;letter-spacing:0.5px;text-transform:uppercase;">Your Onboarding Summary</p>
          <table style="border-collapse:collapse;width:100%;">${summary.map(([k, v]) => summaryRow(k, v)).join("")}</table>
        </div>

        ${creds.length > 0 ? `
          <p style="margin:22px 0 0;font-size:13px;font-weight:700;color:#111827;letter-spacing:0.5px;text-transform:uppercase;">Login Credentials</p>
          <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">Please change your password on first login.</p>
          ${creds.map(credentialBlock).join("")}
        ` : ""}

        ${data.portalUrl ? `
          <div style="text-align:center;margin:24px 0 0;">
            <a href="${data.portalUrl}" style="display:inline-block;background:#10b981;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Open Employee Portal</a>
          </div>` : ""}

        <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">
          If you have any questions, please reach out and we will be happy to help.
        </p>

        <p style="margin:24px 0 0;font-size:14px;color:#111827;">Best regards,</p>
        <p style="margin:20px 0 0;font-size:14px;font-weight:700;color:#111827;">${escapeHtml(senderName)}</p>
        <p style="margin:2px 0 0;font-size:13px;color:#4b5563;">${escapeHtml(senderPosition)}</p>
        <p style="margin:2px 0 28px;font-size:13px;color:#4b5563;">${escapeHtml(data.companyName)}</p>
      </div>

      <div style="background:#f9fafb;padding:14px 36px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #f3f4f6;">
        Please keep your login credentials confidential. This is an automated message from ${escapeHtml(data.companyName)} HRMS.
      </div>
    </div>
  </div>
</body>
</html>`;

  return {
    subject: `Welcome to ${data.companyName}, ${data.employeeName}! — Login credentials inside`,
    html,
  };
}
