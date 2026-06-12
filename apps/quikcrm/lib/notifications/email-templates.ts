/**
 * Notification email templates + delivery.
 *
 * Uses the existing sendTransactionalEmail() abstraction so the driver
 * (console in dev, Resend in prod) is controlled by the EMAIL_PROVIDER env var.
 * All failures are silently swallowed — email is best-effort and must never
 * surface as an error on the triggering API response.
 */

import { sendTransactionalEmail } from "@/lib/services/email/send";
import { prisma } from "@/lib/db/prisma";
import type { NotificationPayload } from "./types";

// ─── User lookup ──────────────────────────────────────────────────────────────

/** Resolve a user's email from the auth.User table. Returns null on miss. */
async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    return user?.email ?? null;
  } catch {
    return null;
  }
}

// ─── Template builder ─────────────────────────────────────────────────────────

function buildEmailContent(payload: NotificationPayload): {
  subject: string;
  text: string;
  html: string;
} {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    "https://app.quikcrm.com";
  const actionUrl = payload.link ? `${baseUrl}${payload.link}` : baseUrl;

  const subject = payload.title;

  const text = [
    payload.title,
    "",
    payload.body,
    "",
    `View in QuikCRM: ${actionUrl}`,
    "",
    "──────────────────────────────────",
    "You received this because you are assigned to this record in QuikCRM.",
    "Manage your notification preferences in Settings → Profile.",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="540" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;
                      overflow:hidden;max-width:540px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#1e40af;padding:18px 28px;">
              <span style="color:#ffffff;font-size:17px;font-weight:700;
                           letter-spacing:-0.3px;font-family:inherit;">
                QuikCRM
              </span>
              <span style="color:#93c5fd;font-size:13px;font-weight:400;
                           margin-left:10px;font-family:inherit;">
                Notification
              </span>
            </td>
          </tr>

          <!-- Category chip -->
          <tr>
            <td style="padding:20px 28px 0;">
              <span style="display:inline-block;padding:3px 10px;border-radius:20px;
                           background:#eff6ff;color:#1d4ed8;font-size:11px;
                           font-weight:600;letter-spacing:0.4px;text-transform:uppercase;
                           font-family:inherit;">
                ${escHtml(payload.category ?? "notification")}
              </span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:16px 28px 28px;">
              <h2 style="margin:0 0 10px;font-size:18px;font-weight:600;
                         color:#0f172a;line-height:1.35;font-family:inherit;">
                ${escHtml(payload.title)}
              </h2>
              <p style="margin:0 0 24px;font-size:14px;color:#475569;
                        line-height:1.65;font-family:inherit;">
                ${escHtml(payload.body)}
              </p>
              ${
                payload.link
                  ? `<a href="${escHtml(actionUrl)}"
                        style="display:inline-block;padding:9px 20px;
                               background:#1e40af;color:#ffffff;text-decoration:none;
                               border-radius:8px;font-size:13px;font-weight:600;
                               font-family:inherit;">
                        View in QuikCRM →
                      </a>`
                  : ""
              }
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:14px 28px;border-top:1px solid #f1f5f9;">
              <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.6;
                        font-family:inherit;">
                You received this because you are assigned to this record in QuikCRM.
                Manage preferences in
                <a href="${escHtml(baseUrl)}/settings/profile"
                   style="color:#94a3b8;text-decoration:underline;">
                  Settings → Profile
                </a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

// ─── HTML escape helper ───────────────────────────────────────────────────────

function escHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Look up the recipient's email and send a notification email.
 * Throws on hard failure (caller should catch and swallow).
 */
export async function sendNotificationEmail(
  payload: NotificationPayload,
): Promise<void> {
  const email = await getUserEmail(payload.userId);
  if (!email) return; // user not found or no email — skip silently

  const { subject, text, html } = buildEmailContent(payload);
  await sendTransactionalEmail({ to: [email], subject, text, html });
}
