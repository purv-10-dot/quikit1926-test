let Resend: typeof import("resend").Resend | null = null;

try {
  // Dynamic import to avoid hard dependency — resend is optional
  Resend = require("resend").Resend;
} catch {
  // resend package not installed — all sends will be no-ops
}

function getClient() {
  if (!Resend || !process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

/** Escape HTML to prevent XSS in email templates */
function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

import { requireProdEnv } from "@quikit/shared/env";

const FROM = "QuikIT <noreply@quikit.app>";

/**
 * Resolved at call time. Prevents a module-import crash if NEXTAUTH_URL is
 * momentarily unset in a preview env that doesn't send emails. In prod,
 * the first send throws clearly; in dev, it falls back to the local port.
 */
function baseUrl(): string {
  return requireProdEnv("NEXTAUTH_URL", "http://localhost:3000"); // prod-safety-allow: dev fallback, prod throws
}

export async function sendMemberAddedEmail(params: {
  to: string;
  orgName: string;
  role: string;
}): Promise<void> {
  const resend = getClient();
  if (!resend) {
    console.log("[email] Would send member-added to", params.to);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: `You've been added to ${params.orgName}`,
    html: `<p>You've been added as <strong>${esc(params.role)}</strong> to <strong>${esc(params.orgName)}</strong> on QuikIT.</p><p><a href="${baseUrl()}/login">Sign in to get started</a></p>`,
  });
}

export async function sendUserCreatedEmail(params: {
  to: string;
  firstName: string;
}): Promise<void> {
  const resend = getClient();
  if (!resend) {
    console.log("[email] Would send welcome to", params.to);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: "Welcome to QuikIT",
    html: `<p>Hi ${esc(params.firstName)},</p><p>Your QuikIT account has been created.</p><p><a href="${baseUrl()}/login">Sign in</a></p>`,
  });
}

export async function sendOrgSuspendedEmail(params: {
  to: string;
  orgName: string;
}): Promise<void> {
  const resend = getClient();
  if (!resend) {
    console.log("[email] Would send org-suspended to", params.to);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: `${params.orgName} has been suspended`,
    html: `<p>The organization <strong>${esc(params.orgName)}</strong> has been suspended on QuikIT. Contact support for more information.</p>`,
  });
}

/**
 * SA-Tech-Debt-3 — send a platform alert notification to super admins.
 *
 * Called from the alerts engine cron when a new critical or warning alert is
 * raised (first-fire) or when an alert escalates from warning to critical.
 * Never sent on refresh — that would flood the inbox.
 */
export async function sendPlatformAlertEmail(params: {
  to: string[];
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  link?: string | null;
}): Promise<void> {
  const resend = getClient();
  if (!resend) {
    console.log("[email] Would send platform alert:", params.title, "to", params.to.join(", "));
    return;
  }
  const severityColor = params.severity === "critical" ? "#dc2626" : params.severity === "warning" ? "#d97706" : "#2563eb";
  const linkHtml = params.link ? `<p><a href="${baseUrl()}${esc(params.link)}" style="color:#4f46e5">Open in QuikIT →</a></p>` : "";
  try {
    await resend.emails.send({
      from: FROM,
      to: params.to,
      subject: `[${params.severity.toUpperCase()}] ${params.title}`,
      html: `
        <div style="font-family:ui-sans-serif,system-ui;max-width:560px">
          <p style="color:${severityColor};text-transform:uppercase;font-size:12px;letter-spacing:1px;font-weight:600">
            Platform ${esc(params.severity)}
          </p>
          <h2 style="margin:8px 0 0 0">${esc(params.title)}</h2>
          <p style="margin-top:8px;color:#374151">${esc(params.message)}</p>
          ${linkHtml}
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
          <p style="color:#6b7280;font-size:12px">
            This is an automated alert from the QuikIT platform. You're
            receiving it because you're listed as a super admin.
          </p>
        </div>`,
    });
  } catch (err) {
    console.error("[email] Failed to send platform alert:", err);
  }
}
