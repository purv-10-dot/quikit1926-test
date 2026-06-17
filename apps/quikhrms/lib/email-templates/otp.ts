export interface OtpEmailData {
  inviteeName: string;
  companyName: string;
  otp: string;
  ttlMinutes: number;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Email-OTP for admin 2FA. Plain, scannable layout: the code dominates the
 * body so the recipient can read it at a glance from the email preview.
 */
export function buildOtpEmail(data: OtpEmailData): { subject: string; html: string } {
  const name = escapeHtml(data.inviteeName);
  const company = escapeHtml(data.companyName);
  const otp = escapeHtml(data.otp);

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f1f5f9;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 28px rgba(15,23,42,0.10);">
        <tr>
          <td style="background:linear-gradient(120deg,#1e3a8a 0%,#2563eb 55%,#3b82f6 100%);padding:22px 32px;color:#ffffff;">
            <div style="font-size:11px;letter-spacing:3px;font-weight:700;text-transform:uppercase;opacity:0.85;">${company} HRMS</div>
            <div style="margin-top:4px;font-size:18px;font-weight:800;letter-spacing:-0.2px;">Sign-in verification code</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0;font-size:14px;color:#0f172a;">Hi <strong>${name}</strong>,</p>
            <p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:#475569;">
              Use the code below to finish signing in to your ${company} HRMS admin account.
            </p>
            <div style="margin:22px 0 6px;text-align:center;">
              <div style="display:inline-block;font-family:'SFMono-Regular',Menlo,Monaco,Consolas,monospace;font-size:34px;font-weight:800;letter-spacing:12px;color:#0f172a;background:#f1f5f9;padding:18px 28px;border-radius:12px;border:1px solid #e2e8f0;">${otp}</div>
            </div>
            <p style="margin:14px 0 0;font-size:12.5px;color:#64748b;text-align:center;">
              Valid for ${data.ttlMinutes} minutes. Do not share this code with anyone.
            </p>
            <p style="margin:22px 0 0;font-size:12px;line-height:1.7;color:#94a3b8;">
              If you didn't try to sign in, you can ignore this email — your password is still safe.
              Consider changing it if you receive multiple of these unexpectedly.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 32px 22px;text-align:center;border-top:1px solid #f1f5f9;">
            <p style="margin:0;font-size:11px;color:#cbd5e1;">© ${new Date().getFullYear()} ${company} HRMS. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return {
    subject: `${data.otp} is your ${data.companyName} HRMS sign-in code`,
    html,
  };
}
