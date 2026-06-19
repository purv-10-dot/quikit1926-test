export interface InvitationEmailData {
  inviteeName: string;
  companyName: string;
  loginUrl: string;
  /** Central QuikIT accept (set-password) URL for new native users; null otherwise. */
  setupUrl?: string | null;
  inviterName?: string | null;
  expiresAt: string; // human-readable date
  /** QuikIT temp password for brand-new accounts; null when the invitee already has a QuikIT login. */
  tempPassword?: string | null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildInvitationEmail(data: InvitationEmailData): { subject: string; html: string } {
  const inviter = data.inviterName ? escapeHtml(data.inviterName) : "Your HR team";
  const company = escapeHtml(data.companyName);
  const name = escapeHtml(data.inviteeName);
  const expires = escapeHtml(data.expiresAt);
  const tempPw = data.tempPassword ? escapeHtml(data.tempPassword) : null;
  // New native users go to the central QuikIT accept flow (set-password); everyone
  // else goes to the normal HRMS sign-in. The accept URL works even if another
  // session is already open in the browser, so it never short-circuits.
  const ctaUrl = data.setupUrl || data.loginUrl;
  const ctaLabel = data.setupUrl ? "Set Up My Account" : `Log in to ${company} HRMS`;

  // New QuikIT accounts get a one-time password block; existing users just sign in.
  const introLine = tempPw
    ? `${inviter} has invited you to join ${company} HRMS.<br>A QuikIT account was created for you — click below, sign in with the temporary password, then set your own.`
    : `${inviter} has invited you to join ${company} HRMS.<br>Sign in with your QuikIT account to get started.`;

  const credentialsBlock = tempPw
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 2px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;">
         <tr><td style="padding:14px 16px;">
           <div style="font-size:11px;letter-spacing:0.4px;text-transform:uppercase;color:#0369a1;font-weight:700;">Temporary QuikIT password</div>
           <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:18px;font-weight:700;color:#0c4a6e;margin-top:6px;letter-spacing:1px;">${tempPw}</div>
           <div style="font-size:12px;color:#475569;margin-top:8px;line-height:1.6;">Click the button below, sign in with this temporary password, then choose your own.</div>
         </td></tr>
       </table>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f1f5f9;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 28px rgba(15,23,42,0.10);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(120deg,#1e3a8a 0%,#2563eb 55%,#3b82f6 100%);padding:26px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;">
                  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                    <td style="vertical-align:middle;padding-right:12px;">
                      <div style="width:42px;height:42px;border-radius:11px;background:rgba(255,255,255,0.16);text-align:center;line-height:42px;font-size:20px;font-weight:800;color:#ffffff;">${company.charAt(0).toUpperCase()}</div>
                    </td>
                    <td style="vertical-align:middle;">
                      <div style="font-size:19px;font-weight:800;color:#ffffff;letter-spacing:-0.2px;line-height:1.1;">${company}</div>
                      <div style="font-size:12px;font-weight:600;color:rgba(255,255,255,0.75);letter-spacing:2px;">HRMS</div>
                    </td>
                  </tr></table>
                </td>
                <td align="right" style="vertical-align:middle;">
                  <!-- envelope illustration -->
                  <table role="presentation" cellpadding="0" cellspacing="0"><tr><td>
                    <div style="position:relative;width:74px;height:54px;background:#ffffff;border-radius:8px;box-shadow:0 6px 14px rgba(0,0,0,0.18);">
                      <div style="width:0;height:0;margin:0 auto;border-left:37px solid transparent;border-right:37px solid transparent;border-top:26px solid #e2e8f0;border-radius:0 0 8px 8px;"></div>
                      <div style="position:absolute;top:9px;left:50%;transform:translateX(-50%);width:22px;height:22px;border-radius:50%;background:#2563eb;text-align:center;line-height:22px;font-size:12px;color:#ffffff;font-weight:700;">${name.charAt(0).toUpperCase()}</div>
                      <div style="position:absolute;bottom:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#22c55e;text-align:center;line-height:20px;color:#ffffff;font-size:12px;font-weight:700;">&#10003;</div>
                    </div>
                  </td></tr></table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:30px 32px 8px;">
            <p style="margin:0;font-size:15px;color:#0f172a;">Hi <strong style="color:#2563eb;">${name}</strong>,</p>
            <h1 style="margin:14px 0 0;font-size:20px;font-weight:800;letter-spacing:-0.3px;color:#0f172a;">
              You're invited to join <span style="color:#2563eb;">${company} HRMS</span>.
            </h1>
            <p style="margin:12px 0 0;font-size:14px;line-height:1.7;color:#475569;">
              ${introLine}
            </p>

            ${credentialsBlock}

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:26px 0 22px;">
              <a href="${ctaUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:13px 30px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700;box-shadow:0 6px 16px rgba(37,99,235,0.30);">${ctaLabel}</a>
            </td></tr></table>
          </td>
        </tr>

        <!-- Info row -->
        <tr>
          <td style="padding:0 32px 8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #eef2f7;border-radius:10px;">
              <tr>
                <td width="48%" style="vertical-align:top;padding:16px;border-right:1px solid #eef2f7;">
                  <div style="font-size:18px;line-height:1;margin-bottom:6px;">&#128338;</div>
                  <div style="font-size:11px;color:#94a3b8;">Please sign in by</div>
                  <div style="font-size:12.5px;font-weight:600;color:#334155;margin-top:2px;">${expires}</div>
                </td>
                <td width="52%" style="vertical-align:top;padding:16px;">
                  <div style="font-size:18px;line-height:1;margin-bottom:6px;">&#128279;</div>
                  <div style="font-size:11px;color:#94a3b8;">Button not working?</div>
                  <div style="font-size:11.5px;color:#475569;margin-top:2px;">Copy and paste this link in your browser:</div>
                  <a href="${ctaUrl}" style="display:inline-block;font-size:11px;color:#2563eb;text-decoration:none;word-break:break-all;margin-top:4px;">${ctaUrl}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:18px 32px 26px;text-align:center;">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;">
              If you weren't expecting this email, you can safely ignore it.<br>
              Need help? <a href="mailto:" style="color:#2563eb;text-decoration:none;font-weight:600;">Contact your HR administrator</a>.
            </p>
            <p style="margin:12px 0 0;font-size:11px;color:#cbd5e1;">© ${new Date().getFullYear()} ${company} HRMS. All rights reserved.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return {
    subject: `You're invited to join ${data.companyName} HRMS`,
    html,
  };
}
