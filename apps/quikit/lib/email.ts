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

const FROM = "QuikIT <noreply@quikit.app>";
const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

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
    html: `<p>You've been added as <strong>${esc(params.role)}</strong> to <strong>${esc(params.orgName)}</strong> on QuikIT.</p><p><a href="${BASE_URL}/login">Sign in to get started</a></p>`,
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
    html: `<p>Hi ${esc(params.firstName)},</p><p>Your QuikIT account has been created.</p><p><a href="${BASE_URL}/login">Sign in</a></p>`,
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
