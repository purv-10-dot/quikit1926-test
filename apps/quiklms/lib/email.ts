/**
 * Email transport — SMTP (Nodemailer) primary, Resend optional fallback.
 * Mirrors the legacy backend's dual-provider setup.
 *
 * NOTE: template rendering (welcome-kit / course-completion / certificate /
 * upgrade-invoice) and the full send pipeline land in Phase 3. This is the
 * Phase 0 scaffold.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { optionalEnv } from './env';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: optionalEnv('SMTP_HOST'),
    port: Number(optionalEnv('SMTP_PORT') || 587),
    secure: Number(optionalEnv('SMTP_PORT')) === 465,
    auth:
      (optionalEnv('SMTP_USER') || optionalEnv('EMAIL_USER')) &&
      (optionalEnv('SMTP_PASS') || optionalEnv('EMAIL_PASSWORD'))
        ? {
            user: optionalEnv('SMTP_USER') || optionalEnv('EMAIL_USER'),
            pass: optionalEnv('SMTP_PASS') || optionalEnv('EMAIL_PASSWORD'),
          }
        : undefined,
    // Match apps/quikit's known-good Office365 transport (STARTTLS on 587).
    tls: { ciphers: 'SSLv3' },
  });
  return transporter;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

/**
 * Result of a send attempt.
 *
 * `null` means NOT SENT because no transport is configured — the same signal the
 * legacy `EmailService.sendEmail` returned (`email.service.ts`), and callers are
 * expected to branch on it. Returning void here made `sendUpgradeInvoice` record
 * `emailStatus: 'sent'` and tell the super admin "sent successfully" on an
 * environment with no mail credentials, permanently falsifying the audit trail
 * for an invoice the tenant never received.
 */
export type SendEmailResult = { messageId?: string } | null;

export async function sendEmail({ to, subject, html, from }: SendEmailInput): Promise<SendEmailResult> {
  const sender = from || optionalEnv('SMTP_FROM') || 'QuikSkill <no-reply@quikskill.ai>';

  // Prefer SMTP when configured; otherwise try Resend if a key exists.
  if (optionalEnv('SMTP_HOST')) {
    const info = await getTransporter().sendMail({ from: sender, to, subject, html });
    return { messageId: info?.messageId };
  }

  if (optionalEnv('RESEND_API_KEY')) {
    const { Resend } = await import('resend');
    const resend = new Resend(optionalEnv('RESEND_API_KEY'));
    const res = await resend.emails.send({
      from: sender,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    });
    return { messageId: res?.data?.id };
  }

  // eslint-disable-next-line no-console
  console.warn('[email] No SMTP_HOST or RESEND_API_KEY configured; email not sent:', subject);
  return null;
}
