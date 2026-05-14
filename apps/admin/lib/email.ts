import nodemailer from "nodemailer";
import {
  renderInvitationEmail,
  sendWithRetry,
  type SendWithRetryResult,
  type RenderInvitationParams,
} from "@quikit/shared";

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (_transporter) return _transporter;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return _transporter;
}

function fromAddress(): string {
  const user = process.env.SMTP_USER ?? "quikitsupport@gmail.com";
  return `"QuikIT Support" <${user}>`;
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Legacy single-template helper kept for back-compat. Newer callers should
 * use sendOnboardingInvitationEmail below — it renders the canonical SSO /
 * Native template from @quikit/shared.
 * ────────────────────────────────────────────────────────────────────────── */

interface InvitationEmailOptions {
  to: string;
  firstName: string;
  orgName: string;
  role: string;
  inviteUrl: string;
  appNames: string[];
}

export async function sendInvitationEmail({
  to,
  firstName,
  orgName,
  role,
  inviteUrl,
  appNames,
}: InvitationEmailOptions): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(
      "[email] SMTP not configured — would send legacy invite to",
      to,
      "(role:",
      role,
      ")",
    );
    return;
  }

  const appList = appNames.length
    ? `<ul style="margin: 0 0 24px; padding-left: 20px; color: #374151;">
        ${appNames.map((a) => `<li style="margin-bottom: 4px;">${a}</li>`).join("")}
       </ul>`
    : "";

  await transporter.sendMail({
    from: fromAddress(),
    to,
    subject: `You've been invited to ${orgName} on QuikIT`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 32px; background: #ffffff;">
        <div style="margin-bottom: 32px;">
          <span style="font-size: 22px; font-weight: 800; color: #4f46e5;">QuikIT</span>
        </div>
        <h1 style="font-size: 22px; font-weight: 700; color: #111827; margin: 0 0 12px;">You've been invited!</h1>
        <p style="color: #6b7280; margin: 0 0 20px; line-height: 1.6;">
          Hi <strong style="color: #111827;">${firstName}</strong>, you've been invited to join
          <strong style="color: #111827;">${orgName}</strong> on the QuikIT platform as a
          <strong style="color: #111827;">${role}</strong>.
        </p>
        ${appNames.length ? `<p style="color: #6b7280; margin: 0 0 8px; font-size: 14px;">You'll have access to:</p>${appList}` : ""}
        <a href="${inviteUrl}" style="display: inline-block; background: #4f46e5; color: #ffffff; padding: 13px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; margin-bottom: 32px;">Accept Invitation →</a>
        <p style="color: #9ca3af; font-size: 12px; margin: 0; border-top: 1px solid #f3f4f6; padding-top: 24px; line-height: 1.6;">
          This invitation expires in 7 days. If you weren't expecting this email, you can safely ignore it.<br/>
          Questions? Reply to this email or contact your organisation administrator.
        </p>
      </div>
    `,
  });
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Canonical onboarding invitation — mirrors apps/quikit/lib/email.ts so the
 * Org-Admin invite flow renders the exact same SSO / Native template the
 * super-admin uses to invite the first Org Admin. Honours FRD §7 (3 retries
 * with back-off) via @quikit/shared/sendWithRetry.
 * ────────────────────────────────────────────────────────────────────────── */

type OnboardingParams = Omit<RenderInvitationParams, "appBaseUrl">;

export async function sendOnboardingInvitationEmail(
  params: OnboardingParams,
): Promise<SendWithRetryResult<unknown>> {
  const transporter = getTransporter();
  // Native-flow set-password URL and SSO CTA both live on the central auth
  // host. Fall back to APP_URL (this app) for local dev so links work even
  // when the central auth isn't pointed at.
  const authBase =
    process.env.NEXT_PUBLIC_AUTH_URL ??
    process.env.APP_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000";

  const { subject, html } = renderInvitationEmail({
    ...params,
    appBaseUrl: authBase,
  });

  if (!transporter) {
    console.log(
      "[email] SMTP not configured — would send onboarding invite to",
      params.to,
      `(method=${params.inviteMethod}${params.ssoProvider ? `/${params.ssoProvider}` : ""})`,
    );
    return { success: true, attempts: 0 };
  }

  return sendWithRetry(
    () =>
      transporter.sendMail({
        from: fromAddress(),
        to: params.to,
        subject,
        html,
      }),
    { label: `onboarding-invite[${params.to}]`, attempts: 3 },
  );
}
