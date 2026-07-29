/**
 * Transactional email HTML — ported (faithful, whitespace-trimmed) from the
 * legacy AuthService templates: welcome/setup-password, admin password reset,
 * and forgot-password OTP.
 */

// App's own public origin — the platform-standard NEXTAUTH_URL (its Vercel
// domain in prod, localhost in dev). Replaces the app-local FRONTEND_URL.
const FRONTEND_URL = (process.env.NEXTAUTH_URL || 'http://localhost:3014').trim().replace(/\/$/, '');

const ROLE_NAMES: Record<string, string> = {
  SUPER_ADMIN: 'Super Administrator',
  TENANT_ADMIN: 'Tenant Administrator',
  SUB_ADMIN: 'Sub Admin',
  MANAGER: 'Manager',
  TEACHER: 'Teacher',
  PARENT: 'Parent / Guardian',
  LEARNER: 'Learner',
};

export function roleDisplayName(role: string): string {
  return ROLE_NAMES[role] || role;
}

/**
 * Role labels that read correctly for a SCHOOL tenant.
 *
 * A school's administrator is not a "Tenant Administrator", their learners are
 * students and their managers are coordinators. The invitation was previously
 * type-agnostic, so a school head and a corporate L&D lead received identical
 * wording — which is what made a school invite look like it had gone out as a
 * corporate one.
 *
 * Only labels that genuinely differ are overridden; anything absent falls back
 * to the shared name above.
 */
const SCHOOL_ROLE_NAMES: Record<string, string> = {
  TENANT_ADMIN: 'School Administrator',
  SUB_ADMIN: 'School Sub Admin',
  MANAGER: 'Coordinator',
  LEARNER: 'Student',
};

export type TenantKind = 'school' | 'corporate';

export function roleDisplayNameFor(role: string, tenantType?: TenantKind | null): string {
  if (tenantType === 'school' && SCHOOL_ROLE_NAMES[role]) return SCHOOL_ROLE_NAMES[role];
  return roleDisplayName(role);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const shell = (heading: string, sub: string, inner: string) => `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#f4f7fa;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
<div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:40px;border-radius:16px 16px 0 0;text-align:center;">
<h1 style="color:#fff;margin:0;font-size:28px;font-weight:600;">${heading}</h1>
<p style="color:rgba(255,255,255,.9);margin:10px 0 0;font-size:16px;">${sub}</p></div>
<div style="background:#fff;padding:40px;border-radius:0 0 16px 16px;box-shadow:0 4px 20px rgba(0,0,0,.1);">${inner}</div>
<div style="text-align:center;padding:24px;"><p style="color:#9ca3af;font-size:12px;margin:0;">&copy; QuikSkill LMS. All rights reserved.</p></div>
</div></body></html>`;

export function welcomeEmail(firstName: string, email: string, role: string, setupToken: string): { subject: string; html: string } {
  const url = `${FRONTEND_URL}/setup-password?token=${setupToken}&email=${encodeURIComponent(email)}`;
  const inner = `
<p style="color:#374151;font-size:16px;line-height:1.6;">Hello <strong>${escapeHtml(firstName)}</strong>,</p>
<p style="color:#374151;font-size:16px;line-height:1.6;">Your account has been created on QuikSkill LMS. You've been assigned the role of <strong>${roleDisplayName(role)}</strong>.</p>
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:24px;margin:24px 0;">
<h3 style="color:#166534;margin:0 0 16px;font-size:16px;">Your Account Details</h3>
<p style="color:#374151;font-size:14px;margin:0;"><strong>Email:</strong> ${escapeHtml(email)}</p></div>
<p style="color:#374151;font-size:14px;text-align:center;">Click the button below to set your password and activate your account:</p>
<div style="text-align:center;margin:24px 0;"><a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">Set Your Password</a></div>
<p style="color:#9ca3af;font-size:12px;text-align:center;">This password setup link will expire in 365 days.</p>
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:16px 0;">
<p style="color:#6b7280;font-size:13px;margin:0 0 8px;">If the button doesn't work, paste this link into your browser:</p>
<a href="${url}" style="color:#667eea;font-size:12px;word-break:break-all;">${url}</a></div>
<p style="text-align:center;margin:16px 0;"><a href="${FRONTEND_URL}/login" style="color:#667eea;font-weight:600;font-size:14px;text-decoration:none;">${FRONTEND_URL}/login</a></p>`;
  return { subject: 'Welcome to QuikSkill - Your Login Credentials', html: shell('Welcome to QuikSkill!', 'Your learning journey begins now', inner) };
}

/**
 * Invitation / welcome email for a newly provisioned, login-capable account.
 *
 * Used by EVERY user-creation flow (tenant admin onboarding, roster
 * students/teachers/parents, bulk upload) via the centralized identity path
 * (createCentralIdentity). Unlike `welcomeEmail` — whose /setup-password link
 * has no backing route in this build — this template matches the actual
 * centralized-auth mechanism: a temp password seeded in the ORG identity DB with
 * `mustChangePassword: true`, changed on first SSO login.
 *
 * `tempPassword === null` means the invitee already had a platform password
 * (e.g. they belong to another org) — we then send an access-granted notice with
 * no credentials instead of a password.
 */
export function invitationEmail(params: {
  firstName: string;
  email: string;
  role: string;
  orgName?: string;
  tempPassword: string | null;
  loginUrl: string;
  /**
   * Central single-use invitation-accept link
   * (`<auth>/invitations/accept?token=…`). When present it becomes the CTA, so
   * the invitee lands on the platform Set-Password screen and their membership
   * is activated through the canonical accept flow rather than being dropped on
   * a login form. Absent for an already-active member, who has nothing to accept.
   */
  acceptUrl?: string | null;
  /**
   * School vs corporate. Selects the role vocabulary so a school head is
   * invited as a "School Administrator" and their learners as "Students",
   * rather than everyone receiving corporate wording.
   */
  tenantType?: TenantKind | null;
}): { subject: string; html: string } {
  const { firstName, email, role, orgName, tempPassword, loginUrl, acceptUrl, tenantType } = params;
  const roleLabel = roleDisplayNameFor(role, tenantType);
  const org = orgName ? escapeHtml(orgName) : 'your organization';
  // The accept link already carries `?token=…`, so the email param has to be
  // joined with the right separator — a hardcoded `?` produced
  // `…/accept?token=X?email=Y`, which parses `token` as `X?email=Y` and made
  // every token look invalid.
  const ctaTarget = acceptUrl || loginUrl;
  const loginHref = `${ctaTarget}${ctaTarget.includes('?') ? '&' : '?'}email=${encodeURIComponent(email)}`;
  const ctaLabel = acceptUrl ? 'Set up my account' : 'Log in to QuikSkill';

  const credentialsBlock = tempPassword
    ? `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:24px;margin:24px 0;">
<h3 style="color:#166534;margin:0 0 16px;font-size:15px;text-transform:uppercase;letter-spacing:.05em;">Your login credentials</h3>
<p style="color:#374151;font-size:14px;margin:0 0 10px;"><strong>Email:</strong> ${escapeHtml(email)}</p>
<p style="color:#374151;font-size:14px;margin:0;"><strong>Temporary password:</strong> <span style="font-family:ui-monospace,monospace;font-size:16px;color:#14532d;word-break:break-all;">${escapeHtml(tempPassword)}</span></p></div>
<p style="color:#6b7280;font-size:13px;line-height:1.6;">For your security, you'll be asked to set a new password the first time you sign in.</p>`
    : `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:24px;margin:24px 0;">
<p style="color:#1e3a8a;font-size:14px;margin:0;">This account (<strong>${escapeHtml(email)}</strong>) already has a QuikIT password. Sign in with your existing credentials — no new password is needed.</p></div>`;

  const inner = `
<p style="color:#374151;font-size:16px;line-height:1.6;">Hello <strong>${escapeHtml(firstName || 'there')}</strong>,</p>
<p style="color:#374151;font-size:16px;line-height:1.6;">You've been invited to <strong>${org}</strong> on QuikSkill LMS as <strong>${roleLabel}</strong>.</p>
${credentialsBlock}
<div style="text-align:center;margin:28px 0 8px;"><a href="${loginHref}" style="display:inline-block;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">${ctaLabel}</a></div>
<p style="text-align:center;margin:12px 0;"><a href="${loginHref}" style="color:#667eea;font-size:13px;word-break:break-all;text-decoration:none;">${loginHref}</a></p>`;
  return {
    subject: `You've been invited to ${orgName ? orgName + ' on ' : ''}QuikSkill LMS`,
    html: shell('Welcome to QuikSkill!', `You've been invited as ${roleLabel}`, inner),
  };
}

export function adminResetEmail(firstName: string, email: string, newPassword: string): { subject: string; html: string } {
  const loginUrl = `${FRONTEND_URL}/login?email=${encodeURIComponent(email)}`;
  const inner = `
<p style="color:#374151;font-size:16px;line-height:1.6;">Hello <strong>${escapeHtml(firstName || 'there')}</strong>,</p>
<p style="color:#374151;font-size:16px;line-height:1.6;">Your administrator has set a new password for your QuikSkill LMS account.</p>
<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px;margin:0 0 24px;">
<p style="color:#166534;font-size:13px;font-weight:600;margin:0 0 8px;text-transform:uppercase;letter-spacing:.05em;">Your new password</p>
<p style="color:#14532d;font-size:18px;font-family:ui-monospace,monospace;margin:0;word-break:break-all;">${escapeHtml(newPassword)}</p></div>
<div style="text-align:center;margin:24px 0 32px;"><a href="${loginUrl}" style="display:inline-block;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">Log in to QuikSkill</a></div>`;
  return { subject: 'QuikSkill - Your Password Has Been Reset', html: shell('Password Reset', 'Your password has been reset by your administrator', inner) };
}

export function otpEmail(firstName: string, otp: string): { subject: string; html: string } {
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
<h2 style="color:#6366f1;">Password Reset Request</h2>
<p>Hello ${escapeHtml(firstName)},</p>
<p>You have requested to reset your password for your QuikSkill LMS account.</p>
<p>Your OTP code is:</p>
<div style="background:#f3f4f6;padding:20px;text-align:center;margin:20px 0;border-radius:8px;">
<h1 style="color:#6366f1;font-size:32px;margin:0;letter-spacing:8px;">${otp}</h1></div>
<p>This code will expire in 10 minutes.</p>
<p>If you didn't request this, please ignore this email.</p>
<p>Best regards,<br>QuikSkill LMS Team</p></div>`;
  return { subject: 'Password Reset OTP - QuikSkill LMS', html };
}
