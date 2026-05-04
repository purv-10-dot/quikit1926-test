/**
 * Thin email helpers used by the common auth service. `resend` is optional
 * — if the package or RESEND_API_KEY is absent, sends are logged and skipped
 * so local development works without any secrets.
 */
let Resend: typeof import("resend").Resend | null = null;

try {
  Resend = require("resend").Resend;
} catch {
  // resend not installed — no-op sender
}

function getClient() {
  if (!Resend || !process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FROM = "QuikIT <noreply@quikit.app>";

function authBase(): string {
  return process.env.NEXT_PUBLIC_AUTH_URL ?? "http://localhost:3004";
}

export async function sendVerificationEmail(params: {
  to: string;
  token: string;
}): Promise<void> {
  const link = `${authBase()}/verify-email?token=${encodeURIComponent(params.token)}`;
  const resend = getClient();
  if (!resend) {
    console.log("[auth-email] verify-email link for", params.to, "→", link);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: "Verify your QuikIT email",
    html: `<p>Confirm your email to activate your QuikIT account.</p><p><a href="${link}">Verify email</a></p><p>This link expires in 24 hours.</p>`,
  });
}

export async function sendPasswordResetEmail(params: {
  to: string;
  token: string;
}): Promise<void> {
  const link = `${authBase()}/reset-password?token=${encodeURIComponent(params.token)}`;
  const resend = getClient();
  if (!resend) {
    console.log("[auth-email] reset-password link for", params.to, "→", link);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: "Reset your QuikIT password",
    html: `<p>You asked to reset your password. This link expires in 1 hour.</p><p><a href="${link}">Reset password</a></p><p>If you didn't request this, ignore this email — your password stays the same.</p>`,
  });
}

export async function sendInviteAcceptEmail(params: {
  to: string;
  orgName: string;
  token: string;
}): Promise<void> {
  const link = `${authBase()}/signup?invite=${encodeURIComponent(params.token)}`;
  const resend = getClient();
  if (!resend) {
    console.log("[auth-email] invite link for", params.to, "→", link);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: `You've been invited to ${params.orgName} on QuikIT`,
    html: `<p>Accept the invite and set your password to join <strong>${esc(params.orgName)}</strong>.</p><p><a href="${link}">Accept invite</a></p>`,
  });
}
