import { Resend } from "resend";
import { requireProdEnv } from "@quikit/shared/env";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder");
  }
  return _resend;
}

/** Resolved lazily so a preview env without APP_URL doesn't crash on import. */
function appUrl(): string {
  return requireProdEnv("APP_URL", "http://localhost:3001"); // prod-safety-allow: dev fallback, prod throws
}

interface InvitationEmailParams {
  to: string;
  orgName: string;
  orgLogoUrl?: string | null;
  orgBrandColor?: string | null;
  inviterName: string;
  role: string;
  token: string;
  /** When true, subject + heading say "Reminder" instead of first-time wording. */
  isReminder?: boolean;
}

const SAFE_HEX = /^#[0-9a-fA-F]{6}$/;
const SAFE_LOGO_URL = /^https:\/\/[a-zA-Z0-9._\-/]+\.(png|jpg|jpeg|svg|gif|webp)$/i;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendInvitationEmail({
  to,
  orgName,
  orgLogoUrl,
  orgBrandColor,
  inviterName,
  role,
  token,
  isReminder,
}: InvitationEmailParams) {
  const acceptUrl = `${appUrl()}/invitations/accept?token=${token}`;
  const safeOrg = escapeHtml(orgName);
  const safeInviter = escapeHtml(inviterName);
  const safeRole = escapeHtml(role);
  const accent = orgBrandColor && SAFE_HEX.test(orgBrandColor) ? orgBrandColor : "#6366f1";
  const headerInner =
    orgLogoUrl && SAFE_LOGO_URL.test(orgLogoUrl)
      ? `<img src="${orgLogoUrl}" alt="${safeOrg}" style="max-height:32px;display:block;" />`
      : `<h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">${safeOrg}</h1>`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(15,23,42,0.07);">
        <div style="background:${accent};padding:32px 40px;">
          ${headerInner}
        </div>
        <div style="padding:40px;">
          <h2 style="margin:0 0 8px;color:#0f172a;font-size:22px;font-weight:600;">${isReminder ? "Reminder: you're invited!" : "You're invited!"}</h2>
          <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">
            <strong>${safeInviter}</strong> has invited you to join <strong>${safeOrg}</strong> as a <strong>${safeRole}</strong>.
          </p>
          <a href="${acceptUrl}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:500;">
            Accept Invitation
          </a>
          <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;line-height:1.5;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${acceptUrl}" style="color:${accent};word-break:break-all;">${acceptUrl}</a>
          </p>
          <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;">This invitation expires in 7 days.</p>
        </div>
        <div style="padding:20px 40px;background:#f8fafc;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:12px;">This invitation was sent by ${safeOrg} via QuikIT. If you didn't expect this, you can ignore this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const subject = isReminder
    ? `Reminder: you're invited to ${orgName}`
    : `You're invited to join ${orgName}`;

  try {
    const { data, error } = await getResend().emails.send({
      from: `${orgName} via QuikIT <onboarding@resend.dev>`,
      to,
      subject,
      html,
    });

    if (error) {
      console.error("Failed to send invitation email:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error("Email send error:", err);
    return { success: false, error: err };
  }
}
